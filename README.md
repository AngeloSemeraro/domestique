# ASCII Visualizer

Real-time **ASCII art filter for your webcam**. It samples the camera feed,
maps brightness to characters, and renders the result on a canvas — live, at
video frame rate. Everything runs in the browser; **the camera stream never
leaves the device.**

- 🎥 Live webcam → ASCII, with color, mono, and inverted modes
- 🎚️ Adjustable resolution, contrast, brightness, character ramps
- 📸 Save a frame as PNG or copy the current frame as plain text
- 🧩 Runs **standalone** *and* **embeds anywhere** (WordPress plugin included)
- 🪶 Framework-free TypeScript, no runtime dependencies

## Quick start

```bash
npm install
npm run dev        # standalone app at http://localhost:5173
```

Camera access requires a secure context — `localhost` and HTTPS both qualify.

## Builds

| Command              | Output          | Purpose                                   |
| -------------------- | --------------- | ----------------------------------------- |
| `npm run build`      | `dist/`         | Standalone static site                    |
| `npm run build:embed`| `dist-embed/`   | Self-mounting IIFE widget for embedding   |
| `npm run build:all`  | both            | Everything                                |
| `npm run typecheck`  | —               | Type-check without emitting               |

## Embedding in another page

Load the widget bundle and add a container element. Options are read from
`data-*` attributes:

```html
<div
  data-ascii-visualizer
  data-columns="140"
  data-color-mode="mono"
  data-preset="blocks"
  data-controls="true"
></div>
<script src="/path/to/ascii-visualizer.js"></script>
```

Or mount programmatically:

```js
AsciiVisualizer.createVisualizer(document.getElementById("cam"), {
  columns: 120,
  colorMode: "color",
  controls: true,
});
```

### Supported `data-*` attributes

| Attribute          | Values                                             | Default    |
| ------------------ | -------------------------------------------------- | ---------- |
| `data-columns`     | integer                                            | `110`      |
| `data-color-mode`  | `color` \| `mono` \| `inverted`                    | `color`    |
| `data-preset`      | `standard` \| `detailed` \| `blocks` \| `minimal` \| `binary` | `standard` |
| `data-controls`    | `true` \| `false`                                  | `true`     |
| `data-autostart`   | `true` \| `false`                                  | `false`    |
| `data-background`  | CSS color                                          | `#0a0a0a`  |
| `data-foreground`  | CSS color (mono / inverted)                        | `#e8e8e8`  |
| `data-mirror`      | `true` \| `false`                                  | `true`     |
| `data-invert`      | `true` \| `false`                                  | `false`    |

## WordPress

A ready-to-use plugin lives in [`wordpress-plugin/ascii-visualizer`](wordpress-plugin/ascii-visualizer).
It registers an `[ascii_visualizer]` shortcode:

```
[ascii_visualizer columns="140" color="mono" preset="blocks"]
```

Build the widget with `npm run build:embed` and copy
`dist-embed/ascii-visualizer.js` into the plugin's `assets/` folder (a prebuilt
copy is already included). See the plugin's `readme.txt` for details.

## Project layout

```
src/
  ascii.ts            Pure conversion helpers (charsets, luma, mapping)
  AsciiVisualizer.ts  Engine: webcam → sampling canvas → ASCII render loop
  controls.ts         Control-panel UI (plain DOM)
  widget.ts           Mount helper + [data-ascii-visualizer] auto-mount
  main.ts             Standalone app entry
  embed.ts            Embeddable IIFE entry (window.AsciiVisualizer)
  styles.css          Scoped widget styles
wordpress-plugin/     Shortcode plugin
```

## How it works

1. `getUserMedia` provides a hidden `<video>` element.
2. Each frame is drawn onto a tiny offscreen canvas sized to the target column
   count (rows derived from the video aspect and monospace glyph ratio).
3. Per cell, the luminance is adjusted (brightness/contrast/invert) and mapped
   to a character from the active ramp.
4. Characters are painted onto the display canvas, optionally tinted with the
   source pixel color.

## License

[MIT](LICENSE) © Angelo Semeraro. Vibe coded with Claude — provided as-is.
