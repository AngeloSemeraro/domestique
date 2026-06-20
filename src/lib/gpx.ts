export type Streams = {
  latlng?: { data: Array<[number, number]> };
  time?: { data: number[] };
  altitude?: { data: Array<number | undefined> };
  heartrate?: { data: Array<number | undefined> };
  cadence?: { data: Array<number | undefined> };
  temperature?: { data: Array<number | undefined> };
};

export type StreamedActivity = {
  name: string;
  start_date: string;
  streams: Streams;
  /** Optional GPX <type> for the track. Defaults to "Biking" when omitted. */
  sport_hint?: string;
};

/** Map a Strava sport_type to a GPX 1.1 <type> value Strava recognizes. */
export function gpxTypeFromSport(sport: string | undefined): string {
  if (!sport) return "Biking";
  if (/Run|Walk|Hike/i.test(sport)) return "Running";
  if (/Swim/i.test(sport)) return "Swimming";
  if (/Ski|Snow/i.test(sport)) return "Skiing";
  return "Biking";
}

export type TimingOptions =
  | { mode: "natural" }
  | { mode: "target_kmh"; kmh: number };

export type MovementFilter = {
  enabled: boolean;
  minKmh: number;
  maxKmh: number;
  minRunPoints: number;
  /** If true and cadence stream exists, drop segments whose avg cadence
   *  is below `minAvgCadenceRpm` (treno/auto = 0 rpm sustained). */
  useCadence: boolean;
  minAvgCadenceRpm: number;
  /** If true and HR stream exists, drop segments whose avg HR is below
   *  `minAvgHeartRate` bpm (sedentary on train/car ~60-80; riding >100). */
  useHeartRate: boolean;
  minAvgHeartRate: number;
};

export const DEFAULT_MOVEMENT_FILTER: MovementFilter = {
  enabled: true,
  minKmh: 3,
  maxKmh: 80,
  minRunPoints: 5,
  useCadence: true,
  minAvgCadenceRpm: 10,
  useHeartRate: true,
  minAvgHeartRate: 90,
};

function segmentAverage(
  arr: Array<number | undefined> | undefined,
  start: number,
  end: number
): number | null {
  if (!arr) return null;
  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i++) {
    const v = arr[i];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

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

/**
 * Activity moving avg speed (km/h) from streams. Mirrors what bike
 * computers (Wahoo, Garmin) and Strava show by default: distance /
 * moving time, excluding stopped intervals (per-point speed outside
 * [minKmh, maxKmh] is ignored). Pass `filter` to override the defaults.
 */
export function streamAvgKmh(
  streams: Streams,
  filter: MovementFilter = DEFAULT_MOVEMENT_FILTER
): number {
  const { km, sec } = filteredStats(streams, filter);
  const hours = sec / 3600;
  return hours > 0 ? km / hours : 0;
}

/** Like streamAvgKmh but uses the raw elapsed time (no movement filter). */
export function streamElapsedAvgKmh(streams: Streams): number {
  const ll = streams.latlng?.data ?? [];
  const t = streams.time?.data ?? [];
  if (ll.length < 2 || t.length < 2) return 0;
  const km = streamDistanceKm(ll);
  const hours = (t[t.length - 1] - t[0]) / 3600;
  return hours > 0 ? km / hours : 0;
}

/**
 * Scan a stream and return the index ranges where movement looks valid
 * (per-point speed inside [minKmh, maxKmh]). Drops noisy micro-runs.
 */
export function movingRuns(
  streams: Streams,
  filter: MovementFilter
): Array<{ start: number; end: number }> {
  const ll = streams.latlng?.data ?? [];
  const t = streams.time?.data ?? [];
  if (ll.length < 2 || t.length < 2) return [];

  const runs: Array<{ start: number; end: number }> = [];
  let runStart: number | null = null;

  for (let i = 1; i < ll.length; i++) {
    const dKm = haversineKm(ll[i - 1], ll[i]);
    const dtH = (t[i] - t[i - 1]) / 3600;
    const speedKmh = dtH > 0 ? dKm / dtH : 0;
    const ok = speedKmh >= filter.minKmh && speedKmh <= filter.maxKmh;
    if (ok) {
      if (runStart === null) runStart = i - 1;
    } else if (runStart !== null) {
      runs.push({ start: runStart, end: i - 1 });
      runStart = null;
    }
  }
  if (runStart !== null) {
    runs.push({ start: runStart, end: ll.length - 1 });
  }
  const cad = streams.cadence?.data;
  const hr = streams.heartrate?.data;
  return runs.filter((r) => {
    if (r.end - r.start + 1 < filter.minRunPoints) return false;
    if (filter.useCadence) {
      const avg = segmentAverage(cad, r.start, r.end);
      if (avg !== null && avg < filter.minAvgCadenceRpm) return false;
    }
    if (filter.useHeartRate) {
      const avg = segmentAverage(hr, r.start, r.end);
      if (avg !== null && avg < filter.minAvgHeartRate) return false;
    }
    return true;
  });
}

/** Distance (km) and elapsed time (seconds) kept by a movement filter. */
export function filteredStats(
  streams: Streams,
  filter: MovementFilter
): { km: number; sec: number } {
  const runs = filter.enabled
    ? movingRuns(streams, filter)
    : streams.latlng?.data?.length
      ? [{ start: 0, end: streams.latlng.data.length - 1 }]
      : [];
  const ll = streams.latlng?.data ?? [];
  const t = streams.time?.data ?? [];
  let km = 0;
  let sec = 0;
  for (const r of runs) {
    for (let i = r.start + 1; i <= r.end; i++) {
      km += haversineKm(ll[i - 1], ll[i]);
    }
    sec += (t[r.end] ?? 0) - (t[r.start] ?? 0);
  }
  return { km, sec };
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
  timing: TimingOptions = { mode: "natural" },
  movement: MovementFilter = {
    enabled: false,
    minKmh: 0,
    maxKmh: Infinity,
    minRunPoints: 1,
    useCadence: false,
    minAvgCadenceRpm: 0,
    useHeartRate: false,
    minAvgHeartRate: 0,
  }
): string {
  const sorted = [...activities].sort(
    (a, b) => +new Date(a.start_date) - +new Date(b.start_date)
  );

  // Build the list of (source, run) pairs we'll emit.
  type RunPlan = {
    activity: StreamedActivity;
    start: number;
    end: number;
  };
  const plans: RunPlan[] = [];
  for (const a of sorted) {
    const ll = a.streams.latlng?.data ?? [];
    const t = a.streams.time?.data ?? [];
    if (ll.length === 0 || t.length === 0) continue;
    const runs = movement.enabled
      ? movingRuns(a.streams, movement)
      : [{ start: 0, end: ll.length - 1 }];
    for (const r of runs) plans.push({ activity: a, ...r });
  }

  let scaleFactor = 1;
  let cursorMs =
    plans[0] ? +new Date(plans[0].activity.start_date) : Date.now();
  const useContinuous = timing.mode === "target_kmh";

  if (timing.mode === "target_kmh") {
    let totalKm = 0;
    let totalOriginalSec = 0;
    for (const p of plans) {
      const ll = p.activity.streams.latlng?.data ?? [];
      const t = p.activity.streams.time?.data ?? [];
      for (let i = p.start + 1; i <= p.end; i++) {
        totalKm += haversineKm(ll[i - 1], ll[i]);
      }
      totalOriginalSec += (t[p.end] ?? 0) - (t[p.start] ?? 0);
    }
    const targetSec = totalKm > 0 ? (totalKm / timing.kmh) * 3600 : 0;
    scaleFactor = totalOriginalSec > 0 ? targetSec / totalOriginalSec : 1;
  }

  const metadataTime = sorted[0]?.start_date ?? new Date().toISOString();
  let segs = "";

  for (let pi = 0; pi < plans.length; pi++) {
    const plan = plans[pi];
    const a = plan.activity;
    const latlng = a.streams.latlng?.data ?? [];
    const time = a.streams.time?.data ?? [];
    const alt = a.streams.altitude?.data ?? [];
    const hr = a.streams.heartrate?.data ?? [];
    const cad = a.streams.cadence?.data ?? [];
    const temp = a.streams.temperature?.data ?? [];

    const baseTimeOffset = time[plan.start];
    const segStartMs = useContinuous
      ? cursorMs
      : +new Date(a.start_date) + baseTimeOffset * 1000;

    const pts: string[] = [];
    for (let i = plan.start; i <= plan.end; i++) {
      const ll = latlng[i];
      if (!ll || ll.length !== 2) continue;
      const [lat, lng] = ll;
      const tRaw = time[i] ?? i;
      const deltaSec = (tRaw - baseTimeOffset) * scaleFactor;
      const iso = new Date(segStartMs + deltaSec * 1000).toISOString();
      const eleV = alt[i];
      const hrV = hr[i];
      const cadV = cad[i];
      const tempV = temp[i];
      const eleTag = eleV !== undefined ? `<ele>${eleV}</ele>` : "";
      const hrTag =
        hrV !== undefined ? `<gpxtpx:hr>${Math.round(hrV)}</gpxtpx:hr>` : "";
      const cadTag =
        cadV !== undefined ? `<gpxtpx:cad>${Math.round(cadV)}</gpxtpx:cad>` : "";
      const tempTag =
        tempV !== undefined ? `<gpxtpx:atemp>${Math.round(tempV)}</gpxtpx:atemp>` : "";
      const ext =
        hrTag || cadTag || tempTag
          ? `<extensions><gpxtpx:TrackPointExtension>${hrTag}${cadTag}${tempTag}</gpxtpx:TrackPointExtension></extensions>`
          : "";
      pts.push(
        `<trkpt lat="${lat}" lon="${lng}">${eleTag}<time>${iso}</time>${ext}</trkpt>`
      );
    }

    if (useContinuous) {
      const segDurationSec =
        (time[plan.end] - baseTimeOffset) * scaleFactor;
      const segEndMs = segStartMs + segDurationSec * 1000;
      // Compute the gap to the next plan. Within the same source we trust the
      // dropped-section duration as the real gap; across sources we use the
      // wall-clock gap between source 1 end and source 2 start. Both get
      // multiplied by the same scaleFactor so the output keeps the requested
      // average. We never collapse a gap below the geographically-implied
      // minimum (cap at 120 km/h across boundaries) so a 100 km source-to-
      // source teleport can't show up as 360 000 km/h.
      const next = plans[pi + 1];
      let gapSec = 1;
      if (next) {
        const lastLL = latlng[plan.end];
        const nextLL =
          next.activity.streams.latlng?.data?.[next.start] ?? lastLL;
        const jumpKm = haversineKm(lastLL, nextLL);
        const minBoundarySec = (jumpKm / 120) * 3600;
        if (next.activity === a) {
          const realDroppedSec =
            (next.activity.streams.time?.data?.[next.start] ?? 0) -
            (time[plan.end] ?? 0);
          gapSec = Math.max(1, realDroppedSec * scaleFactor);
        } else {
          const lastMs =
            +new Date(a.start_date) + (time[plan.end] ?? 0) * 1000;
          const nextMs =
            +new Date(next.activity.start_date) +
            (next.activity.streams.time?.data?.[next.start] ?? 0) * 1000;
          const realCrossSec = Math.max(0, (nextMs - lastMs) / 1000);
          gapSec = Math.max(minBoundarySec, realCrossSec * scaleFactor, 1);
        }
      }
      cursorMs = segEndMs + gapSec * 1000;
    }

    segs += `<trkseg>${pts.join("")}</trkseg>`;
  }

  const sportHint = sorted.find((a) => a.sport_hint)?.sport_hint;
  const trkType = gpxTypeFromSport(sportHint);

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava Batch Editor" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<metadata><time>${metadataTime}</time></metadata>
<trk><name>${xmlEsc(trackName)}</name><type>${xmlEsc(trkType)}</type>${segs}</trk>
</gpx>`;
}
