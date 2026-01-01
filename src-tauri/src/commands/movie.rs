use tauri::State;
use crate::db::Database;
use crate::models::{Movie, Material};
use crate::commands::common::download_and_save_image;
use crate::commands::files::scan_paths_internal;

#[tauri::command]
pub fn get_movies(state: State<Database>) -> Result<Vec<Movie>, String> {
    Ok(state.get_movies())
}

#[tauri::command]
pub async fn add_movie(state: State<'_, Database>, movie: Movie) -> Result<Movie, String> {
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
            // Update DB
            let actors_json = serde_json::to_string(&movie_to_process.actors).unwrap_or_default();
            let directors_json = serde_json::to_string(&movie_to_process.directors).unwrap_or_default();
            
            if let Err(e) = db.update_movie_images(
                movie_to_process.id, 
                movie_to_process.poster_path, 
                actors_json, 
                directors_json
            ) {
                eprintln!("Failed to update movie images in background: {}", e);
            } else {
                println!("Background image download completed for movie: {}", movie_to_process.title);
            }
        }
    });

    Ok(added_movie)
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

    let paths = movie.matched_folders.clone();
    
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
    let titles: Vec<String> = titles.into_iter().filter(|t| !t.trim().is_empty()).collect();
    
    let threshold = 0.8;
    
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

        if let Some(existing_mat) = movie.materials.iter_mut().find(|m| m.path == file.path) {
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
