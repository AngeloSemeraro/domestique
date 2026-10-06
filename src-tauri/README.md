# Domestique desktop app (Tauri)

A native macOS app that starts the local Domestique server on launch, shows a
splash while it boots, then loads it in a chromeless native window with the
Domestique icon. Quitting the app stops the server.

## Build it (on your Mac)

Prerequisites: **Rust** (https://rustup.rs) and **Node.js**, plus Xcode Command
Line Tools (`xcode-select --install`).

From the repo root:

```bash
npm install            # first time — pulls in the Tauri CLI
npm run tauri build    # builds Next (production) + the .app
```

The finished app is at:

```
src-tauri/target/release/bundle/macos/Domestique.app
```

Drag it to **/Applications** and launch it from the Dock. On first launch macOS
Gatekeeper may block an unsigned app — right-click the app → **Open** →
**Open**, once.

## How it works

- `src/main.rs` — on launch, if nothing answers on `localhost:3000`, it spawns
  `next start` (`node node_modules/next/dist/bin/next start`) with the repo as
  its working directory, waits for the port, then points the window at it.
- `build.rs` — bakes the absolute path to `node` at build time, because apps
  launched from the Dock get a minimal `PATH` that can't find Homebrew/nvm/
  installer node. Override with `DOMESTIQUE_NODE=/path/to/node`.
- The server runs from **this checkout** (the repo path is baked in). If you
  move the repo, rebuild the app.

## Icons

The bundle uses `icons/icon.icns` / `icons/icon.png`. To regenerate the full
icon set from a 1024×1024 source:

```bash
npm run tauri icon public/icon.png
```
