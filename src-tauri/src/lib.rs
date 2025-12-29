mod db;
mod models;
mod commands;
mod drag;

use db::Database;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Database::new().expect("Failed to initialize database");

    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("asset", |_ctx, request, responder| {
            let path = request.uri().path();
            let path = percent_encoding::percent_decode_str(path)
                .decode_utf8_lossy()
                .to_string();
            
            // On Windows, the path might start with a slash that we need to remove
            // e.g. /C:/Users/... -> C:/Users/...
            let path = if cfg!(windows) && path.starts_with('/') {
                &path[1..]
            } else {
                &path
            };

            let path = std::path::PathBuf::from(path);
            
            match std::fs::read(&path) {
                Ok(data) => {
                    let mime_type = mime_guess::from_path(&path).first_or_octet_stream();
                    responder.respond(
                        tauri::http::Response::builder()
                            .header("Access-Control-Allow-Origin", "*")
                            .header("Content-Type", mime_type.as_ref())
                            .body(data)
                            .unwrap()
                    );
                }
                Err(_) => {
                    responder.respond(
                        tauri::http::Response::builder()
                            .status(404)
                            .body(Vec::new())
                            .unwrap()
                    );
                }
            }
        })
        .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(db)
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_movies,
            commands::read_image,
            commands::get_app_info,
            commands::add_movie,
            commands::auto_match_movie,
            commands::delete_movie,
            commands::update_movie,
            commands::update_movie_status,
            commands::get_movie_details,
            commands::get_tmdb_details,
            commands::get_config,
            commands::save_config,
            commands::search_tmdb_movies,
            commands::test_tmdb_connection,
            commands::scan_directories,
            commands::refresh_movie_materials,
            commands::add_material_to_movie,
            commands::remove_material_from_movie,
            commands::open_file_with_player,
            commands::fetch_douban_subject,
            commands::scan_for_movies,
            commands::clear_data,
            commands::backup_database,
            commands::restore_database,
            commands::clear_cache,
            commands::set_data_directory,
            commands::detect_local_players,
            commands::rename_movie_file,
            commands::list_video_files,
            commands::rename_file_direct,
            commands::check_ffmpeg,
            commands::get_media_info,
            commands::convert_video,
            commands::extract_audio,
            commands::extract_subtitles,
            commands::search_usn_journal,
            commands::open_directory,
            drag::drag_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
