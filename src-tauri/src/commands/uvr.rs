use std::process::Command;
use tauri::{AppHandle, Emitter};
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(serde::Serialize)]
pub struct UvrEnvStatus {
    python: bool,
    audio_separator: bool,
    gpu: bool,
}

#[tauri::command]
pub async fn check_uvr_env() -> Result<UvrEnvStatus, String> {
    // Check Python
    let python = Command::new("python")
        .arg("--version")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Check audio-separator
    let audio_separator = if python {
        let output = Command::new("python")
            .args(&["-m", "audio_separator", "--version"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
            
        match output {
            Ok(o) => {
                if !o.status.success() {
                    println!("Check audio-separator failed: stderr={}", String::from_utf8_lossy(&o.stderr));
                }
                o.status.success()
            },
            Err(e) => {
                println!("Check audio-separator execution failed: {}", e);
                false
            }
        }
    } else {
        false
    };

    // Check GPU (Basic check for nvidia-smi)
    let gpu = Command::new("nvidia-smi")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    Ok(UvrEnvStatus {
        python,
        audio_separator,
        gpu,
    })
}

#[tauri::command]
pub async fn install_uvr(app: AppHandle, use_gpu: bool) -> Result<(), String> {
    let package = if use_gpu {
        "audio-separator[gpu]"
    } else {
        "audio-separator[cpu]"
    };

    let _ = app.emit("uvr-log", format!("Starting installation of {}...", package));

    // Use python -m pip to ensure we install to the same python environment we check against
    let mut cmd = Command::new("python");
    cmd.args(&["-m", "pip", "install", package, "--upgrade"]);
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().map_err(|e| e.to_string())?;

    if output.status.success() {
        let _ = app.emit("uvr-log", "Installation successful!".to_string());
        Ok(())
    } else {
        let error = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = app.emit("uvr-log", format!("Installation failed: {}", error));
        Err(error)
    }
}

#[tauri::command]
pub async fn run_uvr(
    app: AppHandle,
    input_path: String,
    output_dir: String,
    model_name: String,
    output_format: String,
) -> Result<(), String> {
    let _ = app.emit("uvr-log", format!("Processing file: {}", input_path));
    let _ = app.emit("uvr-log", format!("Using model: {}", model_name));

    let args = vec![
        "-m", "audio_separator",
        &input_path,
        "--model_filename", &model_name,
        "--output_dir", &output_dir,
        "--output_format", &output_format,
        "--log_level", "INFO",
    ];

    // Ensure we run this in a way that captures output line by line if possible, 
    // but for simplicity in this first pass, we'll just run it.
    // Ideally we should use a command that streams stdout/stderr to the frontend.
    
    // Using Tauri's Command (std::process::Command here actually)
    // We'll wrap it in python -m audio_separator to be safe about PATH
    
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;

    let mut child = Command::new("python")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_clone.emit("uvr-log", l);
            }
        }
    });

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                // audio-separator logs mostly to stderr for progress
                let _ = app_clone.emit("uvr-log", l);
            }
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;

    if status.success() {
        let _ = app.emit("uvr-log", "Processing complete!".to_string());
        Ok(())
    } else {
        Err("Process exited with error".to_string())
    }
}
