use tauri::command;
use usn_journal_rs::mft::Mft;
use usn_journal_rs::volume::Volume;
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows::Win32::Foundation::{HANDLE, CloseHandle, GetLastError};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, OpenFileById, GetFinalPathNameByHandleW, 
    FILE_ID_DESCRIPTOR, FILE_ID_TYPE, FILE_NAME_NORMALIZED, VOLUME_NAME_DOS,
    FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_SHARE_DELETE,
    OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, READ_CONTROL,
    FILE_READ_ATTRIBUTES, SYNCHRONIZE, FILE_GENERIC_READ, GETFINALPATHNAMEBYHANDLE_FLAGS
};
use windows::core::PCWSTR;

unsafe fn get_path_from_id(volume_handle: HANDLE, file_id: u64) -> Result<String, String> {
    let mut desc = FILE_ID_DESCRIPTOR::default();
    desc.dwSize = std::mem::size_of::<FILE_ID_DESCRIPTOR>() as u32;
    desc.Type = FILE_ID_TYPE(0); // FileIdType
    desc.Anonymous.FileId = file_id as i64;

    // IMPORTANT: FILE_FLAG_BACKUP_SEMANTICS is required to open directories by ID
    let file_handle = OpenFileById(
        volume_handle,
        &desc,
        FILE_READ_ATTRIBUTES.0 | SYNCHRONIZE.0,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        None,
        windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES(FILE_FLAG_BACKUP_SEMANTICS.0),
    );

    if let Ok(handle) = file_handle {
        if handle.is_invalid() {
            let err = GetLastError();
            return Err(format!("Invalid handle. Error: {:?}", err));
        }
        
        let mut buffer = [0u16; 32768];
        let len = GetFinalPathNameByHandleW(
            handle, 
            &mut buffer, 
            GETFINALPATHNAMEBYHANDLE_FLAGS(VOLUME_NAME_DOS.0 | FILE_NAME_NORMALIZED.0)
        );
        
        let _ = CloseHandle(handle);

        if len > 0 && (len as usize) < buffer.len() {
            let path_slice = &buffer[..len as usize];
            let path_string = String::from_utf16_lossy(path_slice);
            if path_string.starts_with(r"\\?\") {
                return Ok(path_string[4..].to_string());
            }
            return Ok(path_string);
        } else {
            let err = GetLastError();
            return Err(format!("GetFinalPathNameByHandleW failed. Error: {:?}", err));
        }
    } else {
        let err = GetLastError();
        return Err(format!("OpenFileById failed. Error: {:?}", err));
    }
}

use std::collections::HashSet;

pub fn search_usn_internal(volume_path: &str, keyword: &str) -> Result<Vec<String>, String> {
    println!("[USN DEBUG] Starting search for '{}' on volume '{}'", keyword, volume_path);
    let mut results = Vec::new();
    let mut errors = Vec::new(); // Store debug errors
    let mut seen_paths: HashSet<String> = HashSet::new(); // Deduplication
    let keyword_lower = keyword.to_lowercase();
    
    let drive_letter = volume_path.chars().next().unwrap_or('C');
    println!("[USN DEBUG] Drive letter extracted: {}", drive_letter);
    
    // 1. Open Volume for USN Journal
    let vol = match Volume::from_drive_letter(drive_letter) {
        Ok(v) => v,
        Err(e) => return Err(format!("Failed to open volume {}: {}", drive_letter, e))
    };

    // 2. Open Volume Handle for OpenFileById (Windows API)
    let drive_str = format!(r"\\.\{}:", drive_letter);
    let drive_wide: Vec<u16> = OsStr::new(&drive_str).encode_wide().chain(std::iter::once(0)).collect();
    
    let volume_handle = unsafe {
        CreateFileW(
            PCWSTR(drive_wide.as_ptr()),
            FILE_GENERIC_READ.0 | READ_CONTROL.0, 
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None,
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            HANDLE(0),
        )
    };

    let volume_handle = match volume_handle {
        Ok(h) if !h.is_invalid() => h,
        _ => {
            let err = unsafe { GetLastError() };
            return Err(format!("Failed to open volume handle (Error: {:?})", err));
        }
    };

    // Ensure handle is closed
    struct HandleGuard(HANDLE);
    impl Drop for HandleGuard {
        fn drop(&mut self) {
            unsafe { let _ = CloseHandle(self.0); };
        }
    }
    let _guard = HandleGuard(volume_handle);

    // SWITCH TO MFT for full search capability (finds existing files, not just changes)
    let mft = Mft::new(&vol);
    println!("[USN DEBUG] MFT initialized, starting iteration...");
    
    let mut count = 0;
    for entry in mft.iter() {
        count += 1;
        if count % 10000 == 0 {
            // println!("[USN DEBUG] Scanned {} entries...", count);
        }
        if let Ok(record) = entry {
            // MFT Record handling
            let name_os = record.file_name; 
            let name = name_os.to_string_lossy().to_string();
            if name.to_lowercase().contains(&keyword_lower) {
                println!("[USN DEBUG] Found name match: {}", name);
                // Resolve full path using OpenFileById
                // Try reference_number
                match unsafe { get_path_from_id(volume_handle, record.fid) } {
                    Ok(full_path) => {
                        println!("[USN DEBUG] Resolved full path: {}", full_path);
                        if !seen_paths.contains(&full_path) {
                            seen_paths.insert(full_path.clone());
                            results.push(full_path);
                        }
                    },
                    Err(e) => {
                        // println!("[USN DEBUG] Failed to resolve path for {}: {}", name, e);
                        // Keep only last 5 errors to avoid spamming
                        if errors.len() < 5 {
                            errors.push(format!("Path resolve error for '{}': {}", name, e));
                        }
                    }
                }
                
                if results.len() >= 500 {
                    println!("[USN DEBUG] Hit result limit (500)");
                    break;
                }
            }
        }
    }
    println!("[USN DEBUG] Iteration finished. Scanned total {} entries. Found {} matches.", count, results.len());
    
    // DEBUG HACK: If no results found but we have errors, return errors as results so user can see them
    if results.is_empty() && !errors.is_empty() {
        return Ok(errors);
    }

    Ok(results)
}

#[command]
pub async fn search_usn_journal(volume: String, keyword: String) -> Result<Vec<String>, String> {
    // Run in a separate thread to avoid blocking the async runtime
    tauri::async_runtime::spawn_blocking(move || {
        search_usn_internal(&volume, &keyword)
    }).await.map_err(|e| e.to_string())?
}
