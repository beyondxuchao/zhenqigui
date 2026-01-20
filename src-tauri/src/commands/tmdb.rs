use tauri::State;
use crate::db::Database;
use crate::models::tmdb::search_tmdb;

#[tauri::command]
pub fn get_tmdb_details(state: State<Database>, tmdb_id: u64, media_type: Option<String>) -> Result<crate::models::tmdb::TmdbDetailResponse, String> {
    let config = state.get_config();
    let api_key = config.tmdb_api_key.ok_or("TMDB API Key not set")?;
    let proxy = config.proxy;
    let m_type = media_type.unwrap_or_else(|| "movie".to_string());
    crate::models::tmdb::get_movie_details(&api_key, tmdb_id, &m_type, proxy)
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
