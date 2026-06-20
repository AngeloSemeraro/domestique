export type Streams = {
  latlng?: { data: Array<[number, number]> };
  time?: { data: number[] };
  altitude?: { data: number[] };
  heartrate?: { data: number[] };
  cadence?: { data: number[] };
};

export type StreamedActivity = {
  name: string;
  start_date: string;
  streams: Streams;
};

export type TimingOptions =
  | { mode: "natural" }
  | { mode: "target_kmh"; kmh: number };

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
function xmlEsc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Total polyline distance in km of a latlng stream. */
export function streamDistanceKm(latlng: Array<[number, number]>): number {
  let d = 0;
  for (let i = 1; i < latlng.length; i++) {
    d += haversineKm(latlng[i - 1], latlng[i]);
  }
  return d;
}

/** Activity avg speed (km/h) from streams, using elapsed time. */
export function streamAvgKmh(streams: Streams): number {
  const ll = streams.latlng?.data ?? [];
  const t = streams.time?.data ?? [];
  if (ll.length < 2 || t.length < 2) return 0;
  const km = streamDistanceKm(ll);
  const hours = (t[t.length - 1] - t[0]) / 3600;
  return hours > 0 ? km / hours : 0;
}

/**
 * Build a single GPX 1.1 document that stitches the given activities into
 * one track with one <trkseg> per activity, in chronological order.
 *
 * timing:
 *  - "natural": preserve each source's absolute timestamps (gaps between
 *    sources are kept as-is; Strava typically excludes them from moving
 *    time but they still appear in the elapsed timeline).
 *  - "target_kmh": concatenate segments end-to-end (no gaps) and uniformly
 *    rescale every per-point delta so the resulting total elapsed time
 *    yields avg = target km/h over the combined distance. Within each
 *    segment the relative pacing is preserved.
 */
export function buildMergedGpx(
  activities: StreamedActivity[],
  trackName: string,
  timing: TimingOptions = { mode: "natural" }
): string {
  const sorted = [...activities].sort(
    (a, b) => +new Date(a.start_date) - +new Date(b.start_date)
  );

  let scaleFactor = 1;
  let cursorMs = sorted[0] ? +new Date(sorted[0].start_date) : Date.now();
  const useContinuous = timing.mode === "target_kmh";

  if (timing.mode === "target_kmh") {
    let totalKm = 0;
    let totalOriginalSec = 0;
    for (const a of sorted) {
      const ll = a.streams.latlng?.data ?? [];
      const t = a.streams.time?.data ?? [];
      if (ll.length < 2 || t.length < 2) continue;
      totalKm += streamDistanceKm(ll);
      totalOriginalSec += t[t.length - 1] - t[0];
    }
    const targetSec = totalKm > 0 ? (totalKm / timing.kmh) * 3600 : 0;
    scaleFactor = totalOriginalSec > 0 ? targetSec / totalOriginalSec : 1;
  }

  const metadataTime = sorted[0]?.start_date ?? new Date().toISOString();
  let segs = "";

  for (const a of sorted) {
    const latlng = a.streams.latlng?.data ?? [];
    const time = a.streams.time?.data ?? [];
    const alt = a.streams.altitude?.data ?? [];
    const hr = a.streams.heartrate?.data ?? [];
    const cad = a.streams.cadence?.data ?? [];
    if (latlng.length === 0 || time.length === 0) continue;

    const baseTimeOffset = time[0];
    const segStartMs = useContinuous
      ? cursorMs
      : +new Date(a.start_date);

    const pts: string[] = [];
    for (let i = 0; i < latlng.length; i++) {
      const ll = latlng[i];
      if (!ll || ll.length !== 2) continue;
      const [lat, lng] = ll;
      const tRaw = time[i] ?? i;
      const deltaSec = (tRaw - baseTimeOffset) * scaleFactor;
      const iso = new Date(segStartMs + deltaSec * 1000).toISOString();
      const eleTag = alt[i] !== undefined ? `<ele>${alt[i]}</ele>` : "";
      const hrTag =
        hr[i] !== undefined ? `<gpxtpx:hr>${Math.round(hr[i])}</gpxtpx:hr>` : "";
      const cadTag =
        cad[i] !== undefined ? `<gpxtpx:cad>${Math.round(cad[i])}</gpxtpx:cad>` : "";
      const ext =
        hrTag || cadTag
          ? `<extensions><gpxtpx:TrackPointExtension>${hrTag}${cadTag}</gpxtpx:TrackPointExtension></extensions>`
          : "";
      pts.push(
        `<trkpt lat="${lat}" lon="${lng}">${eleTag}<time>${iso}</time>${ext}</trkpt>`
      );
    }

    if (useContinuous) {
      const segDurationSec =
        (time[time.length - 1] - baseTimeOffset) * scaleFactor;
      cursorMs = segStartMs + segDurationSec * 1000 + 1000;
    }

    segs += `<trkseg>${pts.join("")}</trkseg>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava Batch Editor" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<metadata><time>${metadataTime}</time></metadata>
<trk><name>${xmlEsc(trackName)}</name>${segs}</trk>
</gpx>`;
}
