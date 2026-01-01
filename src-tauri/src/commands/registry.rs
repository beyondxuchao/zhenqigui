use std::path::Path;
use crate::models::DetectedPlayer;
#[cfg(target_os = "windows")]
use winreg::HKEY;

#[tauri::command]
pub fn detect_local_players() -> Result<Vec<DetectedPlayer>, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::RegKey;
        use winreg::enums::*;
        use crate::models::DetectedPlayer;

        let mut players = Vec::new();
        let mut seen_paths = std::collections::HashSet::new();

        let common_paths = vec![
            ("PotPlayer", r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"),
            ("PotPlayer", r"C:\Program Files (x86)\DAUM\PotPlayer\PotPlayerMini.exe"),
            ("PotPlayer", r"C:\Users\Public\PotPlayer\PotPlayerMini64.exe"),
            ("VLC", r"C:\Program Files\VideoLAN\VLC\vlc.exe"),
            ("VLC", r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe"),
            ("MPC-HC", r"C:\Program Files\MPC-HC\mpc-hc64.exe"),
            ("MPC-HC", r"C:\Program Files (x86)\MPC-HC\mpc-hc.exe"),
            ("IINA", r"C:\Program Files\IINA\IINA.exe"), // Just in case
            ("MPV", r"C:\Program Files\mpv\mpv.exe"),
            ("MPV", r"C:\Program Files (x86)\mpv\mpv.exe"),
        ];

        for (name, path_str) in common_paths {
            if Path::new(path_str).exists() {
                if seen_paths.insert(path_str.to_string()) {
                     players.push(DetectedPlayer {
                        name: name.to_string(),
                        path: path_str.to_string(),
                        icon: None
                    });
                }
            }
        }

        // Helper to check registry uninstall keys
        let check_uninstall_key = |hive: HKEY, subkey: &str, players: &mut Vec<DetectedPlayer>, seen: &mut std::collections::HashSet<String>| {
            let root = RegKey::predef(hive);
            if let Ok(key) = root.open_subkey(subkey) {
                for i in key.enum_keys().map(|x| x.unwrap_or_default()) {
                    if let Ok(sub) = key.open_subkey(&i) {
                        if let Ok(display_name) = sub.get_value::<String, _>("DisplayName") {
                            let lower_name = display_name.to_lowercase();
                            let detected_name = if lower_name.contains("potplayer") {
                                Some("PotPlayer")
                            } else if lower_name.contains("vlc") {
                                Some("VLC")
                            } else if lower_name.contains("mpc-hc") {
                                Some("MPC-HC")
                            } else if lower_name.contains("mpv") {
                                Some("MPV")
                            } else {
                                None
                            };

                            if let Some(name) = detected_name {
                                // Try InstallLocation first
                                let mut install_path = String::new();
                                if let Ok(loc) = sub.get_value::<String, _>("InstallLocation") {
                                    if !loc.is_empty() {
                                        install_path = loc;
                                    }
                                }

                                if install_path.is_empty() {
                                     // Try DisplayIcon
                                     if let Ok(icon) = sub.get_value::<String, _>("DisplayIcon") {
                                         // DisplayIcon often points to the exe
                                         let icon_path = icon.trim_matches('"').split(',').next().unwrap_or(&icon).to_string();
                                         if icon_path.to_lowercase().ends_with(".exe") {
                                             install_path = icon_path;
                                         }
                                     }
                                }

                                if !install_path.is_empty() {
                                    let path_buf = Path::new(&install_path);
                                    let final_path = if path_buf.is_file() {
                                        path_buf.to_path_buf()
                                    } else {
                                        // It's a directory, try to find the exe
                                        if name == "PotPlayer" {
                                            let p1 = path_buf.join("PotPlayerMini64.exe");
                                            if p1.exists() { p1 } else { path_buf.join("PotPlayerMini.exe") }
                                        } else if name == "VLC" {
                                            path_buf.join("vlc.exe")
                                        } else if name == "MPC-HC" {
                                            let p1 = path_buf.join("mpc-hc64.exe");
                                            if p1.exists() { p1 } else { path_buf.join("mpc-hc.exe") }
                                        } else {
                                            path_buf.to_path_buf()
                                        }
                                    };

                                    if final_path.exists() && final_path.is_file() {
                                        let p_str = final_path.to_string_lossy().to_string();
                                        if seen.insert(p_str.clone()) {
                                            players.push(DetectedPlayer {
                                                name: name.to_string(),
                                                path: p_str,
                                                icon: None
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };

        check_uninstall_key(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", &mut players, &mut seen_paths);
        check_uninstall_key(HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall", &mut players, &mut seen_paths);
        check_uninstall_key(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall", &mut players, &mut seen_paths);
        
        // Also check specific registry keys as backup
         let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey("Software\\DAUM\\PotPlayer64") {
            if let Ok(path) = key.get_value::<String, _>("ProgramPath") {
                if Path::new(&path).exists() && seen_paths.insert(path.clone()) {
                    players.push(DetectedPlayer { name: "PotPlayer".to_string(), path, icon: None });
                }
            }
        }

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(key) = hklm.open_subkey("SOFTWARE\\VideoLAN\\VLC") {
            if let Ok(install_dir) = key.get_value::<String, _>("InstallDir") {
                let path = Path::new(&install_dir).join("vlc.exe");
                let path_str = path.to_string_lossy().to_string();
                if path.exists() && seen_paths.insert(path_str.clone()) {
                     players.push(DetectedPlayer { name: "VLC".to_string(), path: path_str, icon: None });
                }
            }
        }

        println!("Detected players: {:?}", players);
        Ok(players)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}
