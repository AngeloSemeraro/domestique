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

/**
 * Flatten multiple StreamedActivity sources into a single ParsedTrack-shaped
 * object suitable for charts and stat displays. The combined `time` stream
 * is in seconds offset from the first source's start, so display widgets
 * see one continuous index sequence. Source boundaries are reflected as
 * time jumps in the stream (the Analyzer's maxJumpKm-based heuristics will
 * skip the corresponding distance/speed.)
 */
export function combineSourcesForDisplay(
  sources: StreamedActivity[]
): {
  start_date: string;
  streams: Streams;
  point_count: number;
} {
  const sorted = [...sources].sort(
    (a, b) => +new Date(a.start_date) - +new Date(b.start_date)
  );
  if (sorted.length === 0) {
    return {
      start_date: new Date().toISOString(),
      streams: { latlng: { data: [] }, time: { data: [] } },
      point_count: 0,
    };
  }
  const baseMs = +new Date(sorted[0].start_date);
  const latlng: Array<[number, number]> = [];
  const time: number[] = [];
  const altitude: Array<number | undefined> = [];
  const heartrate: Array<number | undefined> = [];
  const cadence: Array<number | undefined> = [];
  const temperature: Array<number | undefined> = [];
  for (const s of sorted) {
    const srcMs = +new Date(s.start_date);
    const offsetSec = Math.round((srcMs - baseMs) / 1000);
    const sll = s.streams.latlng?.data ?? [];
    const st = s.streams.time?.data ?? [];
    const sa = s.streams.altitude?.data ?? [];
    const sh = s.streams.heartrate?.data ?? [];
    const sc = s.streams.cadence?.data ?? [];
    const stmp = s.streams.temperature?.data ?? [];
    for (let i = 0; i < sll.length; i++) {
      latlng.push(sll[i]);
      time.push(offsetSec + (st[i] ?? i));
      altitude.push(sa[i]);
      heartrate.push(sh[i]);
      cadence.push(sc[i]);
      temperature.push(stmp[i]);
    }
  }
  return {
    start_date: new Date(baseMs).toISOString(),
    streams: {
      latlng: { data: latlng },
      time: { data: time },
      ...(altitude.some((v) => v !== undefined) ? { altitude: { data: altitude } } : {}),
      ...(heartrate.some((v) => v !== undefined) ? { heartrate: { data: heartrate } } : {}),
      ...(cadence.some((v) => v !== undefined) ? { cadence: { data: cadence } } : {}),
      ...(temperature.some((v) => v !== undefined) ? { temperature: { data: temperature } } : {}),
    },
    point_count: latlng.length,
  };
}

export type TimingOptions =
  | { mode: "natural" }
  | { mode: "target_kmh"; kmh: number };

export type MovementFilter = {
  enabled: boolean;
  minKmh: number;
  maxKmh: number;
  minRunPoints: number;
  /** Inter-point distances above this many km are treated as a teleport
   *  (e.g. a phantom 100 km jump between two recording sessions) and force
   *  a segment split. The jump itself is excluded from totals. */
  maxJumpKm: number;
  /** If true and cadence stream exists, drop segments whose avg cadence
   *  is below `minAvgCadenceRpm` (treno/auto = 0 rpm sustained). */
  useCadence: boolean;
  minAvgCadenceRpm: number;
  /** If true and HR stream exists, drop segments whose avg HR is below
   *  `minAvgHeartRate` bpm (sedentary on train/car ~60-95; riding >105). */
  useHeartRate: boolean;
  minAvgHeartRate: number;
};

export const DEFAULT_MOVEMENT_FILTER: MovementFilter = {
  enabled: true,
  minKmh: 3,
  maxKmh: 80,
  minRunPoints: 5,
  maxJumpKm: 1,
  useCadence: true,
  minAvgCadenceRpm: 10,
  useHeartRate: true,
  minAvgHeartRate: 105,
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

/** Total polyline distance in km of a latlng stream. Pass `maxJumpKm` to
 *  exclude single-point teleports (e.g. inter-session gaps). */
export function streamDistanceKm(
  latlng: Array<[number, number]>,
  maxJumpKm?: number
): number {
  let d = 0;
  for (let i = 1; i < latlng.length; i++) {
    const step = haversineKm(latlng[i - 1], latlng[i]);
    if (maxJumpKm !== undefined && step > maxJumpKm) continue;
    d += step;
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
    const tooBig = dKm > (filter.maxJumpKm || Infinity);
    const ok =
      !tooBig && speedKmh >= filter.minKmh && speedKmh <= filter.maxKmh;
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
    // Combine cadence and HR checks: a segment is "non-cycling" only when
    // BOTH signals agree. A long freewheel descent has cadence=0 but HR
    // still elevated → kept. A train ride has cadence=0 AND HR at rest →
    // dropped. If only one signal is enabled or only one is present in
    // the stream, that one alone decides.
    const cadFails =
      filter.useCadence &&
      (() => {
        const avg = segmentAverage(cad, r.start, r.end);
        return avg !== null && avg < filter.minAvgCadenceRpm;
      })();
    const hrFails =
      filter.useHeartRate &&
      (() => {
        const avg = segmentAverage(hr, r.start, r.end);
        return avg !== null && avg < filter.minAvgHeartRate;
      })();
    const cadEnabled =
      filter.useCadence && segmentAverage(cad, r.start, r.end) !== null;
    const hrEnabled =
      filter.useHeartRate && segmentAverage(hr, r.start, r.end) !== null;
    if (cadEnabled && hrEnabled) return !(cadFails && hrFails);
    if (cadEnabled) return !cadFails;
    if (hrEnabled) return !hrFails;
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

export type PlannedPoint = {
  lat: number;
  lng: number;
  ms: number;
  ele?: number;
  hr?: number;
  cad?: number;
  temp?: number;
  /** Cumulative distance in metres up to this point. Teleports (steps above
   *  maxJumpKm) are NOT added, so the final value is the real ridden
   *  distance — this is what TCX writes into <DistanceMeters>. */
  distM: number;
};

export type PlannedGroup = {
  activity: StreamedActivity;
  points: PlannedPoint[];
};

const NO_FILTER: MovementFilter = {
  enabled: false,
  minKmh: 0,
  maxKmh: Infinity,
  minRunPoints: 1,
  maxJumpKm: Infinity,
  useCadence: false,
  minAvgCadenceRpm: 0,
  useHeartRate: false,
  minAvgHeartRate: 0,
};

/**
 * Shared planning step for both GPX and TCX export. Applies the movement
 * filter, orders sources chronologically, computes per-point absolute
 * timestamps (respecting the timing mode) and a cumulative distance that
 * skips teleports. Returns one group per source activity.
 */
export function planMergedGroups(
  activities: StreamedActivity[],
  timing: TimingOptions,
  movement: MovementFilter
): PlannedGroup[] {
  const sorted = [...activities].sort(
    (a, b) => +new Date(a.start_date) - +new Date(b.start_date)
  );

  type RunPlan = { activity: StreamedActivity; start: number; end: number };
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
  let cursorMs = plans[0] ? +new Date(plans[0].activity.start_date) : Date.now();
  const useContinuous = timing.mode === "target_kmh";
  const maxJumpKm = movement.maxJumpKm || Infinity;

  if (timing.mode === "target_kmh") {
    let totalKm = 0;
    let totalOriginalSec = 0;
    for (const p of plans) {
      const ll = p.activity.streams.latlng?.data ?? [];
      const t = p.activity.streams.time?.data ?? [];
      for (let i = p.start + 1; i <= p.end; i++) {
        const step = haversineKm(ll[i - 1], ll[i]);
        if (step <= maxJumpKm) totalKm += step;
      }
      totalOriginalSec += (t[p.end] ?? 0) - (t[p.start] ?? 0);
    }
    const targetSec = totalKm > 0 ? (totalKm / timing.kmh) * 3600 : 0;
    scaleFactor = totalOriginalSec > 0 ? targetSec / totalOriginalSec : 1;
  }

  const grouped: Array<{ activity: StreamedActivity; plans: RunPlan[] }> = [];
  for (const plan of plans) {
    const last = grouped[grouped.length - 1];
    if (last && last.activity === plan.activity) last.plans.push(plan);
    else grouped.push({ activity: plan.activity, plans: [plan] });
  }

  const out: PlannedGroup[] = [];
  let cumulativeM = 0;
  let prevLL: [number, number] | null = null;

  for (let gi = 0; gi < grouped.length; gi++) {
    const group = grouped[gi];
    const a = group.activity;
    const latlng = a.streams.latlng?.data ?? [];
    const time = a.streams.time?.data ?? [];
    const alt = a.streams.altitude?.data ?? [];
    const hr = a.streams.heartrate?.data ?? [];
    const cad = a.streams.cadence?.data ?? [];
    const temp = a.streams.temperature?.data ?? [];

    const sourceBaseOffset = time[group.plans[0].start];
    const sourceStartMs = useContinuous
      ? cursorMs
      : +new Date(a.start_date) + sourceBaseOffset * 1000;

    const points: PlannedPoint[] = [];
    for (const plan of group.plans) {
      for (let i = plan.start; i <= plan.end; i++) {
        const ll = latlng[i];
        if (!ll || ll.length !== 2) continue;
        const [lat, lng] = ll;
        if (prevLL) {
          const stepKm = haversineKm(prevLL, [lat, lng]);
          if (stepKm <= maxJumpKm) cumulativeM += stepKm * 1000;
        }
        prevLL = [lat, lng];
        const tRaw = time[i] ?? i;
        const deltaSec = (tRaw - sourceBaseOffset) * scaleFactor;
        points.push({
          lat,
          lng,
          ms: sourceStartMs + deltaSec * 1000,
          ele: alt[i],
          hr: hr[i],
          cad: cad[i],
          temp: temp[i],
          distM: cumulativeM,
        });
      }
    }

    if (useContinuous) {
      const lastPlan = group.plans[group.plans.length - 1];
      const sourceEndOffset = time[lastPlan.end];
      const sourceDurationSec =
        (sourceEndOffset - sourceBaseOffset) * scaleFactor;
      const sourceEndMs = sourceStartMs + sourceDurationSec * 1000;
      const nextGroup = grouped[gi + 1];
      let gapSec = 1;
      if (nextGroup) {
        const lastLL = latlng[lastPlan.end];
        const nextStart = nextGroup.plans[0].start;
        const nextLL =
          nextGroup.activity.streams.latlng?.data?.[nextStart] ?? lastLL;
        const jumpKm = haversineKm(lastLL, nextLL);
        const minBoundarySec = (jumpKm / 120) * 3600;
        const lastMs = +new Date(a.start_date) + sourceEndOffset * 1000;
        const nextMs =
          +new Date(nextGroup.activity.start_date) +
          (nextGroup.activity.streams.time?.data?.[nextStart] ?? 0) * 1000;
        const realCrossSec = Math.max(0, (nextMs - lastMs) / 1000);
        gapSec = Math.max(minBoundarySec, realCrossSec * scaleFactor, 1);
      }
      cursorMs = sourceEndMs + gapSec * 1000;
    }

    if (points.length > 0) out.push({ activity: a, points });
  }

  return out;
}

/**
 * Build a single GPX 1.1 document. NOTE: GPX has no distance field, so Strava
 * recomputes distance by summing GPS points — including any teleport between
 * sources. Use buildMergedTcx for Strava uploads where the total must exclude
 * unrecorded transfers.
 */
export function buildMergedGpx(
  activities: StreamedActivity[],
  trackName: string,
  timing: TimingOptions = { mode: "natural" },
  movement: MovementFilter = NO_FILTER
): string {
  const groups = planMergedGroups(activities, timing, movement);
  const metadataTime =
    groups[0]?.points[0] !== undefined
      ? new Date(groups[0].points[0].ms).toISOString()
      : new Date().toISOString();

  let segs = "";
  for (const group of groups) {
    const pts = group.points
      .map((p) => {
        const iso = new Date(p.ms).toISOString();
        const eleTag = p.ele !== undefined ? `<ele>${p.ele}</ele>` : "";
        const hrTag =
          p.hr !== undefined ? `<gpxtpx:hr>${Math.round(p.hr)}</gpxtpx:hr>` : "";
        const cadTag =
          p.cad !== undefined ? `<gpxtpx:cad>${Math.round(p.cad)}</gpxtpx:cad>` : "";
        const tempTag =
          p.temp !== undefined
            ? `<gpxtpx:atemp>${Math.round(p.temp)}</gpxtpx:atemp>`
            : "";
        const ext =
          hrTag || cadTag || tempTag
            ? `<extensions><gpxtpx:TrackPointExtension>${hrTag}${cadTag}${tempTag}</gpxtpx:TrackPointExtension></extensions>`
            : "";
        return `<trkpt lat="${p.lat}" lon="${p.lng}">${eleTag}<time>${iso}</time>${ext}</trkpt>`;
      })
      .join("");
    const trkType = gpxTypeFromSport(group.activity.sport_hint);
    segs += `<trk><name>${xmlEsc(group.activity.name)}</name><type>${xmlEsc(trkType)}</type><trkseg>${pts}</trkseg></trk>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava Batch Editor" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<metadata><name>${xmlEsc(trackName)}</name><time>${metadataTime}</time></metadata>
${segs}
</gpx>`;
}

function tcxSport(sport: string | undefined): string {
  const t = gpxTypeFromSport(sport);
  if (t === "Running") return "Running";
  return "Biking";
}

/**
 * Build a TCX document. Unlike GPX, every Trackpoint carries a cumulative
 * <DistanceMeters> (an odometer that skips teleports), and each source
 * becomes a <Lap> with its own TotalTimeSeconds / DistanceMeters. Strava
 * trusts these distance fields instead of recomputing from GPS, so the
 * unrecorded transfer between two source rides never inflates the total —
 * this is how GOTOES (which uploads FIT, same principle) gets it right.
 */
export function buildMergedTcx(
  activities: StreamedActivity[],
  trackName: string,
  timing: TimingOptions = { mode: "natural" },
  movement: MovementFilter = NO_FILTER
): string {
  const groups = planMergedGroups(activities, timing, movement);
  const firstPt = groups[0]?.points[0];
  const activityId = firstPt
    ? new Date(firstPt.ms).toISOString()
    : new Date().toISOString();
  const sport = tcxSport(activities.find((a) => a.sport_hint)?.sport_hint);

  let laps = "";
  for (const group of groups) {
    const pts = group.points;
    if (pts.length === 0) continue;
    const lapStartIso = new Date(pts[0].ms).toISOString();
    const lapStartDist = pts[0].distM;
    const lapEndDist = pts[pts.length - 1].distM;
    const lapDistM = Math.max(0, lapEndDist - lapStartDist);
    const lapSec = Math.max(0, (pts[pts.length - 1].ms - pts[0].ms) / 1000);

    const trkpts = pts
      .map((p) => {
        const iso = new Date(p.ms).toISOString();
        const pos = `<Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lng}</LongitudeDegrees></Position>`;
        const ele = p.ele !== undefined ? `<AltitudeMeters>${p.ele}</AltitudeMeters>` : "";
        const dist = `<DistanceMeters>${p.distM.toFixed(2)}</DistanceMeters>`;
        const hr =
          p.hr !== undefined
            ? `<HeartRateBpm><Value>${Math.round(p.hr)}</Value></HeartRateBpm>`
            : "";
        const cad =
          p.cad !== undefined ? `<Cadence>${Math.min(254, Math.round(p.cad))}</Cadence>` : "";
        return `<Trackpoint><Time>${iso}</Time>${pos}${ele}${dist}${hr}${cad}</Trackpoint>`;
      })
      .join("");

    laps += `<Lap StartTime="${lapStartIso}"><TotalTimeSeconds>${lapSec.toFixed(0)}</TotalTimeSeconds><DistanceMeters>${lapDistM.toFixed(2)}</DistanceMeters><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>${trkpts}</Track></Lap>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
<Activities><Activity Sport="${sport}"><Id>${activityId}</Id><Notes>${xmlEsc(trackName)}</Notes>${laps}<Creator xsi:type="Device_t"><Name>Strava Batch Editor</Name></Creator></Activity></Activities>
</TrainingCenterDatabase>`;
}
