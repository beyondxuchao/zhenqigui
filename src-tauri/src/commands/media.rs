use std::process::Command;
use std::path::{Path, PathBuf};
use std::fs;
use tauri::{State, AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use crate::db::Database;
use regex::Regex;
use serde_json;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SubtitleTrack {
    index: u64,
    codec: String,
    language: String,
    title: Option<String>,
}

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
pub async fn get_subtitle_tracks(app: AppHandle, state: State<'_, Database>, path: String) -> Result<Vec<SubtitleTrack>, String> {
    let (success, stdout, stderr) = run_media_tool(&app, &state, "ffprobe", &["-v", "quiet", "-print_format", "json", "-show_streams", "-select_streams", "s", &path]).await?;
        
    if !success {
         return Err(String::from_utf8_lossy(&stderr).to_string());
    }

    let json_str = String::from_utf8(stdout).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
    
    let streams = json["streams"].as_array();
    
    let mut tracks = Vec::new();
    
    if let Some(streams_arr) = streams {
        for stream in streams_arr {
            let index = stream["index"].as_u64().unwrap_or(0);
            let codec = stream["codec_name"].as_str().unwrap_or("unknown").to_string();
            let lang = stream["tags"]["language"].as_str().unwrap_or("unknown").to_string();
            let title = stream["tags"]["title"].as_str().map(|s| s.to_string());
            
            tracks.push(SubtitleTrack {
                index,
                codec,
                language: lang,
                title,
            });
        }
    }
    
    Ok(tracks)
}

#[tauri::command]
pub async fn convert_srt_to_txt(path: String) -> Result<String, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    
    // Regex to remove timestamps: 00:00:00,000 --> 00:00:00,000
    let re_timestamps = Regex::new(r"(?m)^\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s-->\s\d{1,2}:\d{2}:\d{2}[,.]\d{3}.*?(\r\n|\r|\n)").map_err(|e| e.to_string())?;
    // Regex to remove index numbers: simple digits on a line
    let re_numbers = Regex::new(r"(?m)^\d+(\r\n|\r|\n)").map_err(|e| e.to_string())?;
    // Regex to remove HTML tags
    let re_tags = Regex::new(r"<[^>]*>").map_err(|e| e.to_string())?;

    let no_timestamps = re_timestamps.replace_all(&content, "");
    let no_numbers = re_numbers.replace_all(&no_timestamps, "");
    let clean_text = re_tags.replace_all(&no_numbers, "");

    // Remove empty lines and trim
    let final_text = clean_text.lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<&str>>()
        .join("\n");

    let out_path = Path::new(&path).with_extension("txt");
    fs::write(&out_path, final_text).map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn extract_subtitles(
    app: AppHandle, 
    state: State<'_, Database>, 
    input: String, 
    output_dir: String, 
    selected_tracks: Option<Vec<u64>>, 
    convert_to_srt: Option<bool>
) -> Result<Vec<String>, String> {
    let (success, stdout, stderr) = run_media_tool(&app, &state, "ffprobe", &["-v", "quiet", "-print_format", "json", "-show_streams", "-select_streams", "s", &input]).await?;
        
    if !success {
         return Err(String::from_utf8_lossy(&stderr).to_string());
    }

    let json_str = String::from_utf8(stdout).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
    
    let streams = json["streams"].as_array().ok_or("No streams found")?;
    
    let mut extracted = Vec::new();
    
    // Calculate total for progress
    let mut tracks_to_process = Vec::new();
    for stream in streams {
        let index = stream["index"].as_u64().unwrap_or(0);
        if let Some(ref selection) = selected_tracks {
            if !selection.contains(&index) {
                continue;
            }
        }
        tracks_to_process.push(stream);
    }
    
    let total_tracks = tracks_to_process.len();
    let mut completed_tracks = 0;

    for stream in tracks_to_process {
        let index = stream["index"].as_u64().unwrap_or(0);
        let codec = stream["codec_name"].as_str().unwrap_or("srt");
        let lang = stream["tags"]["language"].as_str().unwrap_or("unknown");
        let title = stream["tags"]["title"].as_str().unwrap_or("");
        
        let should_convert = convert_to_srt.unwrap_or(false) && (codec == "ass" || codec == "ssa" || codec == "subrip" || codec == "mov_text");
        
        let (ext, convert_args) = if should_convert {
            ("srt", vec!["-c:s", "srt"])
        } else {
            let ext = match codec {
                "subrip" => "srt",
                "ass" => "ass",
                "ssa" => "ssa",
                "webvtt" => "vtt",
                "dvd_subtitle" => "sub",
                "hdmv_pgs_subtitle" => "sup",
                "mov_text" => "srt",
                _ => "srt"
            };
            (ext, vec!["-c", "copy"])
        };
        
        // Clean filename construction
        let stem = Path::new(&input).file_stem().unwrap().to_string_lossy();
        let safe_lang = lang.replace(":", "-"); // Sanitize
        let safe_title = if !title.is_empty() {
            format!("_{}", title.replace(" ", "_").replace(":", "-"))
        } else {
            String::new()
        };
        
        let file_name = format!("{}_track{}{}_{}.{}", 
            stem,
            index,
            safe_title,
            safe_lang, 
            ext
        );
        let out_path = Path::new(&output_dir).join(&file_name);
        let out_path_str = out_path.to_str().unwrap();

        // Build args carefully
        let map_arg = format!("0:{}", index);
        let mut args_vec = vec!["-i", input.as_str(), "-map", map_arg.as_str()];
        args_vec.extend(convert_args);
        args_vec.push("-y");
        args_vec.push(out_path_str);
        
        let (success, _, _) = run_media_tool(&app, &state, "ffmpeg", &args_vec).await?;
            
        if success {
            extracted.push(file_name);
        }
        
        completed_tracks += 1;
        let progress = if total_tracks > 0 {
            (completed_tracks as f64 / total_tracks as f64 * 100.0) as u32
        } else {
            100
        };
        let _ = app.emit("extract-progress", progress);
    }
    
    Ok(extracted)
}

#[tauri::command]
pub async fn convert_subtitle_file(
    app: AppHandle,
    state: State<'_, Database>,
    input_path: String,
    target_format: String
) -> Result<String, String> {
    let path = Path::new(&input_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }

    let file_stem = path.file_stem().ok_or("Invalid filename")?.to_string_lossy();
    let parent = path.parent().ok_or("Invalid path")?;
    
    // Check if target is TXT
    if target_format.to_lowercase() == "txt" {
        // First convert to SRT using ffmpeg (to handle various input formats like ASS/SSA/VTT)
        // We use a temporary path or just a sidecar srt file
        let temp_srt_path = parent.join(format!("{}_temp_conversion.srt", file_stem));
        
        let (success, _, stderr) = run_media_tool(&app, &state, "ffmpeg", &[
            "-i", input_path.as_str(),
            "-c:s", "srt",
            "-y",
            temp_srt_path.to_str().unwrap()
        ]).await?;
        
        if !success {
            return Err(format!("FFmpeg conversion failed: {}", String::from_utf8_lossy(&stderr)));
        }
        
        // Read SRT content
        let content = fs::read_to_string(&temp_srt_path).map_err(|e| e.to_string())?;
        
        // Clean up temp file
        let _ = fs::remove_file(&temp_srt_path);
        
        // Use regex logic
        let re_timestamps = Regex::new(r"(?m)^\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s-->\s\d{1,2}:\d{2}:\d{2}[,.]\d{3}.*?(\r\n|\r|\n)").map_err(|e| e.to_string())?;
        let re_numbers = Regex::new(r"(?m)^\d+(\r\n|\r|\n)").map_err(|e| e.to_string())?;
        let re_tags = Regex::new(r"<[^>]*>").map_err(|e| e.to_string())?;
        // Also strip ASS override tags like {\an8}
        let re_ass_tags = Regex::new(r"\{[^}]*\}").map_err(|e| e.to_string())?;

        let no_timestamps = re_timestamps.replace_all(&content, "");
        let no_numbers = re_numbers.replace_all(&no_timestamps, "");
        let no_html = re_tags.replace_all(&no_numbers, "");
        let clean_text = re_ass_tags.replace_all(&no_html, "");

        let final_text = clean_text.lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .collect::<Vec<&str>>()
            .join("\n");
            
        let out_path = parent.join(format!("{}.txt", file_stem));
        fs::write(&out_path, final_text).map_err(|e| e.to_string())?;
        
        return Ok(out_path.to_string_lossy().to_string());
    } else {
        // Normal conversion using FFmpeg
        let out_ext = match target_format.as_str() {
            "srt" => "srt",
            "ass" => "ass",
            "ssa" => "ssa",
            "vtt" => "vtt",
            _ => return Err("Unsupported format".to_string()),
        };
        
        let out_path = parent.join(format!("{}.{}", file_stem, out_ext));
        
        let mut args = vec!["-i", input_path.as_str()];
        
        // Basic mapping
        if out_ext == "vtt" {
             args.extend_from_slice(&["-f", "webvtt"]);
        } else if out_ext == "ass" || out_ext == "ssa" {
             args.extend_from_slice(&["-f", "ass"]);
        } else if out_ext == "srt" {
             args.extend_from_slice(&["-c:s", "srt"]);
        }
        
        args.push("-y");
        args.push(out_path.to_str().unwrap());
        
        let (success, _, stderr) = run_media_tool(&app, &state, "ffmpeg", &args).await?;
        
        if success {
            Ok(out_path.to_string_lossy().to_string())
        } else {
            Err(String::from_utf8_lossy(&stderr).to_string())
        }
    }
}
