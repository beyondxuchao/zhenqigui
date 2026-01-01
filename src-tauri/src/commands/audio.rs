use tauri::{State, AppHandle};
use crate::db::Database;
use serde::{Deserialize, Serialize};
use rusqlite::params;
use crate::commands::media::run_media_tool;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioPreset {
    pub id: i64,
    pub name: String,
    pub input_boost: f64,
    pub max_amplitude: f64,
    pub lookahead: f64,
    pub release_time: f64,
    pub created_at: String,
}

#[tauri::command]
pub fn get_audio_presets(state: State<Database>) -> Result<Vec<AudioPreset>, String> {
    let db_conn = state.get_connection();
    let conn = db_conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, input_boost, max_amplitude, lookahead, release_time, created_at FROM audio_presets ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    
    let preset_iter = stmt.query_map([], |row| {
        Ok(AudioPreset {
            id: row.get(0)?,
            name: row.get(1)?,
            input_boost: row.get(2)?,
            max_amplitude: row.get(3)?,
            lookahead: row.get(4)?,
            release_time: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut presets = Vec::new();
    for preset in preset_iter {
        presets.push(preset.map_err(|e| e.to_string())?);
    }
    
    Ok(presets)
}

#[tauri::command]
pub fn save_audio_preset(
    state: State<Database>, 
    name: String, 
    input_boost: f64, 
    max_amplitude: f64, 
    lookahead: f64, 
    release_time: f64
) -> Result<i64, String> {
    let db_conn = state.get_connection();
    let conn = db_conn.lock().map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO audio_presets (name, input_boost, max_amplitude, lookahead, release_time) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![name, input_boost, max_amplitude, lookahead, release_time],
    ).map_err(|e| e.to_string())?;
    
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn delete_audio_preset(state: State<Database>, id: i64) -> Result<(), String> {
    let db_conn = state.get_connection();
    let conn = db_conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM audio_presets WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn process_audio_limiter(
    app: AppHandle,
    state: State<'_, Database>,
    input: String,
    output: String,
    input_boost: f64,
    max_amplitude: f64,
    lookahead: f64,
    release_time: f64
) -> Result<(), String> {
    // Construct filter complex string
    // e.g. volume=12dB,alimiter=limit=-1dB:attack=5:release=50
    let filter = format!(
        "volume={:.2}dB,alimiter=limit={:.2}dB:attack={:.2}:release={:.2}",
        input_boost, max_amplitude, lookahead, release_time
    );

    let args = vec![
        "-i", &input,
        "-af", &filter,
        "-y", &output
    ];

    let (success, _, stderr) = run_media_tool(&app, &state, "ffmpeg", &args).await?;

    if success {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&stderr).to_string())
    }
}
