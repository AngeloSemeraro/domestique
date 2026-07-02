// Core ASCII conversion helpers — no DOM, pure functions so they are easy to
// test and reuse.

/** Built-in character ramps, ordered from darkest to lightest. */
export const CHARSETS: Record<string, string> = {
  standard: " .:-=+*#%@",
  detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: " ░▒▓█",
  minimal: " .*#",
  binary: " 01",
};

export type ColorMode = "color" | "mono" | "inverted";

export interface AsciiOptions {
  /** Number of characters across. Height is derived from the video aspect. */
  columns: number;
  /** Character ramp, dark -> light. */
  charset: string;
  /** How color is applied to the rendered characters. */
  colorMode: ColorMode;
  /** Invert the brightness -> character mapping. */
  invert: boolean;
  /** Contrast multiplier around mid-grey. 1 = unchanged. */
  contrast: number;
  /** Brightness offset in [-1, 1]. 0 = unchanged. */
  brightness: number;
  /** Foreground color for mono / inverted modes. */
  foreground: string;
  /** Background color of the canvas. */
  background: string;
  /** Mirror the image horizontally (natural "selfie" view). */
  mirror: boolean;
}

export const DEFAULT_OPTIONS: AsciiOptions = {
  columns: 110,
  charset: CHARSETS.standard,
  colorMode: "color",
  invert: false,
  contrast: 1,
  brightness: 0,
  foreground: "#e8e8e8",
  background: "#0a0a0a",
  mirror: true,
};

/** Rec. 601 luma from 8-bit RGB, returned in [0, 1]. */
export function luma(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Apply brightness/contrast/invert to a [0,1] luminance value and clamp.
 */
export function adjust(
  value: number,
  contrast: number,
  brightness: number,
  invert: boolean,
): number {
  let v = (value - 0.5) * contrast + 0.5 + brightness;
  if (invert) v = 1 - v;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Map a [0,1] luminance to a character from the ramp. Darkest luminance maps
 * to the first character (index 0).
 */
export function charForLuma(value: number, charset: string): string {
  if (charset.length === 0) return " ";
  const idx = Math.min(charset.length - 1, Math.floor(value * charset.length));
  return charset[idx];
}

/**
 * Given the source video dimensions and a target column count, compute how many
 * character rows keep the aspect ratio correct. Monospace glyphs are roughly
 * twice as tall as they are wide, so we scale the row count by `charAspect`.
 */
export function rowsForColumns(
  columns: number,
  videoWidth: number,
  videoHeight: number,
  charAspect = 0.5,
): number {
  if (videoWidth === 0) return 1;
  return Math.max(1, Math.round(columns * (videoHeight / videoWidth) * charAspect));
}

/**
 * Convert an ImageData grid (already downsampled to columns x rows) into a plain
 * text string, honoring the current options. Used for "copy as text".
 */
export function imageDataToText(
  data: ImageData,
  opts: Pick<AsciiOptions, "charset" | "invert" | "contrast" | "brightness" | "mirror">,
): string {
  const { width, height, data: px } = data;
  const lines: string[] = [];
  for (let y = 0; y < height; y++) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const sx = opts.mirror ? width - 1 - x : x;
      const i = (y * width + sx) * 4;
      const v = adjust(luma(px[i], px[i + 1], px[i + 2]), opts.contrast, opts.brightness, opts.invert);
      line += charForLuma(v, opts.charset);
    }
    lines.push(line.replace(/\s+$/u, ""));
  }
  return lines.join("\n");
}
