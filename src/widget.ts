import { AsciiVisualizer, AsciiOptions } from "./AsciiVisualizer.ts";
import { buildControls } from "./controls.ts";
import { CHARSETS } from "./ascii.ts";

export interface WidgetOptions extends Partial<AsciiOptions> {
  /** Show the control panel. Default true. */
  controls?: boolean;
  /** Auto-start the camera on mount (may prompt immediately). Default false. */
  autostart?: boolean;
  /** Named charset from CHARSETS, overrides `charset` if given. */
  preset?: keyof typeof CHARSETS;
}

/**
 * Mount an ASCII webcam visualizer into `container`. Returns the engine so
 * callers can drive it programmatically. Used by both the standalone app and
 * the embeddable widget.
 */
export function createVisualizer(
  container: HTMLElement,
  options: WidgetOptions = {},
): AsciiVisualizer {
  const { controls = true, autostart = false, preset, ...rest } = options;
  if (preset && CHARSETS[preset]) rest.charset = CHARSETS[preset];

  container.classList.add("asciiv-root");
  container.replaceChildren();

  const stage = document.createElement("div");
  stage.className = "asciiv-stage";

  const viz = new AsciiVisualizer(rest);
  viz.mount(stage);
  container.append(stage);

  if (controls) container.append(buildControls(viz));
  if (autostart) void viz.start();

  return viz;
}

/**
 * Scan the document for `[data-ascii-visualizer]` elements and mount a widget in
 * each, reading options from `data-*` attributes.
 */
export function autoMount(root: ParentNode = document): AsciiVisualizer[] {
  const nodes = root.querySelectorAll<HTMLElement>("[data-ascii-visualizer]");
  const created: AsciiVisualizer[] = [];
  for (const node of nodes) {
    if (node.dataset.asciivMounted === "1") continue;
    node.dataset.asciivMounted = "1";
    created.push(createVisualizer(node, readDataOptions(node)));
  }
  return created;
}

function readDataOptions(node: HTMLElement): WidgetOptions {
  const d = node.dataset;
  const opts: WidgetOptions = {};
  if (d.controls != null) opts.controls = d.controls !== "false";
  if (d.autostart != null) opts.autostart = d.autostart === "true";
  if (d.preset) opts.preset = d.preset as keyof typeof CHARSETS;
  if (d.columns) opts.columns = Number(d.columns);
  if (d.colorMode) opts.colorMode = d.colorMode as AsciiOptions["colorMode"];
  if (d.background) opts.background = d.background;
  if (d.foreground) opts.foreground = d.foreground;
  if (d.mirror != null) opts.mirror = d.mirror !== "false";
  if (d.invert != null) opts.invert = d.invert === "true";
  return opts;
}
