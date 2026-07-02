import { autoMount, createVisualizer } from "./widget.ts";
// Import the stylesheet as a string and inject it at runtime so the embed
// bundle is a single self-contained file (one <script> tag, no extra CSS).
import css from "./styles.css?inline";

// Embeddable widget entry, built as an IIFE (dist-embed/ascii-visualizer.js).
// Exposes a small global API and auto-mounts any [data-ascii-visualizer] nodes.

export { createVisualizer, autoMount } from "./widget.ts";

function injectStyles() {
  const id = "asciiv-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

function run() {
  injectStyles();
  autoMount();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}

// Also expose on window so themes/plugins can mount programmatically.
declare global {
  interface Window {
    AsciiVisualizer?: {
      createVisualizer: typeof createVisualizer;
      autoMount: typeof autoMount;
    };
  }
}

window.AsciiVisualizer = { createVisualizer, autoMount };
