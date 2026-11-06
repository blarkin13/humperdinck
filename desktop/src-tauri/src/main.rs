use std::io;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct Backend(Mutex<Option<CommandChild>>);

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
        .setup(|app| {
            // A unique writable user directory keeps downloaded voices and project files
            // outside the replaceable application bundle.
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            // The local API stays bound to loopback. LAN/remote server mode requires
            // a separate authenticated service and is NOT enabled by this shell.
            let port = allocate_loopback_port()?;
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

            // Always drain sidecar output, otherwise a full pipe can stall the API.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                            eprint!("{}", String::from_utf8_lossy(&bytes));
                        }
                        CommandEvent::Terminated(status) => {
                            eprintln!("Humperdinck server exited: {:?}", status);
                        }
                        _ => {}
                    }
                }
            });

            // The production React bundle is served by FastAPI so all /api and
            // generated-audio paths have the same origin as in the browser edition.
            // A separate Vite dev server or Node.js install is not required.
            wait_for_backend(port)?;
            let browser_url = format!("http://127.0.0.1:{port}/");
            let window_url = browser_url.parse()?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(window_url))
                .title("Humperdinck")
                .inner_size(1280.0, 840.0)
                .min_inner_size(850.0, 560.0)
                .build()?;

            // Both interfaces point to the SAME server, voice library and files.
            let browser_item = MenuItemBuilder::with_id("open-browser", "Open in Browser").build(app)?;
            let submenu = SubmenuBuilder::new(app, "Humperdinck")
                .item(&browser_item)
                .build()?;
            app.set_menu(MenuBuilder::new(app).item(&submenu).build()?)?;
            app.on_menu_event(move |_app, event| {
                if event.id() == "open-browser" {
                    if let Err(error) = webbrowser::open(&browser_url) {
                        eprintln!("Could not open the local browser: {error}");
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to create Humperdinck desktop application")
        .run(|app, event| {
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
