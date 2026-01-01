use tauri::State;
use crate::db::Database;
use crate::models::AppConfig;

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
pub fn set_data_directory(state: State<Database>, path: String) -> Result<(), String> {
    state.move_data_directory(&path).map_err(|e| e.to_string())
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
