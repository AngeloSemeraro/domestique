use std::process::Command;

fn main() {
    // Bake the absolute path to `node` at build time. The app is built and run
    // on the same machine, so the path resolved here is valid at runtime — and
    // GUI apps launched from the Dock get a minimal PATH that usually can't
    // find node (Homebrew / nvm / the nodejs.org installer), so relying on a
    // runtime PATH lookup is unreliable. An explicit DOMESTIQUE_NODE overrides.
    let node = std::env::var("DOMESTIQUE_NODE")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            Command::new("bash")
                .args(["-c", "command -v node"])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_else(|| "node".to_string());
    println!("cargo:rustc-env=NODE_BIN={node}");
    println!("cargo:rerun-if-env-changed=DOMESTIQUE_NODE");

    tauri_build::build();
}
