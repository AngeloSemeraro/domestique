// Prevent an extra console window on Windows in release builds.
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};

/// The Next.js server the app talks to. Kept in Tauri state so it can be shut
/// down when the app quits.
struct ServerProcess(Mutex<Option<Child>>);

const PORT: u16 = 3000;

fn server_up() -> bool {
    format!("127.0.0.1:{PORT}")
        .parse()
        .ok()
        .and_then(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(400)).ok())
        .is_some()
}

/// The repo root. `src-tauri` lives inside the repo, and CARGO_MANIFEST_DIR is
/// baked at build time — so on this machine it points back at the checkout.
/// (Move the repo → rebuild the app.)
fn repo_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri always has a parent")
        .to_path_buf()
}

/// Launch `next start` as a child process. Returns None if the build isn't
/// there (in which case something else must already be serving the port).
fn start_server() -> Option<Child> {
    let repo = repo_dir();
    let node = env!("NODE_BIN");
    let next_cli = repo.join("node_modules/next/dist/bin/next");
    if !next_cli.exists() {
        return None;
    }

    // Make sure node's own dir (and the usual spots) are on PATH for anything
    // the server shells out to.
    let node_dir = std::path::Path::new(node)
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let path = format!(
        "{node_dir}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{}",
        std::env::var("PATH").unwrap_or_default()
    );

    Command::new(node)
        .arg(next_cli)
        .arg("start")
        .arg("-p")
        .arg(PORT.to_string())
        .current_dir(&repo)
        .env("NODE_ENV", "production")
        .env("PATH", path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

fn main() {
    tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            // Start the server unless something already answers on the port.
            if !server_up() {
                if let Some(child) = start_server() {
                    *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);
                }
            }

            // Poll for the server off the main thread; when it answers, point
            // the (already visible) splash window at the app and focus it.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                for _ in 0..240 {
                    if server_up() {
                        if let Some(win) = handle.get_webview_window("main") {
                            if let Ok(url) = url::Url::parse(&format!("http://localhost:{PORT}")) {
                                let _ = win.navigate(url);
                            }
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Domestique")
        .run(|app_handle, event| {
            // Stop the server when the app quits.
            if let RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ServerProcess>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
