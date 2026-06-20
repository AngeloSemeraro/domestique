export type Streams = {
  latlng?: { data: Array<[number, number]> };
  time?: { data: number[] };
  altitude?: { data: number[] };
  heartrate?: { data: number[] };
  cadence?: { data: number[] };
};

export type StreamedActivity = {
  id: number;
  name: string;
  start_date: string;
  streams: Streams;
};

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

/**
 * Build a single GPX 1.1 document that stitches the given activities into
 * one track with one <trkseg> per activity, in chronological order.
 * Points without lat/lng are dropped (Strava requires GPS to ingest GPX).
 */
export function buildMergedGpx(
  activities: StreamedActivity[],
  trackName: string
): string {
  const sorted = [...activities].sort(
    (a, b) => +new Date(a.start_date) - +new Date(b.start_date)
  );

  const metadataTime =
    sorted[0]?.start_date ?? new Date().toISOString();

  let segs = "";
  for (const a of sorted) {
    const latlng = a.streams.latlng?.data ?? [];
    const time = a.streams.time?.data ?? [];
    const alt = a.streams.altitude?.data ?? [];
    const hr = a.streams.heartrate?.data ?? [];
    const cad = a.streams.cadence?.data ?? [];
    if (latlng.length === 0 || time.length === 0) continue;

    const baseTs = +new Date(a.start_date);
    const pts: string[] = [];
    for (let i = 0; i < latlng.length; i++) {
      const ll = latlng[i];
      if (!ll || ll.length !== 2) continue;
      const [lat, lng] = ll;
      const t = time[i] ?? i;
      const iso = new Date(baseTs + t * 1000).toISOString();
      const eleTag = alt[i] !== undefined ? `<ele>${alt[i]}</ele>` : "";
      const hrTag = hr[i] !== undefined ? `<gpxtpx:hr>${Math.round(hr[i])}</gpxtpx:hr>` : "";
      const cadTag = cad[i] !== undefined ? `<gpxtpx:cad>${Math.round(cad[i])}</gpxtpx:cad>` : "";
      const ext =
        hrTag || cadTag
          ? `<extensions><gpxtpx:TrackPointExtension>${hrTag}${cadTag}</gpxtpx:TrackPointExtension></extensions>`
          : "";
      pts.push(
        `<trkpt lat="${lat}" lon="${lng}">${eleTag}<time>${iso}</time>${ext}</trkpt>`
      );
    }
    segs += `<trkseg>${pts.join("")}</trkseg>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava Batch Editor" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<metadata><time>${metadataTime}</time></metadata>
<trk><name>${xmlEsc(trackName)}</name>${segs}</trk>
</gpx>`;
}
