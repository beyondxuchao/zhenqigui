use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Movie {
    pub id: u64,
    pub tmdb_id: Option<u64>,
    pub title: String,
    pub original_title: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub release_date: Option<String>,
    pub vote_average: Option<f64>,
    pub local_video_path: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub add_time: String,
    pub remark: Option<String>,
    pub viewing_date: Option<String>,
    pub category: Option<String>, // "movie" or "tv"
    pub production_status: Option<String>, // "made", "unmade", "pending"
    #[serde(default)]
    pub matched_folders: Vec<String>, // Folders manually added/scanned for this movie
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub actors: Vec<Person>,
    #[serde(default)]
    pub directors: Vec<Person>,
    #[serde(default)]
    pub materials: Vec<Material>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Person {
    pub id: u64,
    pub name: String,
    pub original_name: Option<String>,
    pub profile_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Material {
    pub id: String, // UUID or path hash
    pub name: String,
    pub path: String,
    pub size: String,
    #[serde(alias = "type")]
    pub file_type: String,
    #[serde(default)]
    pub category: Option<String>,
    pub add_time: String,
    #[serde(default)]
    pub modified_time: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub tmdb_api_key: Option<String>,
    pub match_threshold: Option<f64>, // For future material matching
    pub theme: Option<String>,
    #[serde(default)]
    pub primary_color: Option<String>,
    #[serde(default)]
    pub proxy: Option<String>,
    #[serde(default)]
    pub save_images_locally: bool,
    pub image_save_path: Option<String>,
    #[serde(default)]
    pub default_monitor_folders: Vec<String>,
    #[serde(default)]
    pub monitor_folders_source: Vec<String>,
    #[serde(default)]
    pub monitor_folders_finished: Vec<String>,
    pub local_player_path: Option<String>,
    pub ffmpeg_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MatchedFile {
    pub key: String,
    pub name: String,
    pub path: String,
    pub size: String,
    pub similarity: u8,
    #[serde(alias = "type")]
    pub file_type: String, // video, image, doc, audio, other
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub modified_time: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            tmdb_api_key: None,
            match_threshold: Some(0.8),
            theme: Some("light".to_string()),
            primary_color: Some("#1677ff".to_string()),
            proxy: None,
            save_images_locally: true,
            image_save_path: None,
            default_monitor_folders: Vec::new(),
            monitor_folders_source: Vec::new(),
            monitor_folders_finished: Vec::new(),
            local_player_path: None,
            ffmpeg_path: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppData {
    pub movies: Vec<Movie>,
    #[serde(default)]
    pub config: AppConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppInfo {
    pub version: String,
    pub db_path: String,
    pub default_image_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScannedFile {
    pub path: String,
    pub name: String,
    pub parent_folder: String,
    pub search_query: String,
}

pub mod tmdb;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectedPlayer {
    pub name: String,
    pub path: String,
    pub icon: Option<String>, // Reserved for future use
}
