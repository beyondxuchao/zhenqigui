use std::path::Path;
use std::fs;
use std::process::Command;
use tauri::State;
use crate::db::Database;
use crate::models::MatchedFile;
use walkdir::WalkDir;
use strsim;
use crate::commands::usn::search_usn_internal;
use base64::{Engine as _, engine::general_purpose};
use mime_guess;

#[tauri::command]
pub fn read_image(path: String) -> Result<String, String> {
    let content = fs::read(&path).map_err(|e| e.to_string())?;
    let mime = mime_guess::from_path(&path).first_or_octet_stream();
    Ok(format!("data:{};base64,{}", mime.as_ref(), general_purpose::STANDARD.encode(content)))
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
pub fn rename_movie_file(path: String, new_name: String) -> Result<(), String> {
    let path_obj = Path::new(&path);
    let parent = path_obj.parent().ok_or("Invalid path")?;
    let new_path = parent.join(new_name);
    fs::rename(path, new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_dir_files(path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    
    for entry in entries.flatten() {
        if let Ok(file_type) = entry.file_type() {
            if file_type.is_file() {
                files.push(entry.path().to_string_lossy().to_string());
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

#[tauri::command]
pub fn scan_for_movies(_paths: Vec<String>) -> Result<Vec<MatchedFile>, String> {
    // Stub
    Ok(Vec::new())
}

pub fn scan_paths_internal(paths: Vec<String>, titles: Option<Vec<String>>, threshold: f64) -> Vec<MatchedFile> {
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
