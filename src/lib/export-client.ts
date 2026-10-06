/**
 * Client-side helpers for exporting activities as GPX / FIT files — used by
 * the Batch edit tab to download activities as a GPX/FIT zip (e.g. for manual
 * import into Komoot or RideWithGPS, neither of which offers an upload API).
 *
 * Works on two kinds of sources: Strava activities (streams fetched via the
 * backend) and locally-loaded .gpx/.fit files (already parsed in the
 * browser).
 */

import { zipSync, strToU8 } from "fflate";
import { apiFetch } from "./api";
import {
  buildMergedGpx,
  DEFAULT_MOVEMENT_FILTER,
  type Streams,
} from "./gpx";
import { buildFit } from "./fit-writer";
import type { StravaActivity } from "./strava";
import type { ParsedTrack } from "./file-parsers";

/** Movement filter disabled: exports carry the activity exactly as recorded. */
const RAW_EXPORT_FILTER = { ...DEFAULT_MOVEMENT_FILTER, enabled: false };

/** A source the export pipeline can turn into GPX or FIT. */
export type ExportSource = {
  /** Stable id for progress/error reporting (Strava id or synthetic). */
  id: number;
  name: string;
  start_date: string;
  start_date_local?: string;
  sport_hint?: string;
  /** Present for local files; Strava activities fetch lazily. */
  streams?: Streams;
};

export function sourceFromActivity(a: StravaActivity): ExportSource {
  return {
    id: a.id,
    name: a.name,
    start_date: a.start_date,
    start_date_local: a.start_date_local,
    sport_hint: a.sport_type,
  };
}

export function sourceFromParsedFile(
  f: ParsedTrack & { filename?: string },
  syntheticId: number
): ExportSource {
  return {
    id: syntheticId,
    name: f.name,
    start_date: f.start_date,
    sport_hint: "Ride",
    streams: f.streams,
  };
}

/** Fetch an activity's streams via the backend proxy. */
export async function fetchActivityStreams(id: number): Promise<Streams> {
  const res = await apiFetch(`/api/streams/${id}`);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(String(e.error ?? `streams HTTP ${res.status}`));
  }
  const streams = (await res.json()) as Streams;
  if (!streams.latlng?.data?.length) {
    throw new Error("no GPS track (indoor / manual activity?)");
  }
  return streams;
}

async function resolveStreams(s: ExportSource): Promise<Streams> {
  if (s.streams) return s.streams;
  return fetchActivityStreams(s.id);
}

export async function buildSourceGpx(s: ExportSource): Promise<string> {
  const streams = await resolveStreams(s);
  if (!streams.latlng?.data?.length) {
    throw new Error("no GPS track (indoor / manual activity?)");
  }
  return buildMergedGpx(
    [
      {
        name: s.name,
        start_date: s.start_date,
        streams,
        sport_hint: s.sport_hint,
      },
    ],
    s.name,
    { mode: "natural" },
    RAW_EXPORT_FILTER,
    0
  );
}

export async function buildSourceFit(s: ExportSource): Promise<Uint8Array> {
  const streams = await resolveStreams(s);
  return buildFit(streams, s.start_date, s.sport_hint);
}

export function exportFilename(s: ExportSource, ext: "gpx" | "fit"): string {
  const date = (s.start_date_local ?? s.start_date ?? "").slice(0, 10);
  const slug =
    s.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 50) || "activity";
  return `${date ? date + "-" : ""}${slug}-${s.id}.${ext}`;
}

/** Build a zip from named files (text or binary) and trigger its download. */
export function downloadZip(
  files: Array<{ name: string; content: string | Uint8Array }>,
  zipName: string
): void {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    let name = f.name;
    let i = 2;
    while (entries[name]) {
      name = f.name.replace(/(\.\w+)$/, `-${i}$1`);
      i++;
    }
    entries[name] = typeof f.content === "string" ? strToU8(f.content) : f.content;
  }
  const zipped = zipSync(entries, { level: 6 });
  const blob = new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = zipName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
