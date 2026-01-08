use tauri::{AppHandle, Emitter, State, Manager};
use std::process::Command;
#[allow(unused_imports)]
use std::fs;
use std::path::Path;
use crate::db::Database;
use std::io::Read;
use regex::Regex;

#[derive(serde::Serialize)]
pub struct AiEnvironment {
    python: bool,
    ffmpeg: bool,
    demucs: bool,
    gpu: bool,
    model_path: String,
}

#[derive(serde::Serialize)]
pub struct SeparationResult {
    base_dir: String,
    files: Vec<String>,
}

#[derive(serde::Deserialize)]
pub struct AudioTrackConfig {
    path: String,
    volume: f32,
}

// 检查环境
#[tauri::command]
pub async fn check_ai_environment(state: State<'_, Database>) -> Result<AiEnvironment, String> {
    // Get model path from config
    let config = state.get_config();
    let model_path = config.ai_model_path.unwrap_or_else(|| {
        // Default Torch Hub path logic
        // On Windows: %USERPROFILE%/.cache/torch
        // Demucs specifically uses TORCH_HOME/hub/checkpoints usually
        dirs::cache_dir()
            .map(|p| p.join("torch").join("hub").join("checkpoints").to_string_lossy().to_string())
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
    let ffmpeg_path = config.ffmpeg_path.clone();
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

    // Check Demucs
    let demucs = if python {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            Command::new("pip")
                .arg("show")
                .arg("demucs")
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
        #[cfg(not(target_os = "windows"))]
        {
             Command::new("pip")
                .arg("show")
                .arg("demucs")
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

    Ok(AiEnvironment {
        python,
        ffmpeg,
        demucs,
        gpu,
        model_path,
    })
}

// 安装 Demucs
#[tauri::command]
pub async fn install_demucs(app: AppHandle) -> Result<String, String> {
    app.emit("stem-separation-log", "正在开始安装 Demucs...").unwrap_or(());
    
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
        Command::new("pip")
            .arg("install")
            .arg("-U")
            .arg("demucs")
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?
    };

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("pip")
        .arg("install")
        .arg("-U")
        .arg("demucs")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Handle stdout in a separate thread to prevent blocking
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        use std::io::BufRead;
        for line in reader.lines() {
            if let Ok(l) = line {
                app_clone.emit("stem-separation-log", l).unwrap_or(());
            }
        }
    });
    
    // Handle stderr as well
    let app_clone2 = app.clone();
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        use std::io::BufRead;
        for line in reader.lines() {
            if let Ok(l) = line {
                app_clone2.emit("stem-separation-log", format!("ERR: {}", l)).unwrap_or(());
            }
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    
    if status.success() {
        app.emit("stem-separation-log", "Demucs 安装成功！").unwrap_or(());
        Ok("Installation successful".to_string())
    } else {
        Err("Installation failed".to_string())
    }
}

// 执行人声分离 (Real Demucs)
#[tauri::command]
pub async fn run_stem_separation(
    app: AppHandle,
    state: State<'_, Database>,
    input_path: String,
    output_dir: String,
    model: Option<String>,
    shifts: Option<u32>,
    two_stems: Option<String>
) -> Result<SeparationResult, String> {
    app.emit("stem-separation-progress", 0).unwrap_or(());
    app.emit("stem-separation-log", format!("正在处理文件: {}", input_path)).unwrap_or(());

    // Construct command: demucs -n htdemucs --out output_dir input_path
    
    let mut cmd = Command::new("python");
    
    // Set TORCH_HOME if configured
    let config = state.get_config();
    if let Some(path) = &config.ai_model_path {
        app.emit("stem-separation-log", format!("使用自定义模型路径: {}", path)).unwrap_or(());
        cmd.env("TORCH_HOME", path);
    }

    // Ensure FFmpeg is in PATH if configured (Demucs needs it via audioread/ffmpeg)
    if let Some(ffmpeg_path) = &config.ffmpeg_path {
        let ffmpeg_dir = Path::new(ffmpeg_path).parent().unwrap_or(Path::new(ffmpeg_path));
        
        if let Ok(current_path) = std::env::var("PATH") {
             let new_path = format!("{};{}", ffmpeg_dir.to_string_lossy(), current_path);
             cmd.env("PATH", new_path);
        } else {
             cmd.env("PATH", ffmpeg_dir.to_string_lossy().to_string());
        }
    }

    cmd.arg("-m").arg("demucs");
    
    // Model selection
    let model_name = model.unwrap_or("htdemucs".to_string());
    cmd.arg("-n").arg(&model_name);
    
    cmd.arg("--out").arg(&output_dir);

    // Shifts (quality vs speed)
    if let Some(s) = shifts {
        cmd.arg("--shifts").arg(s.to_string());
    }

    // Two stems mode (vocals + accompaniment)
    if let Some(stem) = &two_stems {
        cmd.arg("--two-stems").arg(stem);
    }
    
    // Enable GPU if available? Demucs does it automatically if PyTorch detects CUDA.
    // But we can check our gpu flag if we want to force device.
    // For now let Demucs decide.

    cmd.arg(&input_path);

    // Capture output to parse progress
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::piped()); // Demucs often prints progress to stderr

    // On Windows, we need to ensure console window is hidden if this was a GUI app without console,
    // but Tauri handles Command creation well.
    // However, `demucs` might be a Python script wrapper. On Windows `pip install` creates `demucs.exe` in Scripts.
    // It should be in PATH if Python is in PATH.

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start Demucs: {}", e))?;

    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    
    // Demucs uses tqdm for progress bars which prints to stderr.
    // Parsing tqdm output is tricky. We can look for percentage like " 56%|".
    let app_clone = app.clone();
    
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        let mut buffer = Vec::new();
        // Regex for parsing percentage: looks for "56%" (one or more digits followed by %)
        let re = Regex::new(r"(\d+)%").unwrap();

        // Use bytes() iterator to handle \r updates
        for byte in reader.bytes() {
            match byte {
                Ok(b) => {
                    // Check for newline or carriage return
                    if b == b'\r' || b == b'\n' {
                        if !buffer.is_empty() {
                            let line = String::from_utf8_lossy(&buffer).to_string();
                            
                            app_clone.emit("stem-separation-log", line.clone()).unwrap_or(());
                            
                            // Parse progress using regex
                            if let Some(caps) = re.captures(&line) {
                                if let Some(m) = caps.get(1) {
                                    if let Ok(p) = m.as_str().parse::<i32>() {
                                        app_clone.emit("stem-separation-progress", p).unwrap_or(());
                                    }
                                }
                            }
                            
                            buffer.clear();
                        }
                    } else {
                        buffer.push(b);
                    }
                }
                Err(_) => break,
            }
        }
        
        // Flush remaining buffer if any
        if !buffer.is_empty() {
             let line = String::from_utf8_lossy(&buffer).to_string();
             app_clone.emit("stem-separation-log", line).unwrap_or(());
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;

    if status.success() {
        app.emit("stem-separation-progress", 100).unwrap_or(());
        app.emit("stem-separation-log", "处理完成").unwrap_or(());
        
        // Calculate result paths
        let input_path_obj = Path::new(&input_path);
        let stem_name = input_path_obj.file_stem().unwrap_or_default().to_string_lossy().to_string();
        
        // Demucs structure: output_dir / model_name / stem_name / files...
        let result_dir = Path::new(&output_dir).join(&model_name).join(&stem_name);
        
        let mut found_files = Vec::new();
        if result_dir.exists() {
             if let Ok(entries) = fs::read_dir(&result_dir) {
                for entry in entries {
                    if let Ok(entry) = entry {
                        if let Ok(file_type) = entry.file_type() {
                            if file_type.is_file() {
                                found_files.push(entry.path().to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }

        Ok(SeparationResult {
            base_dir: result_dir.to_string_lossy().to_string(),
            files: found_files
        })
    } else {
        let error_msg = format!("Demucs process failed with exit code: {:?}. Please check the logs above for error details.", status.code());
        app.emit("stem-separation-log", &error_msg).unwrap_or(());
        Err(error_msg)
    }
}

// 合并音频轨道
#[tauri::command]
pub async fn merge_audio_stems(
    app: AppHandle,
    tracks: Vec<AudioTrackConfig>,
    output_path: String
) -> Result<String, String> {
    if tracks.is_empty() {
        return Err("No tracks to merge".to_string());
    }

    app.emit("stem-separation-log", "正在合并音频...").unwrap_or(());

    // Get config for ffmpeg path
    let config = app.state::<Database>().get_config();
    let ffmpeg_path = config.ffmpeg_path.clone();
    let ffmpeg_cmd = ffmpeg_path.as_deref().unwrap_or("ffmpeg");

    // ffmpeg -i track1 -i track2 ... -filter_complex ... output
    let mut cmd = Command::new(ffmpeg_cmd);
    
    // Add inputs
    for track in &tracks {
        cmd.arg("-i").arg(&track.path);
    }
    
    cmd.arg("-y"); // Overwrite
    
    // Build filter complex
    // [0:a]volume=1.0[a0];[1:a]volume=0.8[a1];[a0][a1]amix=inputs=2[out]
    let mut filter_complex = String::new();
    let mut mix_inputs = String::new();
    
    for (i, track) in tracks.iter().enumerate() {
        filter_complex.push_str(&format!("[{}:a]volume={:.2}[a{}];", i, track.volume, i));
        mix_inputs.push_str(&format!("[a{}]", i));
    }
    
    // Use normalize=0 to prevent volume reduction.
    // By default amix divides volume by number of inputs, which is not what we want for stem recombination.
    filter_complex.push_str(&format!("{}amix=inputs={}:duration=longest:normalize=0[out]", mix_inputs, tracks.len()));
    
    cmd.arg("-filter_complex").arg(filter_complex);
    cmd.arg("-map").arg("[out]");
    cmd.arg(&output_path);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let output = cmd.output().map_err(|e| format!("Failed to run FFmpeg: {}", e))?;
    
    if output.status.success() {
        app.emit("stem-separation-log", format!("合并完成: {}", output_path)).unwrap_or(());
        Ok(output_path)
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg failed: {}", err_msg))
    }
}
