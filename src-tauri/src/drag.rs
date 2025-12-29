// use std::ffi::c_void;
use windows::core::*;
use windows::Win32::Foundation::*;
use windows::Win32::System::Com::*;
use windows::Win32::System::Memory::*;
use windows::Win32::System::Ole::*;
use windows::Win32::System::SystemServices::*;
use windows::Win32::UI::Shell::*;
use windows::Win32::System::Com::STGMEDIUM;

#[tauri::command]
pub async fn drag_file(app: tauri::AppHandle, path: String) -> std::result::Result<(), String> {
    // println!("drag_file command received for path: {}", path);
    app.run_on_main_thread(move || {
        if let Err(_e) = start_drag(path) {
            // println!("start_drag failed: {:?}", e);
        }
    }).map_err(|e| e.to_string())
}

#[implement(IDataObject)]
struct DataObject {
    files: Vec<String>,
}

impl IDataObject_Impl for DataObject {
    fn GetData(&self, pformatetc: *const FORMATETC) -> Result<STGMEDIUM> {
        // println!("GetData called");
        unsafe {
            let format = &*pformatetc;
            // println!("Requested format: {}", format.cfFormat);
            if format.cfFormat != CF_HDROP.0 {
                return Err(Error::from(DV_E_FORMATETC));
            }

            // Calculate size needed for DROPFILES + paths
            let mut size = std::mem::size_of::<DROPFILES>();
            for file in &self.files {
                let wide: Vec<u16> = file.encode_utf16().chain(std::iter::once(0)).collect();
                size += wide.len() * 2;
            }
            size += 2; // Double null terminator

            let hglobal = match GlobalAlloc(GMEM_MOVEABLE, size) {
                Ok(h) => h,
                Err(e) => return Err(e),
            };
            
            let ptr = GlobalLock(hglobal) as *mut u8;

            let drop_files = ptr as *mut DROPFILES;
            (*drop_files).pFiles = std::mem::size_of::<DROPFILES>() as u32;
            (*drop_files).fWide = TRUE;
            (*drop_files).pt = POINT { x: 0, y: 0 };
            (*drop_files).fNC = FALSE;

            let mut current_ptr = ptr.add(std::mem::size_of::<DROPFILES>()) as *mut u16;
            for file in &self.files {
                let wide: Vec<u16> = file.encode_utf16().chain(std::iter::once(0)).collect();
                std::ptr::copy_nonoverlapping(wide.as_ptr(), current_ptr, wide.len());
                current_ptr = current_ptr.add(wide.len());
            }
            *current_ptr = 0; // Final null terminator

            let _ = GlobalUnlock(hglobal);

            Ok(STGMEDIUM {
                tymed: TYMED_HGLOBAL.0 as u32,
                u: STGMEDIUM_0 { hGlobal: hglobal },
                pUnkForRelease: std::mem::ManuallyDrop::new(None),
            })
        }
    }

    fn GetDataHere(&self, _pformatetc: *const FORMATETC, _pmedium: *mut STGMEDIUM) -> Result<()> {
        Err(Error::from(DV_E_FORMATETC))
    }

    fn QueryGetData(&self, pformatetc: *const FORMATETC) -> HRESULT {
        unsafe {
            let format = &*pformatetc;
            if format.cfFormat == CF_HDROP.0 {
                S_OK
            } else {
                DV_E_FORMATETC
            }
        }
    }

    fn GetCanonicalFormatEtc(&self, _pformatectin: *const FORMATETC, _pformatetcout: *mut FORMATETC) -> HRESULT {
        E_NOTIMPL
    }

    fn SetData(&self, _pformatetc: *const FORMATETC, _pmedium: *const STGMEDIUM, _frelease: BOOL) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn EnumFormatEtc(&self, _dwdirection: u32) -> Result<IEnumFORMATETC> {
        Err(Error::from(E_NOTIMPL))
    }

    fn DAdvise(&self, _pformatetc: *const FORMATETC, _advf: u32, _padvsink: Option<&IAdviseSink>) -> Result<u32> {
        Err(Error::from(E_NOTIMPL))
    }

    fn DUnadvise(&self, _dwconnection: u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn EnumDAdvise(&self) -> Result<IEnumSTATDATA> {
        Err(Error::from(E_NOTIMPL))
    }
}

#[implement(IDropSource)]
struct DropSource;

impl IDropSource_Impl for DropSource {
    fn QueryContinueDrag(&self, fescapepressed: BOOL, grfkeystate: MODIFIERKEYS_FLAGS) -> HRESULT {
        // println!("QueryContinueDrag: esc={:?}, key={:?}", fescapepressed, grfkeystate);
        if fescapepressed.as_bool() {
            return DRAGDROP_S_CANCEL;
        }
        if (grfkeystate & MK_LBUTTON) == MODIFIERKEYS_FLAGS(0) {
            return DRAGDROP_S_DROP;
        }
        S_OK
    }

    fn GiveFeedback(&self, _dweffect: DROPEFFECT) -> HRESULT {
        // println!("GiveFeedback: {:?}", _dweffect);
        DRAGDROP_S_USEDEFAULTCURSORS
    }
}

pub fn start_drag(path: String) -> Result<()> {
    // println!("start_drag called for path: {}", path);
    unsafe {
        // Initialize OLE if not already initialized
        let _hr = OleInitialize(None);
        // println!("OleInitialize result: {:?}", hr);
        
        let data_object: IDataObject = DataObject { files: vec![path] }.into();
        let drop_source: IDropSource = DropSource.into();
        let mut effect = DROPEFFECT_COPY;
        
        // println!("Calling DoDragDrop");
        // This will block until drop completes
        let _result = DoDragDrop(&data_object, &drop_source, DROPEFFECT_COPY | DROPEFFECT_LINK, &mut effect);
        // println!("DoDragDrop result: {:?}", result);
        
        Ok(())
    }
}
