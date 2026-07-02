=== ASCII Visualizer ===
Contributors: angelosemeraro
Tags: ascii, webcam, camera, art, filter, canvas
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 0.1.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Real-time ASCII art filter for the webcam. Add it to any page with a shortcode.

== Description ==

ASCII Visualizer turns a visitor's webcam feed into live ASCII art, rendered
entirely in the browser. Nothing is uploaded — the camera stream never leaves
the device.

Use the shortcode anywhere:

    [ascii_visualizer]

With options:

    [ascii_visualizer columns="140" color="mono" preset="blocks" controls="true"]

Supported attributes:

* `columns`    — characters across (default 110)
* `color`      — `color`, `mono` or `inverted` (default `color`)
* `preset`     — `standard`, `detailed`, `blocks`, `minimal`, `binary`
* `controls`   — `true` / `false`, show the control panel (default `true`)
* `autostart`  — `true` / `false`, request the camera immediately (default `false`)
* `background` — CSS color for the canvas background
* `foreground` — CSS color for mono / inverted characters
* `height`     — CSS height for the widget (default `auto`)
* `maxwidth`   — CSS max-width (default `960px`)

== Installation ==

1. Build the widget bundle from the project root: `npm run build:embed`.
2. Copy `dist-embed/ascii-visualizer.js` into this plugin's `assets/` folder
   (the repository already ships a prebuilt copy there).
3. Zip the `ascii-visualizer` folder and upload it under Plugins → Add New →
   Upload Plugin, or copy the folder into `wp-content/plugins/`.
4. Activate the plugin and add the `[ascii_visualizer]` shortcode to a page.

== Notes ==

Camera access requires the site to be served over HTTPS (browsers block
getUserMedia on insecure origins). Vibe coded with Claude — provided as-is.

== Changelog ==

= 0.1.0 =
* Initial release: webcam ASCII filter with shortcode and control panel.
