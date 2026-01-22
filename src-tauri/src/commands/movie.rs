use tauri::State;
use crate::db::Database;
use crate::models::{Movie, Material, Person};
use crate::commands::common::download_and_save_image;
use crate::commands::files::scan_paths_internal;
use crate::models::tmdb::get_movie_details as fetch_tmdb_details;

#[tauri::command]
pub fn get_movies(state: State<Database>) -> Result<Vec<Movie>, String> {
    Ok(state.get_movies())
}

#[tauri::command]
pub async fn add_movie(state: State<'_, Database>, mut movie: Movie) -> Result<Movie, String> {
    // 0. Auto-populate matched_folders from local_video_path if empty
    if movie.matched_folders.is_empty() {
        if let Some(path_str) = &movie.local_video_path {
            let path = std::path::Path::new(path_str);
            if let Some(parent) = path.parent() {
                movie.matched_folders.push(parent.to_string_lossy().to_string());
            }
        }
    }

    // 1. Add movie to database FIRST to get an ID and return immediately
    // This stores remote URLs initially, which frontend can display
    let added_movie = state.add_movie(movie).map_err(|e| e.to_string())?;

    // 2. Clone state (Database) for background task
    let db = state.inner().clone();
    
    // 3. Clone movie data needed for download
    let mut movie_to_process = added_movie.clone();

    // 4. Spawn background task
    tauri::async_runtime::spawn(async move {
        let config = db.get_config();
        let db_root = db.get_root_dir();
        let mut updated = false;

        // 4.1 Fetch full details from TMDB if not already present (e.g. from search result)
        if let (Some(tmdb_id), Some(api_key)) = (movie_to_process.tmdb_id, &config.tmdb_api_key) {
            let media_type = movie_to_process.category.as_deref().unwrap_or("movie");
            if let Ok(details) = fetch_tmdb_details(api_key, tmdb_id, media_type, config.proxy.clone()).await {
                // Update genres
                if let Some(tmdb_genres) = details.genres {
                    movie_to_process.genres = tmdb_genres.into_iter().map(|g| g.name).collect();
                    updated = true;
                }
                // Update runtime
                if details.runtime.is_some() {
                    movie_to_process.runtime = details.runtime;
                    updated = true;
                }
                // Update credits if not already set
                if let Some(credits) = details.credits {
                    if movie_to_process.actors.is_empty() {
                        movie_to_process.actors = credits.cast.into_iter().take(10).map(|p| Person {
                            id: p.id,
                            name: p.name,
                            original_name: p.original_name,
                            profile_path: p.profile_path.map(|path| format!("https://image.tmdb.org/t/p/h632{}", path)),
                        }).collect();
                        updated = true;
                    }
                    if movie_to_process.directors.is_empty() {
                        movie_to_process.directors = credits.crew.into_iter()
                            .filter(|p| p.job.as_deref() == Some("Director"))
                            .map(|p| Person {
                                id: p.id,
                                name: p.name,
                                original_name: p.original_name,
                                profile_path: p.profile_path.map(|path| format!("https://image.tmdb.org/t/p/h632{}", path)),
                            }).collect();
                        updated = true;
                    }
                }
            }
        }

        // 4.2 Download and cache images
        // Poster
        if let Some(url) = &movie_to_process.poster_path {
             if let Some(local) = download_and_save_image(url, "posters", &config, &db_root).await {
                 movie_to_process.poster_path = Some(local);
                 updated = true;
             }
        }
        
        // Actors
        for actor in &mut movie_to_process.actors {
            if let Some(url) = &actor.profile_path {
                if let Some(local) = download_and_save_image(url, "actors", &config, &db_root).await {
                    actor.profile_path = Some(local);
                    updated = true;
                }
            }
        }
        
        // Directors
        for director in &mut movie_to_process.directors {
             if let Some(url) = &director.profile_path {
                if let Some(local) = download_and_save_image(url, "directors", &config, &db_root).await {
                    director.profile_path = Some(local);
                    updated = true;
                }
            }
        }

        if updated {
            // Update DB with all gathered metadata and local paths
            if let Err(e) = db.update_movie(movie_to_process.clone()) {
                eprintln!("Failed to update movie metadata in background: {}", e);
            } else {
                println!("Background metadata caching completed for movie: {}", movie_to_process.title);
            }
        }
    });

    Ok(added_movie)
}

#[tauri::command]
pub fn update_episode_status(
    state: State<Database>,
    movie_id: u64,
    episode_id: u64,
    status: String,
) -> Result<(), String> {
    let mut movie = state.get_movie(movie_id).ok_or("Movie not found")?;
    
    let mut found = false;
    for episode in &mut movie.episodes {
        if episode.id == episode_id {
            episode.production_status = Some(status.clone());
            found = true;
            break;
        }
    }
    
    if !found {
        return Err("Episode not found".to_string());
    }
    
    state.update_movie(movie).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn auto_match_movie(state: State<'_, Database>, movie_id: u64) -> Result<(), String> {
    let movie = state.get_movie(movie_id).ok_or("Movie not found")?;

    // Perform auto-match
    let config = state.get_config();
    let mut paths = config.default_monitor_folders.clone();
    
    // Track which folder belongs to which category for later association
    // Use normalized paths (lowercase, backslashes) for robust matching
    let mut folder_map = std::collections::HashMap::new();
    
    let normalize_path = |p: &str| -> String {
        let s = p.replace("/", "\\").to_lowercase();
        if !s.ends_with('\\') {
            s + "\\"
        } else {
            s
        }
    };

    for p in &config.default_monitor_folders {
        folder_map.insert(normalize_path(p), None::<String>);
    }
    for p in &config.monitor_folders_source {
        paths.push(p.clone());
        folder_map.insert(normalize_path(p), Some("source".to_string()));
    }
    for p in &config.monitor_folders_finished {
        paths.push(p.clone());
        folder_map.insert(normalize_path(p), Some("finished".to_string()));
    }

    if paths.is_empty() {
        return Ok(());
    }

    let titles = vec![
        Some(movie.title.clone()),
        movie.original_title.clone()
    ].into_iter().flatten().filter(|t| !t.trim().is_empty()).collect::<Vec<_>>();

    // Use shared scan logic (which includes USN search)
    // For auto-match, we want strict matching (essentially 100%) to avoid false positives
    let threshold = 1.0;
    println!("[AUTO MATCH] Starting scan for movie_id: {}", movie_id);
    let scan_results = tauri::async_runtime::spawn_blocking(move || {
        let matched_files = scan_paths_internal(paths, Some(titles), threshold);
        println!("[AUTO MATCH] scan_paths_internal returned {} results", matched_files.len());
        
        let mut materials = Vec::new();
        for file in matched_files {
            // Determine category based on path prefix
            let mut category = None;
            let file_path_norm = file.path.replace("/", "\\").to_lowercase();
            for (folder, cat) in &folder_map {
                if file_path_norm.starts_with(folder) {
                    category = cat.clone();
                    break; 
                }
            }
            
            // If it's a USN result (no full path or category already set), keep existing category
            if file.category.is_some() {
                category = file.category;
            }

            // Skip USN results if they don't have a full path (i.e. path == name)
            // Unless we implement path reconstruction later.
            // For now, if path doesn't look like an absolute path, we can't really use it for materials
            if !std::path::Path::new(&file.path).is_absolute() {
                 continue;
            }

            materials.push(Material {
                id: file.key,
                name: file.name,
                path: file.path,
                size: file.size,
                file_type: file.file_type,
                category: category,
                add_time: chrono::Utc::now().to_rfc3339(),
                modified_time: file.modified_time,
            });
        }
        materials
    }).await.map_err(|e| e.to_string())?;

    if !scan_results.is_empty() {
        // Update the movie in DB with new materials ONLY
        state.add_materials(movie_id, scan_results).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_movie(state: State<Database>, id: u64) -> Result<(), String> {
    state.delete_movie(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_movie(state: State<'_, Database>, mut movie: Movie) -> Result<(), String> {
    let config = state.get_config();
    let db_root = state.get_root_dir();
    
    // Poster
    if let Some(url) = &movie.poster_path {
        if let Some(local) = download_and_save_image(url, "posters", &config, &db_root).await {
            movie.poster_path = Some(local);
        }
    }
    
    // Actors
    for actor in &mut movie.actors {
        if let Some(url) = &actor.profile_path {
            if let Some(local) = download_and_save_image(url, "actors", &config, &db_root).await {
                actor.profile_path = Some(local);
            }
        }
    }
    
    // Directors
    for director in &mut movie.directors {
         if let Some(url) = &director.profile_path {
            if let Some(local) = download_and_save_image(url, "directors", &config, &db_root).await {
                director.profile_path = Some(local);
            }
        }
    }

    state.update_movie(movie).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_movie_status(state: State<Database>, id: u64, status: String) -> Result<(), String> {
    state.update_movie_status(id, status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_movie_details(state: State<Database>, id: u64) -> Result<Option<Movie>, String> {
    Ok(state.get_movie(id))
}

#[tauri::command]
pub async fn refresh_movie_materials(state: State<'_, Database>, movie_id: u64) -> Result<Vec<Material>, String> {
    let mut movie = state.get_movie(movie_id).ok_or("Movie not found")?;

    // Build folder config for category detection
    let config = state.get_config();
    let mut folder_list: Vec<(String, Option<String>)> = Vec::new();
    let normalize_path = |p: &str| -> String {
        let s = p.replace("/", "\\").to_lowercase();
        if !s.ends_with('\\') {
            s + "\\"
        } else {
            s
        }
    };
    for p in &config.default_monitor_folders {
        folder_list.push((normalize_path(p), None));
    }
    for p in &config.monitor_folders_source {
        folder_list.push((normalize_path(p), Some("source".to_string())));
    }
    for p in &config.monitor_folders_finished {
        folder_list.push((normalize_path(p), Some("finished".to_string())));
    }
    // Sort by length descending to match most specific folder first
    folder_list.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

    let mut paths = movie.matched_folders.clone();
    
    // 自动兜底：如果 matched_folders 为空，尝试使用 local_video_path 的父目录
    if paths.is_empty() {
        if let Some(path_str) = &movie.local_video_path {
            let path = std::path::Path::new(path_str);
            if let Some(parent) = path.parent() {
                paths.push(parent.to_string_lossy().to_string());
            }
        }
    }
    
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    
    let mut titles = vec![movie.title.clone()];
    if let Some(t) = &movie.original_title {
        titles.push(t.clone());
    }
    if let Some(aliases) = &movie.aliases {
        titles.extend(aliases.clone());
    }
    
    // 额外优化：将关联文件夹的名称也加入匹配标题中
    // 这样如果文件夹叫“xx 第4季”，里面的文件即使叫“S04E01”也能因为文件夹匹配而被拉入
    for path_str in &paths {
        if let Some(folder_name) = std::path::Path::new(path_str).file_name().map(|n| n.to_string_lossy().to_string()) {
            if !titles.contains(&folder_name) {
                titles.push(folder_name);
            }
        }
    }

    let titles: Vec<String> = titles.into_iter().filter(|t| !t.trim().is_empty()).collect();
    
    // 刷新素材时，使用较低的阈值 (0.5)，以便捕获命名不太规范的相关文件
    let threshold = 0.5;
    
    let matched_files = tauri::async_runtime::spawn_blocking(move || {
        scan_paths_internal(paths, Some(titles), threshold)
    }).await.map_err(|e| e.to_string())?;

    let mut new_materials = Vec::new();
    let mut updated = false;

    for file in matched_files {
        // Determine category first
        let mut category = file.category.clone();
        if category.is_none() {
             let file_path_norm = file.path.replace("/", "\\").to_lowercase();
             
             // 1. Check against configured folders
             for (folder, cat) in &folder_list {
                 if file_path_norm.starts_with(folder) {
                     category = cat.clone();
                     break; 
                 }
             }
             
             // 2. Check for "成片" or "finished" in path components (subdirectories)
             if category.is_none() {
                 if file_path_norm.contains("\\成片\\") || file_path_norm.contains("\\finished\\") {
                     category = Some("finished".to_string());
                 }
             }
        }

        let file_path_norm = file.path.replace("/", "\\").to_lowercase();
        if let Some(existing_mat) = movie.materials.iter_mut().find(|m| m.path.replace("/", "\\").to_lowercase() == file_path_norm) {
            // Update existing material if category changed
            if existing_mat.category != category {
                existing_mat.category = category.clone();
                updated = true;
            }
            // Update other fields if needed
            if existing_mat.size != file.size {
                existing_mat.size = file.size.clone();
                updated = true;
            }
        } else {
            // Add new material
            let mat = Material {
                id: file.key,
                name: file.name,
                path: file.path,
                size: file.size,
                file_type: file.file_type,
                category: category,
                add_time: chrono::Utc::now().to_rfc3339(),
                modified_time: file.modified_time,
            };
            movie.materials.push(mat.clone());
            new_materials.push(mat);
            updated = true;
        }
    }

    if updated {
        state.update_movie(movie).map_err(|e| e.to_string())?;
    }
    
    Ok(new_materials)
}

#[tauri::command]
pub fn add_material_to_movie(state: State<Database>, movie_id: u64, material: Material) -> Result<(), String> {
    state.add_material(movie_id, material).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_material_from_movie(state: State<Database>, movie_id: u64, material_id: String) -> Result<(), String> {
    state.remove_material(movie_id, material_id).map_err(|e| e.to_string())
}
