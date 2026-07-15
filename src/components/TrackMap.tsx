"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Waypoint } from "@/lib/file-parsers";

type Run = { start: number; end: number };

export type TrackMapProps = {
  latlng: Array<[number, number]>;
  /** Kept segments from the movement filter; empty = everything kept. */
  runs: Run[];
  waypoints?: Waypoint[];
  showWaypoints?: boolean;
  hoverIdx: number | null;
  /** Zoomed index window from the elevation profile; null = full track. */
  viewRange: [number, number] | null;
  onHover?: (idx: number | null) => void;
  className?: string;
};

const TRACK_COLOR = "#ef95b0";
const DROPPED_COLOR = "#6b7280";
const WINDOW_COLOR = "#0ea5e9";
const WAYPOINT_COLOR = "#8b5cf6";

/**
 * Interactive Leaflet map of the loaded track. Kept segments are orange,
 * segments dropped by the movement filter are dashed grey. The hover
 * position and the elevation-profile zoom window are mirrored here; hovering
 * the track on the map mirrors back into the charts via `onHover`.
 */
export default function TrackMap({
  latlng,
  runs,
  waypoints,
  showWaypoints,
  hoverIdx,
  viewRange,
  onHover,
  className,
}: TrackMapProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const trackLayerRef = useRef<L.LayerGroup | null>(null);
  const windowLayerRef = useRef<L.Polyline | null>(null);
  const wptLayerRef = useRef<L.LayerGroup | null>(null);
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null);
  const lastFitRef = useRef<Array<[number, number]> | null>(null);
  const latlngRef = useRef(latlng);
  latlngRef.current = latlng;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  // Create the map once.
  useEffect(() => {
    const div = divRef.current;
    if (!div) return;
    const map = L.map(div, { zoomControl: true, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "sbe-basemap",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    map.setView([0, 0], 2);

    let raf = 0;
    map.on("mousemove", (e: L.LeafletMouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        onHoverRef.current?.(nearestIdx(map, latlngRef.current, e));
      });
    });
    map.on("mouseout", () => onHoverRef.current?.(null));

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(div);

    mapRef.current = map;
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Track polylines + start/end markers, split by kept/dropped runs.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    trackLayerRef.current?.remove();
    trackLayerRef.current = null;
    if (latlng.length === 0) return;

    const group = L.layerGroup();
    for (const seg of splitByRuns(latlng, runs)) {
      group.addLayer(
        L.polyline(seg.pts, seg.kept
          ? { color: TRACK_COLOR, weight: 3, opacity: 0.9 }
          : { color: DROPPED_COLOR, weight: 2, opacity: 0.6, dashArray: "4 6" })
      );
    }
    group.addLayer(dot(latlng[0], "#10b981", "Start"));
    group.addLayer(dot(latlng[latlng.length - 1], "#ef4444", "End"));
    group.addTo(map);
    trackLayerRef.current = group;

    if (lastFitRef.current !== latlng) {
      lastFitRef.current = latlng;
      map.fitBounds(L.latLngBounds(latlng as L.LatLngTuple[]), {
        padding: [24, 24],
      });
    }
  }, [latlng, runs]);

  // Zoom window from the elevation profile: highlight + fit bounds.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || latlng.length < 2) return;
    windowLayerRef.current?.remove();
    windowLayerRef.current = null;
    const full =
      !viewRange || (viewRange[0] <= 0 && viewRange[1] >= latlng.length - 1);
    if (full) {
      map.fitBounds(L.latLngBounds(latlng as L.LatLngTuple[]), {
        padding: [24, 24],
      });
      return;
    }
    const a = Math.max(0, viewRange[0]);
    const b = Math.min(latlng.length - 1, viewRange[1]);
    const pts = latlng.slice(a, b + 1) as L.LatLngTuple[];
    if (pts.length < 2) return;
    const line = L.polyline(pts, {
      color: WINDOW_COLOR,
      weight: 5,
      opacity: 0.85,
      interactive: false,
    }).addTo(map);
    windowLayerRef.current = line;
    map.fitBounds(line.getBounds(), { padding: [28, 28] });
  }, [viewRange, latlng]);

  // Waypoint markers (togglable).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    wptLayerRef.current?.remove();
    wptLayerRef.current = null;
    if (!showWaypoints || !waypoints || waypoints.length === 0) return;
    const group = L.layerGroup();
    for (const w of waypoints) {
      const m = L.circleMarker([w.lat, w.lon], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: WAYPOINT_COLOR,
        fillOpacity: 1,
      });
      const lines = [
        w.name ? `<strong>${escapeHtml(w.name)}</strong>` : null,
        w.desc ? escapeHtml(w.desc) : null,
        w.sym ? escapeHtml(w.sym) : null,
        w.ele !== undefined ? `${Math.round(w.ele)} m` : null,
      ].filter(Boolean);
      if (lines.length > 0) m.bindPopup(lines.join("<br>"));
      if (w.name)
        m.bindTooltip(escapeHtml(w.name), { direction: "top", offset: [0, -6] });
      group.addLayer(m);
    }
    group.addTo(map);
    wptLayerRef.current = group;
  }, [waypoints, showWaypoints]);

  // Hover marker mirrored from the elevation profile / charts.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hoverIdx === null || !latlng[hoverIdx]) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }
    const pos = latlng[hoverIdx] as L.LatLngTuple;
    if (!hoverMarkerRef.current) {
      hoverMarkerRef.current = L.circleMarker(pos, {
        radius: 7,
        color: "#ffffff",
        weight: 2.5,
        fillColor: TRACK_COLOR,
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    } else {
      hoverMarkerRef.current.setLatLng(pos);
    }
  }, [hoverIdx, latlng]);

  return (
    <div
      ref={divRef}
      className={`sbe-map relative w-full overflow-hidden rounded-xl border border-[color:var(--border)] ${
        className ?? "h-80"
      }`}
    />
  );
}

function dot(
  pos: [number, number],
  color: string,
  label: string
): L.CircleMarker {
  return L.circleMarker(pos, {
    radius: 6,
    color: "#ffffff",
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
  }).bindTooltip(label, { direction: "top", offset: [0, -6] });
}

function isKept(i: number, runs: Run[]): boolean {
  if (runs.length === 0) return true;
  for (const r of runs) if (i >= r.start && i <= r.end) return true;
  return false;
}

function splitByRuns(
  latlng: Array<[number, number]>,
  runs: Run[]
): Array<{ kept: boolean; pts: L.LatLngTuple[] }> {
  if (runs.length === 0) return [{ kept: true, pts: latlng as L.LatLngTuple[] }];
  const segs: Array<{ kept: boolean; pts: L.LatLngTuple[] }> = [];
  let curKept = isKept(0, runs);
  let cur: L.LatLngTuple[] = [latlng[0] as L.LatLngTuple];
  for (let i = 1; i < latlng.length; i++) {
    const k = isKept(i, runs);
    cur.push(latlng[i] as L.LatLngTuple);
    if (k !== curKept) {
      segs.push({ kept: curKept, pts: cur });
      cur = [latlng[i] as L.LatLngTuple];
      curKept = k;
    }
  }
  if (cur.length > 1) segs.push({ kept: curKept, pts: cur });
  return segs;
}

/** Nearest track point to the cursor, or null when farther than ~32 px. */
function nearestIdx(
  map: L.Map,
  pts: Array<[number, number]>,
  e: L.LeafletMouseEvent
): number | null {
  if (pts.length === 0) return null;
  const cosLat = Math.cos((e.latlng.lat * Math.PI) / 180);
  const stride = Math.max(1, Math.floor(pts.length / 8000));
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < pts.length; i += stride) {
    const dLat = pts[i][0] - e.latlng.lat;
    const dLng = (pts[i][1] - e.latlng.lng) * cosLat;
    const d = dLat * dLat + dLng * dLng;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  if (best < 0) return null;
  const p = map.latLngToContainerPoint(L.latLng(pts[best][0], pts[best][1]));
  const m = map.latLngToContainerPoint(e.latlng);
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  return dx * dx + dy * dy <= 32 * 32 ? best : null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
