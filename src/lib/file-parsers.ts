import FitParser from "fit-file-parser";
import type { Streams } from "./gpx";

export type Waypoint = {
  lat: number;
  lon: number;
  name?: string;
  desc?: string;
  sym?: string;
  ele?: number;
};

export type ParsedTrack = {
  name: string;
  start_date: string;
  streams: Streams;
  point_count: number;
  /** Standalone points of interest: <wpt> in GPX, course points in FIT. */
  waypoints?: Waypoint[];
  /** False when the file carried no timestamps and 1 s/point times were
   *  synthesized so charts, exports and uploads still work. */
  has_time?: boolean;
};

/** Parse a GPX file (XML) in the browser. Picks the first <trk>. */
export async function parseGpxFile(file: File): Promise<ParsedTrack> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parseErr = doc.querySelector("parsererror");
  if (parseErr) throw new Error(`GPX parse error in ${file.name}`);

  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  if (trkpts.length === 0) {
    throw new Error(`${file.name}: no <trkpt> elements found`);
  }

  const latlng: Array<[number, number]> = [];
  const time: number[] = [];
  const altitude: Array<number | undefined> = [];
  const heartrate: Array<number | undefined> = [];
  const cadence: Array<number | undefined> = [];
  const temperature: Array<number | undefined> = [];

  // Base time comes from the first <trkpt> with a parsable <time>. Files
  // without any timestamps (route exports, drawn tracks) fall back to the
  // file's mtime with synthetic 1 s/point offsets instead of failing.
  let baseMs = NaN;
  for (const p of trkpts) {
    const t = p.getElementsByTagName("time")[0]?.textContent;
    if (t) {
      const ms = +new Date(t);
      if (!Number.isNaN(ms)) {
        baseMs = ms;
        break;
      }
    }
  }
  const hasTime = !Number.isNaN(baseMs);
  if (!hasTime) baseMs = file.lastModified || Date.now();

  for (const p of trkpts) {
    const lat = parseFloat(p.getAttribute("lat") ?? "");
    const lon = parseFloat(p.getAttribute("lon") ?? "");
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    latlng.push([lat, lon]);

    const t = p.getElementsByTagName("time")[0]?.textContent;
    const ms = t ? +new Date(t) : NaN;
    time.push(Number.isNaN(ms) ? time.length : Math.round((ms - baseMs) / 1000));

    const ele = p.getElementsByTagName("ele")[0]?.textContent;
    altitude.push(ele ? parseFloat(ele) : undefined);

    const hr =
      p.getElementsByTagNameNS("*", "hr")[0]?.textContent ??
      p.getElementsByTagName("hr")[0]?.textContent;
    heartrate.push(hr ? parseFloat(hr) : undefined);

    const cad =
      p.getElementsByTagNameNS("*", "cad")[0]?.textContent ??
      p.getElementsByTagName("cad")[0]?.textContent;
    cadence.push(cad ? parseFloat(cad) : undefined);

    const atemp =
      p.getElementsByTagNameNS("*", "atemp")[0]?.textContent ??
      p.getElementsByTagName("atemp")[0]?.textContent;
    temperature.push(atemp ? parseFloat(atemp) : undefined);
  }

  const waypoints: Waypoint[] = [];
  for (const w of Array.from(doc.getElementsByTagName("wpt"))) {
    const lat = parseFloat(w.getAttribute("lat") ?? "");
    const lon = parseFloat(w.getAttribute("lon") ?? "");
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const eleStr = w.getElementsByTagName("ele")[0]?.textContent;
    const ele = eleStr ? parseFloat(eleStr) : NaN;
    waypoints.push({
      lat,
      lon,
      name: w.getElementsByTagName("name")[0]?.textContent?.trim() || undefined,
      desc: w.getElementsByTagName("desc")[0]?.textContent?.trim() || undefined,
      sym: w.getElementsByTagName("sym")[0]?.textContent?.trim() || undefined,
      ...(Number.isFinite(ele) ? { ele } : {}),
    });
  }

  const trackName =
    doc.querySelector("trk > name")?.textContent?.trim() ||
    file.name.replace(/\.gpx$/i, "");

  return {
    name: trackName,
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
    ...(waypoints.length > 0 ? { waypoints } : {}),
    has_time: hasTime,
  };
}

type FitRecord = {
  position_lat?: number;
  position_long?: number;
  timestamp?: Date | string;
  altitude?: number;
  enhanced_altitude?: number;
  heart_rate?: number;
  cadence?: number;
  temperature?: number;
};

type FitCoursePoint = {
  position_lat?: number;
  position_long?: number;
  name?: string;
  type?: string;
};

/** Parse a FIT file in the browser using fit-file-parser. */
export async function parseFitFile(file: File): Promise<ParsedTrack> {
  const buf = await file.arrayBuffer();
  const parser = new FitParser({
    force: true,
    speedUnit: "km/h",
    lengthUnit: "m",
    temperatureUnit: "celsius",
    elapsedRecordField: false,
    mode: "list",
  });
  const data: {
    records?: FitRecord[];
    course_points?: FitCoursePoint[];
    activity?: unknown;
  } = await parser.parseAsync(buf);

  const records: FitRecord[] = data.records ?? [];
  const withGps = records.filter(
    (r) =>
      typeof r.position_lat === "number" && typeof r.position_long === "number"
  );
  if (withGps.length === 0) {
    throw new Error(`${file.name}: no GPS-bearing records found in FIT`);
  }

  // FIT courses exported without timestamps get synthetic 1 s/point times,
  // same fallback as GPX.
  const firstTs = withGps.find((r) => r.timestamp)?.timestamp;
  const firstMs = firstTs ? +new Date(firstTs) : NaN;
  const hasTime = !Number.isNaN(firstMs);
  const baseMs = hasTime ? firstMs : file.lastModified || Date.now();

  const latlng: Array<[number, number]> = [];
  const time: number[] = [];
  const altitude: Array<number | undefined> = [];
  const heartrate: Array<number | undefined> = [];
  const cadence: Array<number | undefined> = [];
  const temperature: Array<number | undefined> = [];

  for (const r of withGps) {
    latlng.push([r.position_lat as number, r.position_long as number]);
    const ms = r.timestamp ? +new Date(r.timestamp) : NaN;
    time.push(Number.isNaN(ms) ? time.length : Math.round((ms - baseMs) / 1000));
    altitude.push(r.enhanced_altitude ?? r.altitude);
    heartrate.push(r.heart_rate);
    cadence.push(r.cadence);
    temperature.push(r.temperature);
  }

  const waypoints: Waypoint[] = (data.course_points ?? [])
    .filter(
      (c) =>
        typeof c.position_lat === "number" &&
        typeof c.position_long === "number"
    )
    .map((c) => ({
      lat: c.position_lat as number,
      lon: c.position_long as number,
      name: c.name || undefined,
      sym: c.type || undefined,
    }));

  return {
    name: file.name.replace(/\.fit$/i, ""),
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
    ...(waypoints.length > 0 ? { waypoints } : {}),
    has_time: hasTime,
  };
}

export async function parseTrackFile(file: File): Promise<ParsedTrack> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".gpx")) return parseGpxFile(file);
  if (lower.endsWith(".fit")) return parseFitFile(file);
  throw new Error(`Unsupported file type: ${file.name} (expected .gpx or .fit)`);
}
