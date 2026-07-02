import {
  adjust,
  AsciiOptions,
  charForLuma,
  DEFAULT_OPTIONS,
  imageDataToText,
  luma,
  rowsForColumns,
} from "./ascii.ts";

export type { AsciiOptions } from "./ascii.ts";

export interface CameraInfo {
  deviceId: string;
  label: string;
}

type Listener = (state: EngineState) => void;

export type EngineState = "idle" | "starting" | "running" | "error";

/**
 * AsciiVisualizer turns a webcam feed into real-time ASCII art rendered on a
 * canvas. It owns a hidden <video>, a small offscreen sampling canvas, and the
 * visible display canvas. Framework-free so it drops into any page.
 */
export class AsciiVisualizer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly video: HTMLVideoElement;
  private readonly sampler: HTMLCanvasElement;
  private readonly sctx: CanvasRenderingContext2D;

  private opts: AsciiOptions;
  private stream: MediaStream | null = null;
  private raf = 0;
  private state: EngineState = "idle";
  private deviceId: string | null = null;
  private lastError: string | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly resizeObserver: ResizeObserver;

  constructor(options: Partial<AsciiOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };

    this.canvas = document.createElement("canvas");
    this.canvas.className = "asciiv-canvas";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;

    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute("playsinline", "");

    this.sampler = document.createElement("canvas");
    const sctx = this.sampler.getContext("2d", { willReadFrequently: true });
    if (!sctx) throw new Error("Canvas 2D context unavailable");
    this.sctx = sctx;

    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
  }

  /** Attach the canvas to a container and begin observing its size. */
  mount(container: HTMLElement): void {
    container.appendChild(this.canvas);
    this.resizeObserver.observe(container);
    this.resizeCanvas();
  }

  onStateChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getState(): EngineState {
    return this.state;
  }

  getError(): string | null {
    return this.lastError;
  }

  getOptions(): AsciiOptions {
    return { ...this.opts };
  }

  setOption<K extends keyof AsciiOptions>(key: K, value: AsciiOptions[K]): void {
    this.opts[key] = value;
    if (key === "background") this.canvas.style.background = this.opts.background;
  }

  private setState(state: EngineState, error: string | null = null): void {
    this.state = state;
    this.lastError = error;
    for (const fn of this.listeners) fn(state);
  }

  /** Enumerate available video input devices (labels require an active grant). */
  async listCameras(): Promise<CameraInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  }

  /** Request the webcam and start the render loop. */
  async start(deviceId?: string): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setState("error", "This browser does not support camera access.");
      return;
    }
    this.setState("starting");
    this.stop(false);
    this.deviceId = deviceId ?? this.deviceId;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: this.deviceId
          ? { deviceId: { exact: this.deviceId } }
          : { facingMode: "user" },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      // Record the actual device so listCameras() reflects the real label.
      const track = this.stream.getVideoTracks()[0];
      this.deviceId = track?.getSettings().deviceId ?? this.deviceId;
      this.setState("running");
      this.loop();
    } catch (err) {
      this.setState("error", describeError(err));
    }
  }

  /** Stop the render loop and release the camera. */
  stop(updateState = true): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    if (updateState) this.setState("idle");
  }

  /** Fully release resources. The instance is not reusable afterwards. */
  destroy(): void {
    this.stop(false);
    this.resizeObserver.disconnect();
    this.listeners.clear();
    this.canvas.remove();
  }

  /** Current frame as a downloadable PNG data URL. */
  snapshot(): string {
    return this.canvas.toDataURL("image/png");
  }

  /** Current frame as plain ASCII text (respects charset / adjustments). */
  getText(): string {
    const { cols, rows } = this.sampleDimensions();
    if (cols === 0 || rows === 0 || !this.stream) return "";
    this.drawSampler(cols, rows);
    const data = this.sctx.getImageData(0, 0, cols, rows);
    return imageDataToText(data, this.opts);
  }

  private sampleDimensions(): { cols: number; rows: number } {
    const cols = Math.max(1, Math.round(this.opts.columns));
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const rows = rowsForColumns(cols, vw, vh);
    return { cols, rows };
  }

  private drawSampler(cols: number, rows: number): void {
    if (this.sampler.width !== cols) this.sampler.width = cols;
    if (this.sampler.height !== rows) this.sampler.height = rows;
    this.sctx.drawImage(this.video, 0, 0, cols, rows);
  }

  private resizeCanvas(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.style.background = this.opts.background;
    if (this.state !== "running") this.renderIdle();
  }

  private renderIdle(): void {
    const { width, height } = this.canvas;
    this.ctx.fillStyle = this.opts.background;
    this.ctx.fillRect(0, 0, width, height);
  }

  private loop = (): void => {
    if (this.state !== "running") return;
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private render(): void {
    if (this.video.readyState < 2) return;
    const { cols, rows } = this.sampleDimensions();
    this.drawSampler(cols, rows);
    const { data } = this.sctx.getImageData(0, 0, cols, rows);

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const cell = Math.min(cw / cols, ch / rows);
    const offsetX = (cw - cell * cols) / 2;
    const offsetY = (ch - cell * rows) / 2;

    this.ctx.fillStyle = this.opts.background;
    this.ctx.fillRect(0, 0, cw, ch);

    // A little overlap avoids hairline gaps between cells.
    const fontPx = cell / 0.5;
    this.ctx.font = `${fontPx}px "Courier New", ui-monospace, monospace`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    const { charset, colorMode, invert, contrast, brightness, foreground, mirror } = this.opts;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const sx = mirror ? cols - 1 - x : x;
        const i = (y * cols + sx) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const v = adjust(luma(r, g, b), contrast, brightness, invert);
        const ch2 = charForLuma(v, charset);
        if (ch2 === " ") continue;

        if (colorMode === "color") {
          this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else if (colorMode === "inverted") {
          this.ctx.fillStyle = `rgb(${255 - r},${255 - g},${255 - b})`;
        } else {
          this.ctx.fillStyle = foreground;
        }

        this.ctx.fillText(
          ch2,
          offsetX + x * cell + cell / 2,
          offsetY + y * cell + cell / 2,
        );
      }
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Camera access was denied. Allow the camera and try again.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "No camera was found.";
      case "NotReadableError":
        return "The camera is already in use by another application.";
    }
  }
  return err instanceof Error ? err.message : "Could not start the camera.";
}
