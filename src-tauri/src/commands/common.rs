use std::path::{Path, PathBuf};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::models::AppConfig;

// Helper for downloading images
pub async fn download_and_save_image(url: &str, folder: &str, config: &AppConfig, db_root: &Path) -> Option<String> {
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
