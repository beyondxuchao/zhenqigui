use tauri::State;
use crate::db::Database;
use crate::models::tmdb::search_tmdb;

#[tauri::command]
pub async fn get_tmdb_details(state: State<'_, Database>, tmdb_id: u64, media_type: Option<String>) -> Result<crate::models::tmdb::TmdbDetailResponse, String> {
    let config = state.get_config();
    let api_key = config.tmdb_api_key.ok_or("TMDB API Key not set")?;
    let proxy = config.proxy;
    let m_type = media_type.unwrap_or_else(|| "movie".to_string());
    crate::models::tmdb::get_movie_details(&api_key, tmdb_id, &m_type, proxy).await
}

#[tauri::command]
pub async fn get_tmdb_season_details(state: State<'_, Database>, tv_id: u64, season_number: u32) -> Result<crate::models::tmdb::TmdbSeasonDetail, String> {
    let config = state.get_config();
    let api_key = config.tmdb_api_key.ok_or("TMDB API Key not set")?;
    let proxy = config.proxy;
    crate::models::tmdb::get_season_details(&api_key, tv_id, season_number, proxy).await
}

#[tauri::command]
pub async fn search_tmdb_movies(state: State<'_, Database>, query: String, page: Option<u32>) -> Result<Vec<crate::models::tmdb::TmdbMovie>, String> {
    let config = state.get_config();
    let api_key = config.tmdb_api_key.ok_or("TMDB API Key not set")?;
    let proxy = config.proxy;
    let page_num = page.unwrap_or(1) as u64;
    search_tmdb(&api_key, &query, page_num, proxy).await
}

#[tauri::command]
pub async fn test_tmdb_connection(api_key: String, proxy: Option<String>) -> Result<bool, String> {
    crate::models::tmdb::test_connection(&api_key, proxy).await.map(|_| true)
}
