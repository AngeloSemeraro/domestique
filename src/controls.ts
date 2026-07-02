import { AsciiVisualizer } from "./AsciiVisualizer.ts";
import { CHARSETS, ColorMode } from "./ascii.ts";

// Builds the control panel and wires it to an AsciiVisualizer instance.
// Kept dependency-free: plain DOM, no framework.

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

function field(label: string, control: HTMLElement): HTMLElement {
  return el("label", { class: "asciiv-field" }, [
    el("span", { class: "asciiv-field-label" }, [label]),
    control,
  ]);
}

export function buildControls(viz: AsciiVisualizer): HTMLElement {
  const opts = viz.getOptions();
  const panel = el("div", { class: "asciiv-controls" });

  // --- Camera start/stop + device selector -------------------------------
  const startBtn = el("button", { class: "asciiv-btn asciiv-btn-primary", type: "button" }, [
    "Start camera",
  ]);
  const cameraSelect = el("select", { class: "asciiv-select", "aria-label": "Camera" });
  cameraSelect.disabled = true;

  const status = el("p", { class: "asciiv-status", role: "status" }, [""]);

  const refreshCameras = async () => {
    const cams = await viz.listCameras();
    cameraSelect.replaceChildren();
    for (const c of cams) {
      cameraSelect.append(el("option", { value: c.deviceId }, [c.label]));
    }
    cameraSelect.disabled = cams.length <= 1;
  };

  startBtn.addEventListener("click", async () => {
    if (viz.getState() === "running") {
      viz.stop();
    } else {
      await viz.start(cameraSelect.value || undefined);
      await refreshCameras();
    }
  });

  cameraSelect.addEventListener("change", () => {
    if (viz.getState() === "running") viz.start(cameraSelect.value);
  });

  viz.onStateChange((state) => {
    startBtn.textContent = state === "running" ? "Stop camera" : "Start camera";
    startBtn.classList.toggle("asciiv-btn-primary", state !== "running");
    if (state === "error") {
      status.textContent = viz.getError() ?? "Something went wrong.";
      status.classList.add("asciiv-status-error");
    } else {
      status.textContent =
        state === "starting" ? "Requesting camera…" : state === "running" ? "" : "";
      status.classList.remove("asciiv-status-error");
    }
  });

  // --- Resolution --------------------------------------------------------
  const cols = el("input", {
    type: "range",
    min: "30",
    max: "200",
    step: "1",
    value: String(opts.columns),
    class: "asciiv-range",
  }) as HTMLInputElement;
  const colsVal = el("span", { class: "asciiv-value" }, [String(opts.columns)]);
  cols.addEventListener("input", () => {
    viz.setOption("columns", Number(cols.value));
    colsVal.textContent = cols.value;
  });

  // --- Charset -----------------------------------------------------------
  const charset = el("select", { class: "asciiv-select" }) as HTMLSelectElement;
  for (const name of Object.keys(CHARSETS)) {
    charset.append(el("option", { value: name }, [name]));
  }
  charset.value = "standard";
  charset.addEventListener("change", () => {
    viz.setOption("charset", CHARSETS[charset.value] ?? CHARSETS.standard);
  });

  // --- Color mode --------------------------------------------------------
  const color = el("select", { class: "asciiv-select" }) as HTMLSelectElement;
  for (const mode of ["color", "mono", "inverted"] as ColorMode[]) {
    color.append(el("option", { value: mode }, [mode]));
  }
  color.value = opts.colorMode;
  color.addEventListener("change", () => {
    viz.setOption("colorMode", color.value as ColorMode);
  });

  // --- Sliders: contrast, brightness -------------------------------------
  const makeSlider = (
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    apply: (v: number) => void,
  ) => {
    const input = el("input", {
      type: "range",
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(value),
      class: "asciiv-range",
    }) as HTMLInputElement;
    const val = el("span", { class: "asciiv-value" }, [value.toFixed(1)]);
    input.addEventListener("input", () => {
      apply(Number(input.value));
      val.textContent = Number(input.value).toFixed(1);
    });
    return field(label, el("div", { class: "asciiv-slider-row" }, [input, val]));
  };

  // --- Toggles -----------------------------------------------------------
  const makeToggle = (label: string, value: boolean, apply: (v: boolean) => void) => {
    const input = el("input", { type: "checkbox", class: "asciiv-checkbox" }) as HTMLInputElement;
    input.checked = value;
    input.addEventListener("change", () => apply(input.checked));
    return el("label", { class: "asciiv-toggle" }, [input, el("span", {}, [label])]);
  };

  // --- Actions: snapshot, copy text, fullscreen --------------------------
  const snapBtn = el("button", { class: "asciiv-btn", type: "button" }, ["Save PNG"]);
  snapBtn.addEventListener("click", () => {
    if (viz.getState() !== "running") return;
    const a = el("a", { href: viz.snapshot(), download: `ascii-${Date.now()}.png` });
    a.click();
  });

  const copyBtn = el("button", { class: "asciiv-btn", type: "button" }, ["Copy text"]);
  copyBtn.addEventListener("click", async () => {
    if (viz.getState() !== "running") return;
    const text = viz.getText();
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy text"), 1200);
    } catch {
      copyBtn.textContent = "Copy failed";
      setTimeout(() => (copyBtn.textContent = "Copy text"), 1200);
    }
  });

  // --- Assemble ----------------------------------------------------------
  panel.append(
    el("div", { class: "asciiv-row" }, [startBtn, cameraSelect]),
    status,
    field("Resolution", el("div", { class: "asciiv-slider-row" }, [cols, colsVal])),
    el("div", { class: "asciiv-grid-2" }, [field("Charset", charset), field("Color", color)]),
    makeSlider("Contrast", 0.5, 2.5, 0.1, opts.contrast, (v) => viz.setOption("contrast", v)),
    makeSlider("Brightness", -0.5, 0.5, 0.05, opts.brightness, (v) =>
      viz.setOption("brightness", v),
    ),
    el("div", { class: "asciiv-row" }, [
      makeToggle("Invert", opts.invert, (v) => viz.setOption("invert", v)),
      makeToggle("Mirror", opts.mirror, (v) => viz.setOption("mirror", v)),
    ]),
    el("div", { class: "asciiv-row" }, [snapBtn, copyBtn]),
  );

  return panel;
}
