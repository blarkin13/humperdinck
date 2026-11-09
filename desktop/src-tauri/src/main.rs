// Release builds are windowed apps on Windows, so no terminal opens with them.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::{self, Write};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::webview::DownloadEvent;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

// The public update feed is served by Humperdinck, independent of GitHub visibility.
const UPDATE_ENDPOINT: &str = "https://humperdinck.studio/updates/latest.json";

fn trusted_updater(app: &tauri::AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let pubkey = option_env!("HUMPERDINCK_UPDATER_PUBKEY")
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "This unsigned test build cannot install updates automatically".to_string())?;
    app.updater_builder()
        .pubkey(pubkey)
        .endpoints(vec![url::Url::parse(UPDATE_ENDPOINT).map_err(|e| e.to_string())?])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_signed_update(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    if option_env!("HUMPERDINCK_UPDATER_PUBKEY").filter(|s| !s.trim().is_empty()).is_none() {
        return Ok(serde_json::json!({"configured":false}));
    }
    let next=trusted_updater(&app)?.check().await.map_err(|e| e.to_string())?;
    Ok(match next {
        Some(update)=>serde_json::json!({"configured":true,"available":true,
            "version":update.version.to_string(),"current_version":update.current_version.to_string()}),
        None=>serde_json::json!({"configured":true,"available":false}),
    })
}

#[tauri::command]
async fn install_signed_update(app: tauri::AppHandle, version: String) -> Result<(), String> {
    let current=trusted_updater(&app)?.check().await.map_err(|e| e.to_string())?
        .ok_or_else(||"No signed desktop update is available".to_string())?;
    if current.version.to_string()!=version {
        return Err("The available update changed. Check again before installing.".to_string());
    }
    current.download_and_install(|_,_|{},||{}).await.map_err(|e| e.to_string())?;
    app.restart();
}


struct Backend(Mutex<Option<CommandChild>>);

// Windows GUI builds have no visible console. Preserve startup and sidecar
// errors in the application's writable data directory for diagnosis.
fn log_event(file: &Path, message: &str) {
    if let Ok(mut log) = OpenOptions::new().create(true).append(true).open(file) {
        let _ = writeln!(log, "{message}");
    }
}

fn preferred_loopback_port(data_dir: &Path) -> u16 {
    let path = data_dir.join("server-settings.json");
    let Ok(bytes) = std::fs::read(path) else { return 0; };
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) else { return 0; };
    match value.get("port").and_then(serde_json::Value::as_u64) {
        Some(port @ 1024..=65535) => port as u16,
        _ => 0,
    }
}

fn allocate_loopback_port() -> io::Result<u16> {
    let socket = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(socket.local_addr()?.port())
}

fn wait_for_backend(port: u16) -> io::Result<()> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let deadline = Instant::now() + Duration::from_secs(35);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(200));
    }
    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        "Humperdinck's bundled local server did not start within 35 seconds",
    ))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![check_signed_update, install_signed_update])
        .setup(|app| {
            if let Some(pubkey) = option_env!("HUMPERDINCK_UPDATER_PUBKEY").filter(|s| !s.trim().is_empty()) {
                app.handle().plugin(tauri_plugin_updater::Builder::new().pubkey(pubkey).build())?;
            }
            // A unique writable user directory keeps downloaded voices and project files
            // outside the replaceable application bundle.
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let log_path = data_dir.join("desktop-startup.log");
            log_event(&log_path, "--- Humperdinck native app launched ---");

            // The local API stays bound to loopback. LAN/remote server mode requires
            // a separate authenticated service and is NOT enabled by this shell.
            let preferred = preferred_loopback_port(&data_dir);
            let port = if preferred != 0 {
                match TcpListener::bind(("127.0.0.1", preferred)) {
                    Ok(socket) => { drop(socket); preferred }
                    Err(error) => {
                        log_event(&log_path, &format!("Preferred local port {preferred} unavailable ({error}); using automatic port"));
                        allocate_loopback_port()?
                    }
                }
            } else { allocate_loopback_port()? };
            let args = vec![
                "--port".to_string(),
                port.to_string(),
                "--data-dir".to_string(),
                data_dir.to_string_lossy().into_owned(),
            ];
            let (mut events, child) = app
                .shell()
                .sidecar("humperdinck-server")?
                .args(args)
                .spawn()?;
            app.manage(Backend(Mutex::new(Some(child))));
            log_event(&log_path, &format!("Bundled API sidecar launched on 127.0.0.1:{port}"));

            // Always drain sidecar output, otherwise a full pipe can stall the API.
            let sidecar_log = log_path.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                            let output = String::from_utf8_lossy(&bytes);
                            eprint!("{output}");
                            log_event(&sidecar_log, &format!("Sidecar: {output}"));
                        }
                        CommandEvent::Terminated(status) => {
                            eprintln!("Humperdinck server exited: {:?}", status);
                            log_event(&sidecar_log, &format!("Sidecar exited: {:?}", status));
                        }
                        _ => {}
                    }
                }
            });

            // The production React bundle is served by FastAPI so all /api and
            // generated-audio paths have the same origin as in the browser edition.
            // A separate Vite dev server or Node.js install is not required.
            if let Err(error) = wait_for_backend(port) {
                log_event(&log_path, &format!("API startup failed: {error}"));
                return Err(error.into());
            }
            log_event(&log_path, "Bundled API accepted a local connection");
            let browser_url = format!("http://127.0.0.1:{port}/");
            let window_url = browser_url.parse()?;
            let load_log = log_path.clone();
            // Save downloads to the Downloads folder and tell the page where each
            // file went: the webview shows no download UI of its own.
            let downloads: Arc<Mutex<HashMap<String, PathBuf>>> = Arc::default();
            let download_log = log_path.clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(window_url))
                .on_download(move |webview, event| {
                    match event {
                        DownloadEvent::Requested { url, destination } => {
                            if let Ok(folder) = webview.app_handle().path().download_dir() {
                                let name = destination
                                    .file_name()
                                    .map(|n| n.to_os_string())
                                    .unwrap_or_else(|| "humperdinck-download".into());
                                *destination = unique_path(&folder.join(name));
                            }
                            if let Ok(mut map) = downloads.lock() {
                                map.insert(url.to_string(), destination.clone());
                            }
                        }
                        DownloadEvent::Finished { url, path, success } => {
                            let remembered = downloads.lock().ok().and_then(|mut m| m.remove(url.as_str()));
                            let saved = path.or(remembered);
                            log_event(&download_log, &format!("Download finished ({success}): {saved:?}"));
                            let detail = serde_json::json!({
                                "success": success,
                                "path": saved.as_ref().map(|p| p.display().to_string()),
                                "name": saved.as_ref().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_string()),
                                "folder": saved.as_ref().and_then(|p| p.parent()).map(|p| p.display().to_string()),
                            });
                            let _ = webview.eval(format!(
                                "window.dispatchEvent(new CustomEvent('humperdinck-download',{{detail:{detail}}}))"
                            ));
                        }
                        _ => {}
                    }
                    true
                })
                .on_page_load(move |_window, payload| {
                    log_event(&load_log, &format!("Webview page {:?}: {}", payload.event(), payload.url()));
                })
                .title("Humperdinck")
                .inner_size(1280.0, 840.0)
                .min_inner_size(850.0, 560.0)
                .build()?;

            // Both interfaces point to the SAME server, voice library and files.
            let browser_item = MenuItemBuilder::with_id("open-browser", "Open in Browser").build(app)?;
            let log_item = MenuItemBuilder::with_id("open-diagnostics", "Open Startup Log").build(app)?;
            // Explicit Quit is essential: macOS keeps applications alive after
            // closing their last window, and our custom menu replaced the
            // default macOS application menu (including its Cmd+Q shortcut).
            let quit_item = MenuItemBuilder::with_id("quit-humperdinck", "Quit Humperdinck")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?;
            let submenu = SubmenuBuilder::new(app, "Humperdinck")
                .item(&browser_item)
                .item(&log_item)
                .separator()
                .item(&quit_item)
                .build()?;
            // macOS only routes Cmd+C/V/X/A/Z to text fields through an Edit menu.
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            app.set_menu(MenuBuilder::new(app).item(&submenu).item(&edit_menu).build()?)?;
            let open_log_path = log_path.clone();
            app.on_menu_event(move |app, event| {
                if event.id() == "quit-humperdinck" {
                    log_event(&open_log_path, "User requested Quit Humperdinck");
                    app.exit(0);
                    return;
                }
                if event.id() == "open-browser" {
                    if let Err(error) = webbrowser::open(&browser_url) {
                        eprintln!("Could not open the local browser: {error}");
                        log_event(&open_log_path, &format!("Open browser failed: {error}"));
                    }
                }
                if event.id() == "open-diagnostics" {
                    #[cfg(target_os = "windows")]
                    if let Err(error) = std::process::Command::new("notepad.exe")
                        .arg(&open_log_path)
                        .spawn()
                    {
                        eprintln!("Could not open startup log: {error}");
                    }
                    #[cfg(not(target_os = "windows"))]
                    if let Err(error) = webbrowser::open(open_log_path.to_string_lossy().as_ref()) {
                        eprintln!("Could not open startup log: {error}");
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to create Humperdinck desktop application")
        .run(|app, event| {
            // Close the native window = shut down the desktop application and
            // its bundled API. A browser tab never silently keeps it alive.
            if let RunEvent::WindowEvent { label, event: tauri::WindowEvent::CloseRequested { .. }, .. } = &event {
                if label == "main" {
                    app.exit(0);
                }
            }
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<Backend>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}

/// `name.ext`, or `name (2).ext` and so on if that file already exists.
fn unique_path(candidate: &Path) -> PathBuf {
    if !candidate.exists() {
        return candidate.to_path_buf();
    }
    let stem = candidate.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = candidate.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let parent = candidate.parent().map(Path::to_path_buf).unwrap_or_default();
    (2..10_000)
        .map(|n| parent.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .unwrap_or_else(|| candidate.to_path_buf())
}
