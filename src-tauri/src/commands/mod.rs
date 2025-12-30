use std::process::Command;
pub mod usn;
pub mod audio;
pub use usn::*;
pub use audio::*;
use std::path::{Path, PathBuf};
use std::fs;
use tauri::{State, AppHandle};
use tauri_plugin_shell::ShellExt;
use base64::{Engine as _, engine::general_purpose};
use mime_guess;
use crate::db::Database;
use crate::models::{Movie, AppConfig, MatchedFile, Material, DetectedPlayer};
use crate::models::tmdb::search_tmdb;
use walkdir::WalkDir;
use strsim;
use regex::Regex;
use crate::models::Person;
#[cfg(target_os = "windows")]
use winreg::HKEY;

// Helper to run ffmpeg/ffprobe either from sidecar or custom path
pub async fn run_media_tool(app: &AppHandle, db: &Database, tool: &str, args: &[&str]) -> Result<(bool, Vec<u8>, Vec<u8>), String> {
    let config = db.get_config();
    
    if let Some(ffmpeg_path) = config.ffmpeg_path {
         if !ffmpeg_path.trim().is_empty() {
            let binary_path = if tool == "ffmpeg" {
                PathBuf::from(&ffmpeg_path)
            } else if tool == "ffprobe" {
                 // Try to find ffprobe in same dir
                 let path = Path::new(&ffmpeg_path);
                 if let Some(parent) = path.parent() {
                     let mut p = parent.join("ffprobe");
                     if let Some(ext) = path.extension() {
                         p.set_extension(ext);
                     }
                     p
                 } else {
                     PathBuf::from("ffprobe")
                 }
            } else {
                 PathBuf::from(tool)
            };

            let args_vec: Vec<String> = args.iter().map(|s| s.to_string()).collect();
            let output = tauri::async_runtime::spawn_blocking(move || {
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    Command::new(binary_path)
                        .args(args_vec)
                        .creation_flags(CREATE_NO_WINDOW)
                        .output()
                }
                #[cfg(not(target_os = "windows"))]
                {
                     Command::new(binary_path)
                        .args(args_vec)
                        .output()
                }
            }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

            return Ok((output.status.success(), output.stdout, output.stderr));
         }
    }
    
    // Sidecar fallback
    let output = app.shell().sidecar(tool)
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
        
    Ok((output.status.success(), output.stdout, output.stderr))
}

#[tauri::command]
pub async fn check_ffmpeg(app: AppHandle, state: State<'_, Database>) -> Result<bool, String> {
    Ok(run_media_tool(&app, &state, "ffmpeg", &["-version"])
        .await
        .map(|(success, _, _)| success)
        .unwrap_or(false))
}

#[tauri::command]
pub async fn get_media_info(app: AppHandle, state: State<'_, Database>, path: String) -> Result<String, String> {
    let (success, stdout, stderr) = run_media_tool(&app, &state, "ffprobe", &["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", &path])
        .await?;

    if success {
        String::from_utf8(stdout).map_err(|e| e.to_string())
    } else {
        Err(String::from_utf8_lossy(&stderr).to_string())
    }
}

#[tauri::command]
pub async fn convert_video(app: AppHandle, state: State<'_, Database>, input: String, output: String, format: String) -> Result<(), String> {
    let mut args = vec!["-i", input.as_str()];
    
    if format == "copy" {
        args.extend_from_slice(&["-c", "copy"]);
    } else if format == "mp4_compatible" {
        args.extend_from_slice(&["-c:v", "libx264", "-c:a", "aac", "-strict", "experimental"]);
    }
    
    args.extend_from_slice(&["-y", output.as_str()]);

    let (success, _, stderr) = run_media_tool(&app, &state, "ffmpeg", &args).await?;
    
    if success {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&stderr).to_string())
    }
}

#[tauri::command]
pub async fn extract_audio(app: AppHandle, state: State<'_, Database>, input: String, output: String) -> Result<(), String> {
    // If input and output are the same, FFmpeg will fail.
    if input == output {
        return Err("Input and output file paths cannot be the same.".to_string());
    }

    let (success, _, stderr) = run_media_tool(&app, &state, "ffmpeg", &["-i", input.as_str(), "-vn", "-y", output.as_str()]).await?;

    if success {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&stderr).to_string())
    }
}

#[tauri::command]
pub async fn extract_subtitles(app: AppHandle, state: State<'_, Database>, input: String, output_dir: String) -> Result<Vec<String>, String> {
    let (success, stdout, stderr) = run_media_tool(&app, &state, "ffprobe", &["-v", "quiet", "-print_format", "json", "-show_streams", "-select_streams", "s", &input]).await?;
        
    if !success {
         return Err(String::from_utf8_lossy(&stderr).to_string());
    }

    let json_str = String::from_utf8(stdout).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
    
    let streams = json["streams"].as_array().ok_or("No streams found")?;
    
    let mut extracted = Vec::new();
    
    for (_i, stream) in streams.iter().enumerate() {
        let index = stream["index"].as_u64().unwrap_or(0);
        let codec = stream["codec_name"].as_str().unwrap_or("srt");
        let lang = stream["tags"]["language"].as_str().unwrap_or("unknown");
        
        let ext = match codec {
            "subrip" => "srt",
            "ass" => "ass",
            "ssa" => "ssa",
            "webvtt" => "vtt",
            "dvd_subtitle" => "sub",
            "hdmv_pgs_subtitle" => "sup",
            _ => "srt"
        };
        
        let file_name = format!("{}_track{}_{}.{}", 
            Path::new(&input).file_stem().unwrap().to_string_lossy(),
            index, 
            lang, 
            ext
        );
        let out_path = Path::new(&output_dir).join(&file_name);
        let out_path_str = out_path.to_str().unwrap();

        let (success, _, _) = run_media_tool(&app, &state, "ffmpeg", &["-i", &input, "-map", &format!("0:{}", index), "-c", "copy", "-y", out_path_str]).await?;
            
        if success {
            extracted.push(file_name);
        }
    }
    
    Ok(extracted)
}

use std::time::{SystemTime, UNIX_EPOCH};

// Helper for downloading images
async fn download_and_save_image(url: &str, folder: &str, config: &AppConfig, db_root: &Path) -> Option<String> {
    if !config.save_images_locally {
        return None;
    }
    
    // Check if it's already a local path or not http
    if !url.starts_with("http") {
        return None;
    }

    let target_dir = if let Some(custom_path) = &config.image_save_path {
        PathBuf::from(custom_path)
    } else {
        db_root.join("images")
    };
    
    let target_dir = target_dir.join(folder);
    if let Err(_) = fs::create_dir_all(&target_dir) {
        return None;
    }
    
    // Generate filename
    // Try to use original filename from URL to reuse existing files
    let filename = url.split('/').last()
        .map(|s| s.split('?').next().unwrap_or(s))
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            // Fallback to timestamp if no filename found
             let extension = Path::new(url)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("jpg")
                .split('?')
                .next()
                .unwrap_or("jpg");
            let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
            format!("{}_{}.{}", timestamp, folder, extension)
        });

    let file_path = target_dir.join(&filename);

    // Check if file already exists
    if file_path.exists() {
        return Some(file_path.to_string_lossy().to_string());
    }
    
    // Download
    match reqwest::get(url).await {
        Ok(resp) => {
            match resp.bytes().await {
                Ok(bytes) => {
                    if let Ok(_) = fs::write(&file_path, bytes) {
                        return Some(file_path.to_string_lossy().to_string());
                    }
                }
                Err(_) => {}
            }
        }
        Err(_) => {}
    }
    
    None
}

#[tauri::command]
pub fn get_movies(state: State<Database>) -> Result<Vec<Movie>, String> {
    Ok(state.get_movies())
}

#[tauri::command]
pub fn read_image(path: String) -> Result<String, String> {
    let content = fs::read(&path).map_err(|e| e.to_string())?;
    let mime = mime_guess::from_path(&path).first_or_octet_stream();
    Ok(format!("data:{};base64,{}", mime.as_ref(), general_purpose::STANDARD.encode(content)))
}

#[tauri::command]
pub fn get_app_info(state: State<Database>) -> crate::models::AppInfo {
    let root = state.get_root_dir();
    crate::models::AppInfo {
        version: format!("v{}", env!("CARGO_PKG_VERSION")),
        db_path: root.join("shuxge.db").to_string_lossy().to_string(),
        default_image_path: root.join("images").to_string_lossy().to_string(),
    }
}

#[tauri::command]
pub async fn add_movie(state: State<'_, Database>, mut movie: Movie) -> Result<Movie, String> {
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

    // 1. Add movie to database first to get an ID
    let added_movie = state.add_movie(movie).map_err(|e| e.to_string())?;

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
            if !Path::new(&file.path).is_absolute() {
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
pub fn set_data_directory(state: State<Database>, path: String) -> Result<(), String> {
    state.move_data_directory(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_movie_details(state: State<Database>, id: u64) -> Result<Option<Movie>, String> {
    Ok(state.get_movie(id))
}

#[tauri::command]
pub fn get_tmdb_details(state: State<Database>, tmdb_id: u64, media_type: Option<String>) -> Result<crate::models::tmdb::TmdbDetailResponse, String> {
    let config = state.get_config();
    let api_key = config.tmdb_api_key.ok_or("TMDB API Key not set")?;
    let proxy = config.proxy;
    let m_type = media_type.unwrap_or_else(|| "movie".to_string());
    crate::models::tmdb::get_movie_details(&api_key, tmdb_id, &m_type, proxy)
}

#[tauri::command]
pub fn get_config(state: State<Database>) -> AppConfig {
    state.get_config()
}

#[tauri::command]
pub fn save_config(state: State<Database>, config: AppConfig) -> Result<(), String> {
    state.save_config(config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_tmdb_movies(state: State<Database>, query: String, page: u64) -> Result<Vec<crate::models::tmdb::TmdbMovie>, String> {
    let config = state.get_config();
    let api_key = config.tmdb_api_key.ok_or("TMDB API Key not set")?;
    let proxy = config.proxy;
    search_tmdb(&api_key, &query, page, proxy)
}

#[tauri::command]
pub fn test_tmdb_connection(api_key: String, proxy: Option<String>) -> Result<bool, String> {
    crate::models::tmdb::test_connection(&api_key, proxy).map(|_| true)
}

fn scan_paths_internal(paths: Vec<String>, titles: Option<Vec<String>>, threshold: f64) -> Vec<MatchedFile> {
    let video_extensions = ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts"];
    let audio_extensions = ["mp3", "flac", "wav", "m4a"];
    let image_extensions = ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tif", "tiff", "svg"];
    let doc_extensions = ["pdf", "doc", "docx", "txt", "nfo", "md", "epub", "mobi", "azw3"];
    let mut local_results = Vec::new();

    for path_str in &paths {
        let path = Path::new(path_str);
        if !path.exists() { continue; }
        
        let walker = WalkDir::new(path).into_iter().filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            // Filter out hidden files/dirs and specific system directories
            if name.starts_with('.') || 
               name == "System Volume Information" || 
               name == "$RECYCLE.BIN" || 
               name == "node_modules" || 
               name == ".git" {
                return false;
            }
            true
        });

        for entry in walker.filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let path = entry.path();
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    let is_video = video_extensions.contains(&ext_lower.as_str());
                    let is_audio = audio_extensions.contains(&ext_lower.as_str());
                    let is_image = image_extensions.contains(&ext_lower.as_str());
                    let is_doc = doc_extensions.contains(&ext_lower.as_str());
                    
                    if is_video || is_audio || is_image || is_doc {
                        let file_type = if is_video { 
                            "video" 
                        } else if is_audio { 
                            "audio" 
                        } else if is_image {
                            "image"
                        } else {
                            "doc"
                        };
                        let file_name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                        
                        let mut similarity = 0.0;
                        
                        if let Some(titles) = &titles {
                            for title in titles {
                                let title_lower = title.to_lowercase();
                                let file_name_lower = file_name.to_lowercase();
                                let mut sim = if file_name_lower == title_lower {
                                    1.0
                                } else if file_name_lower.contains(&title_lower) || title_lower.contains(&file_name_lower) {
                                    0.95
                                } else {
                                    strsim::jaro_winkler(&file_name_lower, &title_lower)
                                };

                                if sim < 1.0 {
                                    if let Ok(rel_path) = path.strip_prefix(Path::new(path_str)) {
                                        if let Some(parent) = rel_path.parent() {
                                            for comp in parent.components() {
                                                let dir_name = comp.as_os_str().to_string_lossy().to_string();
                                                let dir_name_lower = dir_name.to_lowercase();
                                                let dir_sim = if dir_name_lower == title_lower {
                                                    1.0
                                                } else if dir_name_lower.contains(&title_lower) || title_lower.contains(&dir_name_lower) {
                                                    0.95
                                                } else {
                                                    strsim::jaro_winkler(&dir_name_lower, &title_lower)
                                                };
                                                if dir_sim > sim { sim = dir_sim; }
                                            }
                                        }
                                    }
                                }
                                if sim > similarity { similarity = sim; }
                            }
                        } else {
                            similarity = 1.0; 
                        }

                        if similarity >= threshold {
                            let path_str_lossy = path.to_string_lossy();
                            let category = None;

                            local_results.push(MatchedFile {
                                key: path_str_lossy.to_string(),
                                name: file_name,
                                path: path_str_lossy.to_string(),
                                size: entry.metadata().map(|m| m.len().to_string()).unwrap_or_else(|_| "0".to_string()),
                                similarity: (similarity * 100.0) as u8,
                                file_type: file_type.to_string(),
                                category,
                                modified_time: entry.metadata().ok().and_then(|m| m.modified().ok()).map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                            });
                        }
                    }
                }
            }
        }
    }

    // If USN search is requested (implicitly by lack of results or user preference), we can try it.
    // However, USN search returns file names only (currently), not full paths.
    // To make it useful here, we need full paths.
    // For now, let's keep WalkDir as the primary method for specific folder scanning.
    // USN is best for "Search everything for 'Iron Man'" rather than "Search D:\Movies for 'Iron Man'".
    
    // INTEGRATION: If titles are provided, try USN search on the volumes of the paths
    // NOTE: USN search now returns full paths (via OpenFileById), so we can use it fully.
    // DISABLED: User requested to strictly scan only within the configured folders.
    // USN search scans the entire volume which is slow and unnecessary for scoped scans.
    if false { // if let Some(titles) = &titles {
        let titles = titles.as_ref().unwrap();
        if !paths.is_empty() {
             // Extract unique volumes from paths to search each one
             let mut volumes = std::collections::HashSet::new();
             for p in &paths {
                 if let Some(drive_letter) = p.chars().next() {
                     // Normalize drive letter (e.g., 'C')
                     volumes.insert(drive_letter.to_ascii_uppercase());
                 }
             }
             
             for vol_char in volumes {
                 let volume_path = format!("{}:\\", vol_char);
                 println!("[SCAN DEBUG] Starting USN search on volume: {}", volume_path);
                 
                 for title in titles {
                     println!("[SCAN DEBUG] USN searching for title: '{}' on volume '{}'", title, volume_path);
                     // Try USN search for this title on this volume
                     match search_usn_internal(&volume_path, title) {
                        Ok(usn_results) => {
                            println!("[SCAN DEBUG] USN found {} raw results for '{}' on '{}'", usn_results.len(), title, volume_path);
                            for full_path_str in usn_results {
                                // Filter: Must be within one of the requested paths
                                    // Since USN search is volume-wide, we must filter results to be inside the requested folders
                                    let is_in_scope = paths.iter().any(|scope| {
                                        let scope_normalized = scope.replace("\\", "/").to_lowercase();
                                        let path_normalized = full_path_str.replace("\\", "/").to_lowercase();
                                        
                                        // Handle trailing slashes in scope to ensure accurate prefix matching
                                        let scope_clean = scope_normalized.trim_end_matches('/');
                                        
                                        let in_scope = path_normalized.starts_with(scope_clean);
                                        
                                        if !in_scope {
                                            // println!("[SCAN DEBUG] Result '{}' not in scope '{}' (norm: {} vs {})", full_path_str, scope, path_normalized, scope_clean);
                                        }
                                        in_scope
                                    });
                                
                                if !is_in_scope {
                                println!("[SCAN DEBUG] Ignored result (out of scope): {}", full_path_str);
                                continue;
                            } else {
                                println!("[SCAN DEBUG] Scope check passed for: {}", full_path_str);
                            }

                            let path = Path::new(&full_path_str);
                            let file_name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                            let name_lower = file_name.to_lowercase();
                            let title_lower = title.to_lowercase();
                            
                            // 宽松匹配逻辑：只要包含标题即可
                            // 因为 USN 搜索已经是模糊搜索了，这里主要是验证
                            let similarity = if name_lower == title_lower {
                                1.0
                            } else if name_lower.contains(&title_lower) {
                                // 文件名包含标题，例如 "暗泳.mkv" 包含 "暗泳"
                                1.0
                            } else if title_lower.contains(&name_lower) {
                                0.95
                            } else {
                                strsim::jaro_winkler(&name_lower, &title_lower)
                            };
                            
                            println!("[SCAN DEBUG] Comparing '{}' with '{}': similarity = {}", name_lower, title_lower, similarity);

                            if similarity >= threshold {
                                    // Determine file type from extension
                                    let file_type = if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                        let ext_lower = ext.to_lowercase();
                                        if video_extensions.contains(&ext_lower.as_str()) { "video" }
                                        else if audio_extensions.contains(&ext_lower.as_str()) { "audio" }
                                        else if image_extensions.contains(&ext_lower.as_str()) { "image" }
                                        else if doc_extensions.contains(&ext_lower.as_str()) { "doc" }
                                        else { "unknown" }
                                    } else {
                                        "unknown"
                                    };
    
                                    if file_type != "unknown" {
                                            // Check if we already have this file in results to avoid duplicates
                                            let exists = local_results.iter().any(|r| r.path == full_path_str);
                                            if !exists {
                                                println!("[SCAN DEBUG] Added match: {}", full_path_str);
                                                local_results.push(MatchedFile {
                                                    key: full_path_str.clone(), 
                                                    name: file_name,
                                                    path: full_path_str.clone(),
                                                    size: fs::metadata(path).map(|m| m.len().to_string()).unwrap_or_else(|_| "0".to_string()),
                                                    similarity: (similarity * 100.0) as u8,
                                                    file_type: file_type.to_string(),
                                                    category: Some("USN Result".to_string()),
                                                modified_time: fs::metadata(path).ok().and_then(|m| m.modified().ok()).map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                                            });
                                            } else {
                                                println!("[SCAN DEBUG] Duplicate skipped: {}", full_path_str);
                                            }
                                        } else {
                                            println!("[SCAN DEBUG] Unknown file type for: {}", full_path_str);
                                        }
                                    } else {
                                        println!("[SCAN DEBUG] Similarity too low ({} < {}): {}", similarity, threshold, full_path_str);
                                    }
                            }
                        },
                        Err(e) => {
                            println!("[SCAN DEBUG] USN search failed for '{}' on '{}': {}", title, volume_path, e);
                        }
                     }
                 }
             }
        }
    }

    println!("[SCAN INTERNAL DEBUG] Returning total {} local_results", local_results.len());
    
    // Sort results: high similarity first
    local_results.sort_by(|a, b| b.similarity.cmp(&a.similarity));
    
    local_results
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
pub async fn scan_directories(paths: Vec<String>, titles: Option<Vec<String>>, threshold: Option<f64>) -> Result<Vec<MatchedFile>, String> {
    let mut threshold = threshold.unwrap_or(0.8);
    if threshold > 1.0 {
        threshold = threshold / 100.0;
    }

    tauri::async_runtime::spawn_blocking(move || {
        scan_paths_internal(paths, titles, threshold)
    }).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_material_to_movie(state: State<Database>, movie_id: u64, material: Material) -> Result<(), String> {
    state.add_material(movie_id, material).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_material_from_movie(state: State<Database>, movie_id: u64, material_id: String) -> Result<(), String> {
    state.remove_material(movie_id, material_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_file_with_player(state: State<'_, Database>, path: String, player_path: Option<String>) -> Result<(), String> {
    let target_player = if let Some(p) = player_path {
        Some(p)
    } else {
        state.get_config().local_player_path
    };

    if let Some(player) = target_player {
        if !player.trim().is_empty() {
            if Path::new(&player).exists() {
                Command::new(player)
                    .arg(&path)
                    .spawn()
                    .map_err(|e| e.to_string())?;
                return Ok(());
            } 
            // If explicit player path was provided but not found, we might want to error.
            // But if it came from config and is invalid, maybe fallback to default?
            // The user said "selected PotPlayer... did not use this". This implies silent failure or fallback.
            // Let's try to be explicit if possible.
        }
    }

    #[cfg(target_os = "windows")]
    Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
        
    #[cfg(not(target_os = "windows"))]
    return Err("Open default not supported on non-windows".to_string());
    
    Ok(())
}

#[tauri::command]
pub async fn open_directory(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // explorer /select,path opens the parent folder and selects the file
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        use std::path::Path;
        use std::process::Command;
        let p = Path::new(&path);
        let parent = p.parent().unwrap_or(p);
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn fetch_douban_subject(url_or_id: String, is_tv: Option<bool>) -> Result<Movie, String> {
    let mut douban_id = url_or_id.clone();
    
    // Check if it is a URL
    if url_or_id.contains("douban.com") {
        let re = Regex::new(r"subject/(\d+)").map_err(|e| e.to_string())?;
        if let Some(caps) = re.captures(&url_or_id) {
            if let Some(m) = caps.get(1) {
                douban_id = m.as_str().to_string();
            }
        }
    }

    // Use the API from wp-douban (fatesinger.com)
    // Reference: wp-douban-4.4.3/src/functions.php fetch_subject
    // Use /tv/ endpoint if is_tv is explicitly true, otherwise default to /movie/ (which handles redirects)
    let endpoint = if is_tv.unwrap_or(false) { "tv" } else { "movie" };
    let url = format!("https://fatesinger.com/dbapi/{}/{}?ck=xgtY&for_mobile=1", endpoint, douban_id);
    
    println!("Fetching Douban subject: {}", url);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !res.status().is_success() {
         return Err(format!("Douban API returned status: {}", res.status()));
    }

    let data: serde_json::Value = res.json().await.map_err(|e| format!("JSON parse error: {}", e))?;

    // Parse into Movie struct
    let mut movie = Movie::default();
    
    if let Some(title) = data["title"].as_str() {
        movie.title = title.to_string();
    }
    
    if let Some(img) = data["pic"]["large"].as_str() {
        // Try to upgrade to larger image if possible, though 'large' is usually good enough
        movie.poster_path = Some(img.to_string());
    } else if let Some(img) = data["pic"]["normal"].as_str() {
        movie.poster_path = Some(img.to_string());
    }
    
    // Use intro for description if available, fallback to card_subtitle
    if let Some(intro) = data["intro"].as_str() {
        movie.overview = Some(intro.to_string());
    } else if let Some(subtitle) = data["card_subtitle"].as_str() {
        movie.overview = Some(subtitle.to_string());
    }

    // Release date
    if let Some(pubdates) = data["pubdate"].as_array() {
        if let Some(first) = pubdates.first().and_then(|v| v.as_str()) {
             movie.release_date = Some(first.to_string());
        }
    }
    if movie.release_date.is_none() {
        if let Some(year) = data["year"].as_str() {
             movie.release_date = Some(year.to_string());
        } else if let Some(year) = data["year"].as_u64() {
             movie.release_date = Some(year.to_string());
        }
    }
    
    if let Some(rating) = data["rating"]["value"].as_f64() {
        movie.vote_average = Some(rating);
    } else if let Some(rating_str) = data["rating"]["value"].as_str() {
        movie.vote_average = rating_str.parse::<f64>().ok();
    }

    if let Some(genres) = data["genres"].as_array() {
        movie.genres = genres.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
    }

    // Attempt to parse directors and actors if available in the API response
    // Common Douban API structure for these fields
    if let Some(directors) = data["directors"].as_array() {
        for d in directors {
             if let Some(name) = d["name"].as_str() {
                 let clean_name = name.split_whitespace().next().unwrap_or(name).to_string();
                 movie.directors.push(Person {
                     id: 0,
                     name: clean_name,
                     original_name: None,
                     profile_path: d["avatars"]["large"].as_str().map(|s| s.to_string())
                 });
             }
        }
    }

    if let Some(actors) = data["actors"].as_array() {
        for a in actors {
             if let Some(name) = a["name"].as_str() {
                 let clean_name = name.split_whitespace().next().unwrap_or(name).to_string();
                 movie.actors.push(Person {
                     id: 0,
                     name: clean_name,
                     original_name: None,
                     profile_path: a["avatars"]["large"].as_str().map(|s| s.to_string())
                 });
             }
        }
    }

    movie.add_time = chrono::Utc::now().to_rfc3339();
    
    // Determine category
    // The API URL used 'movie' but douban IDs are unique across types usually?
    // Or check data["subtype"] if available
    if let Some(subtype) = data["subtype"].as_str() {
        if subtype == "tv" {
            movie.category = Some("tv".to_string());
        } else {
            movie.category = Some("movie".to_string());
        }
    } else {
        movie.category = Some("movie".to_string());
    }

    Ok(movie)
}

#[tauri::command]
pub fn scan_for_movies(_paths: Vec<String>) -> Result<Vec<MatchedFile>, String> {
    // Stub
    Ok(Vec::new())
}

#[tauri::command]
pub fn clear_data(state: State<Database>) -> Result<(), String> {
    state.clear_all_data().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn backup_database(state: State<Database>, path: String) -> Result<(), String> {
    state.backup(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_database(state: State<Database>, path: String) -> Result<(), String> {
    state.restore(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_cache(state: State<Database>) -> Result<(), String> {
    state.clear_cache().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn detect_local_players() -> Result<Vec<DetectedPlayer>, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::RegKey;
        use winreg::enums::*;
        use crate::models::DetectedPlayer;

        let mut players = Vec::new();
        let mut seen_paths = std::collections::HashSet::new();

        let common_paths = vec![
            ("PotPlayer", r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"),
            ("PotPlayer", r"C:\Program Files (x86)\DAUM\PotPlayer\PotPlayerMini.exe"),
            ("PotPlayer", r"C:\Users\Public\PotPlayer\PotPlayerMini64.exe"),
            ("VLC", r"C:\Program Files\VideoLAN\VLC\vlc.exe"),
            ("VLC", r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe"),
            ("MPC-HC", r"C:\Program Files\MPC-HC\mpc-hc64.exe"),
            ("MPC-HC", r"C:\Program Files (x86)\MPC-HC\mpc-hc.exe"),
            ("IINA", r"C:\Program Files\IINA\IINA.exe"), // Just in case
            ("MPV", r"C:\Program Files\mpv\mpv.exe"),
            ("MPV", r"C:\Program Files (x86)\mpv\mpv.exe"),
        ];

        for (name, path_str) in common_paths {
            if Path::new(path_str).exists() {
                if seen_paths.insert(path_str.to_string()) {
                     players.push(DetectedPlayer {
                        name: name.to_string(),
                        path: path_str.to_string(),
                        icon: None
                    });
                }
            }
        }

        // Helper to check registry uninstall keys
        let check_uninstall_key = |hive: HKEY, subkey: &str, players: &mut Vec<DetectedPlayer>, seen: &mut std::collections::HashSet<String>| {
            let root = RegKey::predef(hive);
            if let Ok(key) = root.open_subkey(subkey) {
                for i in key.enum_keys().map(|x| x.unwrap_or_default()) {
                    if let Ok(sub) = key.open_subkey(&i) {
                        if let Ok(display_name) = sub.get_value::<String, _>("DisplayName") {
                            let lower_name = display_name.to_lowercase();
                            let detected_name = if lower_name.contains("potplayer") {
                                Some("PotPlayer")
                            } else if lower_name.contains("vlc") {
                                Some("VLC")
                            } else if lower_name.contains("mpc-hc") {
                                Some("MPC-HC")
                            } else if lower_name.contains("mpv") {
                                Some("MPV")
                            } else {
                                None
                            };

                            if let Some(name) = detected_name {
                                // Try InstallLocation first
                                let mut install_path = String::new();
                                if let Ok(loc) = sub.get_value::<String, _>("InstallLocation") {
                                    if !loc.is_empty() {
                                        install_path = loc;
                                    }
                                }

                                if install_path.is_empty() {
                                     // Try DisplayIcon
                                     if let Ok(icon) = sub.get_value::<String, _>("DisplayIcon") {
                                         // DisplayIcon often points to the exe
                                         let icon_path = icon.trim_matches('"').split(',').next().unwrap_or(&icon).to_string();
                                         if icon_path.to_lowercase().ends_with(".exe") {
                                             install_path = icon_path;
                                         }
                                     }
                                }

                                if !install_path.is_empty() {
                                    let path_buf = Path::new(&install_path);
                                    let final_path = if path_buf.is_file() {
                                        path_buf.to_path_buf()
                                    } else {
                                        // It's a directory, try to find the exe
                                        if name == "PotPlayer" {
                                            let p1 = path_buf.join("PotPlayerMini64.exe");
                                            if p1.exists() { p1 } else { path_buf.join("PotPlayerMini.exe") }
                                        } else if name == "VLC" {
                                            path_buf.join("vlc.exe")
                                        } else if name == "MPC-HC" {
                                            let p1 = path_buf.join("mpc-hc64.exe");
                                            if p1.exists() { p1 } else { path_buf.join("mpc-hc.exe") }
                                        } else {
                                            path_buf.to_path_buf()
                                        }
                                    };

                                    if final_path.exists() && final_path.is_file() {
                                        let p_str = final_path.to_string_lossy().to_string();
                                        if seen.insert(p_str.clone()) {
                                            players.push(DetectedPlayer {
                                                name: name.to_string(),
                                                path: p_str,
                                                icon: None
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };

        check_uninstall_key(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", &mut players, &mut seen_paths);
        check_uninstall_key(HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall", &mut players, &mut seen_paths);
        check_uninstall_key(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall", &mut players, &mut seen_paths);
        
        // Also check specific registry keys as backup
         let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey("Software\\DAUM\\PotPlayer64") {
            if let Ok(path) = key.get_value::<String, _>("ProgramPath") {
                if Path::new(&path).exists() && seen_paths.insert(path.clone()) {
                    players.push(DetectedPlayer { name: "PotPlayer".to_string(), path, icon: None });
                }
            }
        }

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(key) = hklm.open_subkey("SOFTWARE\\VideoLAN\\VLC") {
            if let Ok(install_dir) = key.get_value::<String, _>("InstallDir") {
                let path = Path::new(&install_dir).join("vlc.exe");
                let path_str = path.to_string_lossy().to_string();
                if path.exists() && seen_paths.insert(path_str.clone()) {
                     players.push(DetectedPlayer { name: "VLC".to_string(), path: path_str, icon: None });
                }
            }
        }

        println!("Detected players: {:?}", players);
        Ok(players)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn rename_movie_file(path: String, new_name: String) -> Result<(), String> {
    let path_obj = Path::new(&path);
    let parent = path_obj.parent().ok_or("Invalid path")?;
    let new_path = parent.join(new_name);
    fs::rename(path, new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_video_files(dir: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        if name.ends_with(".mp4") || name.ends_with(".mkv") || name.ends_with(".avi") {
                            files.push(entry.path().to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    Ok(files)
}

#[tauri::command]
pub fn rename_file_direct(path: String, new_name: String) -> Result<(), String> {
    let path_obj = Path::new(&path);
    let parent = path_obj.parent().ok_or("Invalid path")?;
    let new_path = parent.join(new_name);
    fs::rename(path, new_path).map_err(|e| e.to_string())
}

