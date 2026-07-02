import { createVisualizer } from "./widget.ts";
import "./styles.css";

// Standalone single-page app entry.
const mount = document.getElementById("app");
if (mount) {
  createVisualizer(mount, { controls: true });
}
