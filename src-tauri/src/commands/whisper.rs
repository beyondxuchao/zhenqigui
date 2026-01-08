use tauri::{AppHandle, Emitter, State};
use std::process::Command;
use std::path::Path;
use crate::db::Database;
use std::io::Read;

#[derive(serde::Serialize)]
pub struct WhisperEnvironment {
    python: bool,
    ffmpeg: bool,
    whisper: bool,
    gpu: bool,
    model_path: String,
}

// Helper to get FFmpeg path
fn get_ffmpeg_path(config: &crate::models::AppConfig) -> Option<String> {
    config.ffmpeg_path.clone()
}

// 检查环境
#[tauri::command]
pub async fn check_whisper_environment(state: State<'_, Database>) -> Result<WhisperEnvironment, String> {
    // Get model path from config
    let config = state.get_config();
    let model_path = config.ai_model_path.clone().unwrap_or_else(|| {
        dirs::cache_dir()
            .map(|p| p.join("whisper").to_string_lossy().to_string())
            .unwrap_or("Default System Path".to_string())
    });

    // Check Python
    #[cfg(target_os = "windows")]
    let python = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("python")
            .arg("--version")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    };
    #[cfg(not(target_os = "windows"))]
    let python = Command::new("python")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Check FFmpeg
    let ffmpeg_path = get_ffmpeg_path(&config);
    let ffmpeg_cmd = ffmpeg_path.as_deref().unwrap_or("ffmpeg");

    #[cfg(target_os = "windows")]
    let ffmpeg = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new(ffmpeg_cmd)
            .arg("-version")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    };
    #[cfg(not(target_os = "windows"))]
    let ffmpeg = Command::new(ffmpeg_cmd)
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Check Whisper
    let whisper = if python {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            Command::new("python")
                .arg("-m")
                .arg("pip")
                .arg("show")
                .arg("openai-whisper")
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
        #[cfg(not(target_os = "windows"))]
        {
             Command::new("python")
                .arg("-m")
                .arg("pip")
                .arg("show")
                .arg("openai-whisper")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
    } else {
        false
    };

    // Check GPU (Simple check for nvidia-smi)
    #[cfg(target_os = "windows")]
    let gpu = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("nvidia-smi")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    };

    #[cfg(not(target_os = "windows"))]
    let gpu = Command::new("nvidia-smi")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    Ok(WhisperEnvironment {
        python,
        ffmpeg,
        whisper,
        gpu,
        model_path,
    })
}

// 安装 Whisper
#[tauri::command]
pub async fn install_whisper(app: AppHandle) -> Result<String, String> {
    app.emit("whisper-log", "正在开始安装 OpenAI Whisper...").unwrap_or(());
    
    // Check Python again just in case
    let python_check = Command::new("python")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !python_check {
        return Err("Python 未安装，请先安装 Python 3.8+".to_string());
    }

    #[cfg(target_os = "windows")]
    let mut child = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("python")
            .arg("-m")
            .arg("pip")
            .arg("install")
            .arg("-U")
            .arg("openai-whisper")
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?
    };

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("python")
        .arg("-m")
        .arg("pip")
        .arg("install")
        .arg("-U")
        .arg("openai-whisper")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Handle stdout
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        use std::io::BufRead;
        for line in reader.lines() {
            if let Ok(l) = line {
                app_clone.emit("whisper-log", l).unwrap_or(());
            }
        }
    });
    
    // Handle stderr
    let app_clone2 = app.clone();
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        use std::io::BufRead;
        for line in reader.lines() {
            if let Ok(l) = line {
                app_clone2.emit("whisper-log", format!("LOG: {}", l)).unwrap_or(());
            }
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    
    if status.success() {
        app.emit("whisper-log", "Whisper 安装成功！").unwrap_or(());
        Ok("Installation successful".to_string())
    } else {
        Err("Installation failed".to_string())
    }
}

// 执行 Whisper 字幕生成
#[tauri::command]
pub async fn run_whisper(
    app: AppHandle,
    state: State<'_, Database>,
    input_path: String,
    output_dir: String,
    model: String, // tiny, base, small, medium, large
    language: Option<String>,
    output_format: String, // srt, vtt, txt, all
) -> Result<String, String> {
    app.emit("whisper-progress", 0).unwrap_or(());
    app.emit("whisper-log", format!("正在处理文件: {}", input_path)).unwrap_or(());

    // Construct command: python -u -m whisper input_path --model model --output_dir output_dir --output_format output_format
    
    let mut cmd = Command::new("python");
    cmd.arg("-u"); // Unbuffered output
    cmd.arg("-m").arg("whisper");
    
    cmd.arg(&input_path);
    cmd.arg("--model").arg(&model);
    cmd.arg("--output_dir").arg(&output_dir);
    cmd.arg("--output_format").arg(&output_format);
    
    if let Some(lang) = language {
        if lang != "auto" {
            cmd.arg("--language").arg(lang);
        }
    }

    // Set model path if configured
    let config = state.get_config();
    if let Some(path) = &config.ai_model_path {
        app.emit("whisper-log", format!("使用自定义模型路径: {}", path)).unwrap_or(());
        cmd.arg("--model_dir").arg(path);
    }

    // Ensure FFmpeg is in PATH if configured
    if let Some(ffmpeg_path) = config.ffmpeg_path {
        // ffmpeg_path is usually the executable path, e.g. C:\ffmpeg\bin\ffmpeg.exe
        // We need the directory.
        let ffmpeg_dir = Path::new(&ffmpeg_path).parent().unwrap_or(Path::new(&ffmpeg_path));
        
        // Add to PATH environment variable for the child process
        if let Ok(current_path) = std::env::var("PATH") {
             // Prepend to prioritize our ffmpeg
             let new_path = format!("{};{}", ffmpeg_dir.to_string_lossy(), current_path);
             cmd.env("PATH", new_path);
        } else {
             cmd.env("PATH", ffmpeg_dir.to_string_lossy().to_string());
        }
        app.emit("whisper-log", format!("添加 FFmpeg 路径到环境变量: {}", ffmpeg_dir.to_string_lossy())).unwrap_or(());
    }

    // Capture output to parse progress
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    // Log the full command for debugging
    let cmd_str = format!("{:?}", cmd);
    app.emit("whisper-log", format!("执行命令: {}", cmd_str)).unwrap_or(());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start Whisper: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    
    let app_clone = app.clone();
    
    // Handle stdout
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        use std::io::BufRead;
        for line in reader.lines() {
            if let Ok(l) = line {
                app_clone.emit("whisper-log", l).unwrap_or(());
            }
        }
    });
    
    let app_clone2 = app.clone();
    
    // Handle stderr
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        let mut buffer = Vec::new();
        
        for byte in reader.bytes() {
            match byte {
                Ok(b) => {
                    if b == b'\r' || b == b'\n' {
                        if !buffer.is_empty() {
                            let line = String::from_utf8_lossy(&buffer).to_string();
                            app_clone2.emit("whisper-log", line.clone()).unwrap_or(());
                            buffer.clear();
                        }
                    } else {
                        buffer.push(b);
                    }
                }
                Err(_) => break,
            }
        }
        if !buffer.is_empty() {
             let line = String::from_utf8_lossy(&buffer).to_string();
             app_clone2.emit("whisper-log", line).unwrap_or(());
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;

    if status.success() {
        app.emit("whisper-progress", 100).unwrap_or(());
        app.emit("whisper-log", "处理完成").unwrap_or(());
        
        // Find the output file path to return
        let input_path_obj = Path::new(&input_path);
        let file_stem = input_path_obj.file_stem().unwrap_or_default().to_string_lossy();
        
        // Guess the output filename
        // Whisper usually names it file_stem.srt
        let ext = if output_format == "all" { "srt" } else { &output_format };
        let output_file = Path::new(&output_dir).join(format!("{}.{}", file_stem, ext));
        
        Ok(output_file.to_string_lossy().to_string())
    } else {
        let error_msg = format!("Whisper process failed with exit code: {:?}. Please check the logs above for error details.", status.code());
        app.emit("whisper-log", &error_msg).unwrap_or(());
        Err(error_msg)
    }
}
