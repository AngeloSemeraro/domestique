/**
 * Client-side helpers for exporting Strava activities as GPX files —
 * used by the Batch edit tab to send activities to RideWithGPS and to
 * download them as a zip (e.g. for manual import into Komoot, which has
 * no public API).
 */

import { zipSync, strToU8 } from "fflate";
import { apiFetch } from "./api";
import {
  buildMergedGpx,
  DEFAULT_MOVEMENT_FILTER,
  type Streams,
} from "./gpx";
import type { StravaActivity } from "./strava";

/** Movement filter disabled: exports carry the activity exactly as recorded. */
const RAW_EXPORT_FILTER = { ...DEFAULT_MOVEMENT_FILTER, enabled: false };

export async function fetchActivityGpx(a: StravaActivity): Promise<string> {
  const res = await apiFetch(`/api/streams/${a.id}`);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(String(e.error ?? `streams HTTP ${res.status}`));
  }
  const streams = (await res.json()) as Streams;
  if (!streams.latlng?.data?.length) {
    throw new Error("no GPS track (indoor / manual activity?)");
  }
  return buildMergedGpx(
    [
      {
        name: a.name,
        start_date: a.start_date,
        streams,
        sport_hint: a.sport_type,
      },
    ],
    a.name,
    { mode: "natural" },
    RAW_EXPORT_FILTER,
    0
  );
}

export function gpxFilename(a: StravaActivity): string {
  const date = (a.start_date_local ?? a.start_date ?? "").slice(0, 10);
  const slug =
    a.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 50) || "activity";
  return `${date ? date + "-" : ""}${slug}-${a.id}.gpx`;
}

/** Build a zip from named GPX files and trigger its download. */
export function downloadGpxZip(
  files: Array<{ name: string; gpx: string }>,
  zipName: string
): void {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    let name = f.name;
    let i = 2;
    while (entries[name]) {
      name = f.name.replace(/\.gpx$/, `-${i}.gpx`);
      i++;
    }
    entries[name] = strToU8(f.gpx);
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
