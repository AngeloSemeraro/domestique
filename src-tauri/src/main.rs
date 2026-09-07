// Prevent an extra console window on Windows in release builds.
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::net::{Ipv6Addr, SocketAddr, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};

/// The Next.js server the app talks to. Kept in Tauri state so it can be shut
/// down when the app quits.
struct ServerProcess(Mutex<Option<Child>>);

const PORT: u16 = 3000;

/// Is something answering on the port? Resolve `localhost` (which may be IPv4 or
/// IPv6 depending on the machine) and also try both loopback addresses, so the
/// check matches whatever `next start` bound to and whatever the webview loads.
fn server_up() -> bool {
    let mut addrs: Vec<SocketAddr> = Vec::new();
    if let Ok(iter) = ("localhost", PORT).to_socket_addrs() {
        addrs.extend(iter);
    }
    addrs.push(SocketAddr::from(([127, 0, 0, 1], PORT)));
    addrs.push(SocketAddr::from((Ipv6Addr::LOCALHOST, PORT)));
    addrs
        .iter()
        .any(|a| TcpStream::connect_timeout(a, Duration::from_millis(300)).is_ok())
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

fn log_line(repo: &Path, msg: &str) {
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(repo.join(".domestique-server.log"))
    {
        let _ = writeln!(f, "{msg}");
    }
}

/// Find a usable `node`. GUI apps launched from the Dock get a minimal PATH
/// that can't see Homebrew / nvm / the nodejs.org installer, so we try, in
/// order: the path baked at build time, common install locations (newest nvm
/// version first), then a login shell that sources the user's rc files.
fn find_node(repo: &Path) -> Option<String> {
    let baked = env!("NODE_BIN");
    if baked != "node" && Path::new(baked).exists() {
        log_line(repo, &format!("node: using baked path {baked}"));
        return Some(baked.to_string());
    }

    let home = std::env::var("HOME").unwrap_or_default();
    let mut candidates = vec![
        "/opt/homebrew/bin/node".to_string(),
        "/usr/local/bin/node".to_string(),
        "/usr/bin/node".to_string(),
    ];
    // nvm: ~/.nvm/versions/node/<ver>/bin/node — prefer the newest.
    if let Ok(entries) = std::fs::read_dir(format!("{home}/.nvm/versions/node")) {
        let mut versions: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
        versions.sort();
        for v in versions.into_iter().rev() {
            candidates.insert(0, v.join("bin/node").to_string_lossy().into_owned());
        }
    }
    for c in &candidates {
        if Path::new(c).exists() {
            log_line(repo, &format!("node: found {c}"));
            return Some(c.clone());
        }
    }

    // Last resort: ask the user's shells (they source nvm/homebrew in rc files).
    for shell in ["/bin/zsh", "/bin/bash"] {
        if let Ok(out) = Command::new(shell).args(["-lic", "command -v node"]).output() {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !s.is_empty() && Path::new(&s).exists() {
                    log_line(repo, &format!("node: resolved via {shell} -> {s}"));
                    return Some(s);
                }
            }
        }
    }

    log_line(repo, "node: NOT FOUND (baked, common paths, and login shells all failed)");
    None
}

/// Launch `next start` as a child process, logging its output to
/// `.domestique-server.log` in the repo.
fn start_server(repo: &Path) -> Option<Child> {
    let node = find_node(repo)?;
    let next_cli = repo.join("node_modules/next/dist/bin/next");
    if !next_cli.exists() {
        log_line(
            repo,
            &format!("server: missing {} — run `npm install` first", next_cli.display()),
        );
        return None;
    }

    let node_dir = Path::new(&node)
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let path = format!(
        "{node_dir}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{}",
        std::env::var("PATH").unwrap_or_default()
    );

    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(repo.join(".domestique-server.log"))
        .ok();
    let (out, err) = match log {
        Some(f) => {
            let f2 = f.try_clone().ok();
            (Stdio::from(f), f2.map(Stdio::from).unwrap_or_else(Stdio::null))
        }
        None => (Stdio::null(), Stdio::null()),
    };

    log_line(
        repo,
        &format!("server: starting `{node} next start -p {PORT}` in {}", repo.display()),
    );

    Command::new(&node)
        .arg(&next_cli)
        .arg("start")
        .arg("-p")
        .arg(PORT.to_string())
        .current_dir(repo)
        .env("NODE_ENV", "production")
        .env("PATH", path)
        .stdout(out)
        .stderr(err)
        .spawn()
        .map_err(|e| log_line(repo, &format!("server: spawn failed: {e}")))
        .ok()
}

fn main() {
    tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let repo = repo_dir();
            // Start the server unless something already answers on the port.
            if !server_up() {
                if let Some(child) = start_server(&repo) {
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
                log_line(
                    &repo_dir(),
                    "server: timed out waiting for the port — see messages above",
                );
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
