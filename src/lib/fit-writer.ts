/**
 * Minimal FIT *activity* file encoder — enough for Strava / RideWithGPS /
 * Komoot imports: file_id + record (GPS/alt/HR/cadence/distance) + lap +
 * session + activity messages, little-endian, with the standard FIT CRC-16.
 *
 * The FIT protocol is published by Garmin in the FIT SDK
 * (https://developer.garmin.com/fit/); field numbers below come from the
 * global profile. We only *write* FIT here — reading stays with
 * fit-file-parser.
 */

import type { Streams } from "./gpx";

const FIT_EPOCH_OFFSET_S = 631065600; // 1989-12-31T00:00:00Z in Unix seconds
const SEMICIRCLES_PER_DEG = 2 ** 31 / 180;

// Base types (encoded in the definition message).
const T = {
  enum: 0x00,
  uint8: 0x02,
  uint16: 0x84,
  sint32: 0x85,
  uint32: 0x86,
  uint32z: 0x8c,
} as const;

const INVALID = {
  [T.enum]: 0xff,
  [T.uint8]: 0xff,
  [T.uint16]: 0xffff,
  [T.sint32]: 0x7fffffff,
  [T.uint32]: 0xffffffff,
  [T.uint32z]: 0,
} as Record<number, number>;

type FieldDef = { num: number; type: number };

class Buf {
  private chunks: number[] = [];
  get length(): number {
    return this.chunks.length;
  }
  u8(v: number) {
    this.chunks.push(v & 0xff);
  }
  u16(v: number) {
    this.u8(v);
    this.u8(v >>> 8);
  }
  u32(v: number) {
    this.u16(v);
    this.u16(Math.floor(v / 0x10000));
  }
  s32(v: number) {
    this.u32(v < 0 ? v + 0x100000000 : v);
  }
  ascii(s: string) {
    for (const c of s) this.u8(c.charCodeAt(0));
  }
  bytes(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

function writeValue(buf: Buf, type: number, v: number | undefined) {
  const value =
    v === undefined || !Number.isFinite(v) ? INVALID[type] : Math.round(v);
  switch (type) {
    case T.enum:
    case T.uint8:
      buf.u8(value);
      break;
    case T.uint16:
      buf.u16(value);
      break;
    case T.sint32:
      buf.s32(value);
      break;
    case T.uint32:
    case T.uint32z:
      buf.u32(value);
      break;
  }
}

function sizeOf(type: number): number {
  return type === T.enum || type === T.uint8 ? 1 : type === T.uint16 ? 2 : 4;
}

/** Definition message for `global` on local message type `local`. */
function writeDefinition(
  buf: Buf,
  local: number,
  global: number,
  fields: FieldDef[]
) {
  buf.u8(0x40 | local);
  buf.u8(0); // reserved
  buf.u8(0); // little-endian
  buf.u16(global);
  buf.u8(fields.length);
  for (const f of fields) {
    buf.u8(f.num);
    buf.u8(sizeOf(f.type));
    buf.u8(f.type);
  }
}

function writeData(
  buf: Buf,
  local: number,
  fields: FieldDef[],
  values: Array<number | undefined>
) {
  buf.u8(local);
  fields.forEach((f, i) => writeValue(buf, f.type, values[i]));
}

/** Standard FIT CRC-16. */
function crc16(data: Uint8Array, crc = 0): number {
  const table = [
    0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
    0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
  ];
  for (const byte of data) {
    let tmp = table[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ table[byte & 0xf];
    tmp = table[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ table[(byte >> 4) & 0xf];
  }
  return crc;
}

function fitSport(hint: string | undefined): number {
  if (!hint) return 2; // cycling
  if (/Run/i.test(hint)) return 1;
  if (/Walk|Hike/i.test(hint)) return 11;
  if (/Swim/i.test(hint)) return 5;
  if (/Ski|Snow/i.test(hint)) return 12;
  return 2;
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Encode an activity as a FIT file.
 *
 * @param streams   latlng (required) + optional time/altitude/heartrate/cadence
 * @param startDate ISO start date; per-point time offsets come from streams.time
 * @param sportHint Strava sport_type; mapped to the FIT sport enum
 */
export function buildFit(
  streams: Streams,
  startDate: string,
  sportHint?: string
): Uint8Array {
  const ll = streams.latlng?.data ?? [];
  const time = streams.time?.data ?? [];
  const alt = streams.altitude?.data ?? [];
  const hr = streams.heartrate?.data ?? [];
  const cad = streams.cadence?.data ?? [];
  if (ll.length === 0) throw new Error("no GPS points to encode");

  const startFit =
    Math.round(+new Date(startDate) / 1000) - FIT_EPOCH_OFFSET_S;

  const body = new Buf();

  // -- file_id ------------------------------------------------------------
  const fileIdFields: FieldDef[] = [
    { num: 0, type: T.enum }, // type = 4 (activity)
    { num: 1, type: T.uint16 }, // manufacturer = 255 (development)
    { num: 2, type: T.uint16 }, // product
    { num: 3, type: T.uint32z }, // serial_number
    { num: 4, type: T.uint32 }, // time_created
  ];
  writeDefinition(body, 0, 0, fileIdFields);
  writeData(body, 0, fileIdFields, [
    4,
    255,
    0,
    Math.floor(Math.random() * 0xfffffffe) + 1,
    startFit,
  ]);

  // -- records ------------------------------------------------------------
  const recordFields: FieldDef[] = [
    { num: 253, type: T.uint32 }, // timestamp
    { num: 0, type: T.sint32 }, // position_lat (semicircles)
    { num: 1, type: T.sint32 }, // position_long
    { num: 5, type: T.uint32 }, // distance (m * 100)
    { num: 2, type: T.uint16 }, // altitude ((m + 500) * 5)
    { num: 3, type: T.uint8 }, // heart_rate
    { num: 4, type: T.uint8 }, // cadence
  ];
  writeDefinition(body, 1, 20, recordFields);

  let dist = 0;
  for (let i = 0; i < ll.length; i++) {
    if (i > 0) {
      const d = haversineM(ll[i - 1], ll[i]);
      // Skip teleport jumps in the odometer, same policy as the TCX builder.
      if (d < 1000) dist += d;
    }
    const t = startFit + (time[i] ?? i);
    const a = alt[i];
    writeData(body, 1, recordFields, [
      t,
      ll[i][0] * SEMICIRCLES_PER_DEG,
      ll[i][1] * SEMICIRCLES_PER_DEG,
      dist * 100,
      typeof a === "number" && Number.isFinite(a) ? (a + 500) * 5 : undefined,
      typeof hr[i] === "number" ? hr[i] : undefined,
      typeof cad[i] === "number" ? cad[i] : undefined,
    ]);
  }

  const lastT = startFit + (time[ll.length - 1] ?? ll.length - 1);
  const elapsedS = Math.max(0, lastT - startFit);

  // -- lap ------------------------------------------------------------------
  const lapFields: FieldDef[] = [
    { num: 253, type: T.uint32 }, // timestamp (lap end)
    { num: 254, type: T.uint16 }, // message_index
    { num: 2, type: T.uint32 }, // start_time
    { num: 7, type: T.uint32 }, // total_elapsed_time (s * 1000)
    { num: 8, type: T.uint32 }, // total_timer_time
    { num: 9, type: T.uint32 }, // total_distance (m * 100)
  ];
  writeDefinition(body, 2, 19, lapFields);
  writeData(body, 2, lapFields, [
    lastT,
    0,
    startFit,
    elapsedS * 1000,
    elapsedS * 1000,
    dist * 100,
  ]);

  // -- session ---------------------------------------------------------------
  const sessionFields: FieldDef[] = [
    { num: 253, type: T.uint32 },
    { num: 254, type: T.uint16 },
    { num: 2, type: T.uint32 }, // start_time
    { num: 5, type: T.enum }, // sport
    { num: 7, type: T.uint32 }, // total_elapsed_time
    { num: 8, type: T.uint32 }, // total_timer_time
    { num: 9, type: T.uint32 }, // total_distance
    { num: 25, type: T.uint16 }, // first_lap_index
    { num: 26, type: T.uint16 }, // num_laps
  ];
  writeDefinition(body, 3, 18, sessionFields);
  writeData(body, 3, sessionFields, [
    lastT,
    0,
    startFit,
    fitSport(sportHint),
    elapsedS * 1000,
    elapsedS * 1000,
    dist * 100,
    0,
    1,
  ]);

  // -- activity ---------------------------------------------------------------
  const activityFields: FieldDef[] = [
    { num: 253, type: T.uint32 },
    { num: 0, type: T.uint32 }, // total_timer_time
    { num: 1, type: T.uint16 }, // num_sessions
    { num: 2, type: T.enum }, // type = 0 (manual)
    { num: 3, type: T.enum }, // event = 26 (activity)
    { num: 4, type: T.enum }, // event_type = 1 (stop)
  ];
  writeDefinition(body, 4, 34, activityFields);
  writeData(body, 4, activityFields, [lastT, elapsedS * 1000, 1, 0, 26, 1]);

  // -- header + CRC -----------------------------------------------------------
  const data = body.bytes();
  const header = new Buf();
  header.u8(14); // header size
  header.u8(0x10); // protocol version 1.0
  header.u16(2132); // profile version
  header.u32(data.length);
  header.ascii(".FIT");
  const headerBytes = header.bytes();
  const headerCrc = crc16(headerBytes.subarray(0, 12));

  const out = new Uint8Array(14 + data.length + 2);
  out.set(headerBytes.subarray(0, 12), 0);
  out[12] = headerCrc & 0xff;
  out[13] = headerCrc >> 8;
  out.set(data, 14);
  const fileCrc = crc16(data, crc16(out.subarray(0, 14)));
  out[14 + data.length] = fileCrc & 0xff;
  out[14 + data.length + 1] = fileCrc >> 8;
  return out;
}
