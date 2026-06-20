import FitParser from "fit-file-parser";
import type { Streams } from "./gpx";

export type ParsedTrack = {
  name: string;
  start_date: string;
  streams: Streams;
  point_count: number;
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

  const firstTimeStr = trkpts[0].getElementsByTagName("time")[0]?.textContent;
  if (!firstTimeStr) {
    throw new Error(
      `${file.name}: <trkpt> has no <time>; can't determine start.`
    );
  }
  const baseMs = +new Date(firstTimeStr);
  if (Number.isNaN(baseMs)) {
    throw new Error(`${file.name}: invalid first <time> "${firstTimeStr}"`);
  }

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
  const data: { records?: FitRecord[]; activity?: unknown } =
    await parser.parseAsync(buf);

  const records: FitRecord[] = data.records ?? [];
  const withGps = records.filter(
    (r) =>
      typeof r.position_lat === "number" &&
      typeof r.position_long === "number" &&
      r.timestamp
  );
  if (withGps.length === 0) {
    throw new Error(`${file.name}: no GPS-bearing records found in FIT`);
  }

  const baseMs = +new Date(withGps[0].timestamp as Date | string);
  const latlng: Array<[number, number]> = [];
  const time: number[] = [];
  const altitude: Array<number | undefined> = [];
  const heartrate: Array<number | undefined> = [];
  const cadence: Array<number | undefined> = [];
  const temperature: Array<number | undefined> = [];

  for (const r of withGps) {
    latlng.push([r.position_lat as number, r.position_long as number]);
    const ms = +new Date(r.timestamp as Date | string);
    time.push(Math.round((ms - baseMs) / 1000));
    altitude.push(r.enhanced_altitude ?? r.altitude);
    heartrate.push(r.heart_rate);
    cadence.push(r.cadence);
    temperature.push(r.temperature);
  }

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
  };
}

export async function parseTrackFile(file: File): Promise<ParsedTrack> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".gpx")) return parseGpxFile(file);
  if (lower.endsWith(".fit")) return parseFitFile(file);
  throw new Error(`Unsupported file type: ${file.name} (expected .gpx or .fit)`);
}
