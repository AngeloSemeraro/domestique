"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ZoomOut } from "lucide-react";
import type { Streams } from "@/lib/gpx";
import type { Waypoint } from "@/lib/file-parsers";

type Run = { start: number; end: number };

/**
 * Gradient color bands as used by the Wahoo ELEMNT (Summit climbing):
 * green 0–3.9%, yellow 4–7.9%, orange 8–11.9%, red 12–19.9%, brown 20%+.
 * Descents get grey (gentle) / blue (steep), which Wahoo leaves uncolored.
 */
const CLIMB_BANDS: Array<{ min: number; color: string; label: string }> = [
  { min: 20, color: "#78350f", label: "20%+" },
  { min: 12, color: "#ef4444", label: "12–20%" },
  { min: 8, color: "#f97316", label: "8–12%" },
  { min: 4, color: "#facc15", label: "4–8%" },
  { min: 0, color: "#22c55e", label: "0–4%" },
];
const GENTLE_DOWN = "#94a3b8";
const STEEP_DOWN = "#3b82f6";

export function gradeColor(pct: number): string {
  if (pct <= -4) return STEEP_DOWN;
  if (pct < 0) return GENTLE_DOWN;
  for (const b of CLIMB_BANDS) if (pct >= b.min) return b.color;
  return CLIMB_BANDS[CLIMB_BANDS.length - 1].color;
}

const H = 210; // main chart height (px)
const PAD_TOP = 16;
const PAD_BOTTOM = 18;
const OV_H = 40; // overview strip height (px)
const MIN_SPAN = 8; // minimum zoom window, in points
const GRADE_WIN_KM = 0.03; // ±30 m smoothing window for the gradient

/**
 * Detailed elevation profile, audio-editor style: drag a range to zoom into
 * it, scroll to zoom around the cursor, double-click to reset, drag the
 * overview strip to pan. Columns are colored by gradient (Wahoo ELEMNT
 * bands); hover shows a crosshair + tooltip and is mirrored on the map via
 * `onHover` / `hoverIdx`.
 */
export default function ElevationProfile({
  streams,
  totalPoints,
  runs,
  seamIndices,
  waypoints,
  showWaypoints,
  hoverIdx,
  onHover,
  viewRange,
  onViewRangeChange,
  maxJumpKm = 1,
  hasTime = true,
}: {
  streams: Streams;
  totalPoints: number;
  runs: Run[];
  seamIndices?: number[];
  waypoints?: Waypoint[];
  showWaypoints?: boolean;
  hoverIdx: number | null;
  onHover: (idx: number | null) => void;
  /** Inclusive index window currently shown. */
  viewRange: [number, number];
  onViewRangeChange: (r: [number, number]) => void;
  maxJumpKm?: number;
  hasTime?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ovRef = useRef<SVGSVGElement | null>(null);
  const [w, setW] = useState(800);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const dragRef = useRef<{ x0: number; moved: boolean } | null>(null);
  const ovDragRef = useRef<{ grabOffset: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Filled altitude, cumulative distance and smoothed gradient, once per file.
  const base = useMemo(() => {
    const ll = streams.latlng?.data ?? [];
    const altRaw = streams.altitude?.data ?? [];
    const n = Math.max(1, totalPoints);
    const alt = new Float64Array(n);
    let last = NaN;
    for (let i = 0; i < n; i++) {
      const v = altRaw[i];
      if (typeof v === "number" && Number.isFinite(v)) last = v;
      alt[i] = last;
    }
    if (Number.isNaN(alt[0])) {
      let first = 0;
      for (let i = 0; i < n; i++) {
        if (!Number.isNaN(alt[i])) {
          first = alt[i];
          break;
        }
      }
      for (let i = 0; i < n && Number.isNaN(alt[i]); i++) alt[i] = first;
    }
    const dist = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      let d = ll[i] && ll[i - 1] ? haversineKm(ll[i - 1], ll[i]) : 0;
      if (d > maxJumpKm) d = 0; // teleport / seam: don't stretch the x axis
      dist[i] = dist[i - 1] + d;
    }
    const grade = new Float64Array(n);
    let j0 = 0;
    let j1 = 0;
    for (let i = 0; i < n; i++) {
      while (dist[i] - dist[j0] > GRADE_WIN_KM) j0++;
      if (j1 < i) j1 = i;
      while (j1 + 1 < n && dist[j1 + 1] - dist[i] <= GRADE_WIN_KM) j1++;
      const dd = (dist[j1] - dist[j0]) * 1000;
      grade[i] = dd > 2 ? ((alt[j1] - alt[j0]) / dd) * 100 : 0;
    }
    return { alt, dist, grade, n };
  }, [streams, totalPoints, maxJumpKm]);

  const n = base.n;
  const a = Math.max(0, Math.min(viewRange[0], n - 1));
  const b = Math.max(a, Math.min(viewRange[1], n - 1));
  const zoomed = a > 0 || b < n - 1;
  const distSpan = base.dist[b] - base.dist[a];

  const xOf = (i: number) =>
    distSpan > 0
      ? ((base.dist[i] - base.dist[a]) / distSpan) * w
      : ((i - a) / Math.max(1, b - a)) * w;

  const idxAt = (x: number): number => {
    if (distSpan <= 0)
      return clamp(Math.round(a + (x / Math.max(1, w)) * (b - a)), a, b);
    const target = base.dist[a] + (x / Math.max(1, w)) * distSpan;
    let lo = a;
    let hi = b;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (base.dist[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo > a && target - base.dist[lo - 1] < base.dist[lo] - target) lo--;
    return lo;
  };

  // Stats and Y domain for the visible window.
  const win = useMemo(() => {
    let yMin = Infinity;
    let yMax = -Infinity;
    let gain = 0;
    let loss = 0;
    for (let i = a; i <= b; i++) {
      const v = base.alt[i];
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
      if (i > a) {
        const d = v - base.alt[i - 1];
        if (d > 0) gain += d;
        else loss -= d;
      }
    }
    if (!Number.isFinite(yMin)) {
      yMin = 0;
      yMax = 1;
    }
    return { yMin, yMax, gain, loss };
  }, [base, a, b]);

  const yRange = win.yMax - win.yMin || 1;
  const yScale = (v: number) =>
    H - PAD_BOTTOM - ((v - win.yMin) / yRange) * (H - PAD_TOP - PAD_BOTTOM);

  // Downsampled columns for the visible window.
  const samples = useMemo(() => {
    const count = b - a + 1;
    const columns = Math.max(1, Math.min(720, count));
    const step = count / columns;
    const out: Array<{ idx: number }> = [];
    let prev = -1;
    for (let k = 0; k < columns; k++) {
      const idx = Math.min(b, a + Math.floor(k * step + step / 2));
      if (idx !== prev) out.push({ idx });
      prev = idx;
    }
    return out;
  }, [a, b]);

  const yTicks = niceTicks(win.yMin, win.yMax, 5, [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]);
  const xTicks = niceTicks(base.dist[a], base.dist[b], 7, [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200]);

  // Waypoints snapped to the nearest track point.
  const wptIdx = useMemo(() => {
    if (!waypoints || waypoints.length === 0) return [];
    const ll = streams.latlng?.data ?? [];
    if (ll.length === 0) return [];
    const stride = Math.max(1, Math.floor(ll.length / 20000));
    return waypoints.map((wp) => {
      const cosLat = Math.cos((wp.lat * Math.PI) / 180);
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < ll.length; i += stride) {
        const dLat = ll[i][0] - wp.lat;
        const dLng = (ll[i][1] - wp.lon) * cosLat;
        const d = dLat * dLat + dLng * dLng;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return { wp, idx: best };
    });
  }, [waypoints, streams]);

  // Zoom helpers -----------------------------------------------------------

  const applyRange = (i0: number, i1: number) => {
    const lo = clamp(Math.min(i0, i1), 0, n - 1);
    const hi = clamp(Math.max(i0, i1), 0, n - 1);
    if (hi - lo < MIN_SPAN) return;
    onViewRangeChange([lo, hi]);
  };

  const zoomRef = useRef<(frac: number, factor: number) => void>(() => {});
  zoomRef.current = (frac, factor) => {
    const span = b - a + 1;
    const newSpan = Math.round(clamp(span * factor, MIN_SPAN, n));
    if (newSpan === span) return;
    const center = idxAt(frac * w);
    let na = Math.round(center - frac * newSpan);
    na = clamp(na, 0, Math.max(0, n - newSpan));
    onViewRangeChange([na, Math.min(n - 1, na + newSpan - 1)]);
  };

  // Wheel zoom needs a non-passive listener to preventDefault page scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const frac = rect.width > 0 ? x / rect.width : 0.5;
      zoomRef.current(frac, e.deltaY > 0 ? 1.3 : 1 / 1.3);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const svgX = (e: React.PointerEvent): number => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    return clamp(e.clientX - rect.left, 0, rect.width);
  };

  // Overview strip ---------------------------------------------------------

  const ovSamples = useMemo(() => {
    const columns = Math.max(1, Math.min(360, n));
    const step = n / columns;
    const out: number[] = [];
    for (let k = 0; k < columns; k++)
      out.push(Math.min(n - 1, Math.floor(k * step + step / 2)));
    return out;
  }, [n]);

  const fullSpan = base.dist[n - 1] || 1;
  const xFull = (i: number) =>
    base.dist[n - 1] > 0 ? (base.dist[i] / fullSpan) * w : (i / Math.max(1, n - 1)) * w;
  const idxAtFull = (x: number): number => {
    if (base.dist[n - 1] <= 0)
      return clamp(Math.round((x / Math.max(1, w)) * (n - 1)), 0, n - 1);
    const target = (x / Math.max(1, w)) * fullSpan;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (base.dist[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const panTo = (x: number, grabOffset: number) => {
    const span = b - a + 1;
    const center = idxAtFull(clamp(x - grabOffset, 0, w));
    const na = clamp(Math.round(center - span / 2), 0, Math.max(0, n - span));
    onViewRangeChange([na, Math.min(n - 1, na + span - 1)]);
  };

  let ovYMin = Infinity;
  let ovYMax = -Infinity;
  for (const i of ovSamples) {
    if (base.alt[i] < ovYMin) ovYMin = base.alt[i];
    if (base.alt[i] > ovYMax) ovYMax = base.alt[i];
  }
  const ovRange = ovYMax - ovYMin || 1;
  const ovY = (v: number) => OV_H - 4 - ((v - ovYMin) / ovRange) * (OV_H - 8);
  const ovPath =
    ovSamples
      .map(
        (i, k) =>
          `${k === 0 ? "M" : "L"} ${xFull(i).toFixed(1)} ${ovY(base.alt[i]).toFixed(1)}`
      )
      .join(" ") + ` L ${w} ${OV_H} L 0 ${OV_H} Z`;

  // Rendering --------------------------------------------------------------

  const activeIdx =
    hoverIdx !== null && hoverIdx >= a && hoverIdx <= b ? hoverIdx : null;
  const time = streams.time?.data ?? [];
  const barW = Math.max(1.5, w / samples.length + 0.5);

  const linePath = samples
    .map(
      (s, i) =>
        `${i === 0 ? "M" : "L"} ${xOf(s.idx).toFixed(1)} ${yScale(base.alt[s.idx]).toFixed(1)}`
    )
    .join(" ");

  return (
    <div ref={wrapRef}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span
          className="inline-flex items-center gap-1.5 font-medium"
          style={{ color: "#0ea5e9" }}
        >
          <MountainIcon />
          Elevation
          {zoomed && (
            <button
              onClick={() => onViewRangeChange([0, n - 1])}
              className="ml-1 inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--fg-muted)] transition-colors hover:border-sky-500 hover:text-sky-500"
            >
              <ZoomOut className="h-3 w-3" />
              Reset zoom
            </button>
          )}
        </span>
        <span className="font-mono text-[color:var(--fg-muted)]">
          {Math.round(win.yMin)} – {Math.round(win.yMax)} m · ↑
          {Math.round(win.gain)} ↓{Math.round(win.loss)} m ·{" "}
          {(base.dist[b] - base.dist[a]).toFixed(1)} km
          {zoomed ? " (window)" : ""}
        </span>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height={H}
          viewBox={`0 0 ${w} ${H}`}
          className="block cursor-crosshair touch-none select-none rounded bg-[color:var(--bg-input)]"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            dragRef.current = { x0: svgX(e), moved: false };
          }}
          onPointerMove={(e) => {
            const x = svgX(e);
            const d = dragRef.current;
            if (d) {
              if (Math.abs(x - d.x0) > 4) d.moved = true;
              if (d.moved) setSel([Math.min(d.x0, x), Math.max(d.x0, x)]);
            }
            onHover(idxAt(x));
          }}
          onPointerUp={() => {
            const d = dragRef.current;
            dragRef.current = null;
            if (d?.moved && sel) applyRange(idxAt(sel[0]), idxAt(sel[1]));
            setSel(null);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setSel(null);
          }}
          onPointerLeave={() => {
            if (!dragRef.current) onHover(null);
          }}
          onDoubleClick={() => onViewRangeChange([0, n - 1])}
        >
          {/* gradient-colored columns under the profile */}
          {samples.map((s) => {
            const y = yScale(base.alt[s.idx]);
            return (
              <rect
                key={s.idx}
                x={xOf(s.idx) - barW / 2}
                y={y}
                width={barW}
                height={Math.max(0, H - PAD_BOTTOM - y)}
                fill={gradeColor(base.grade[s.idx])}
                opacity={isKept(s.idx, runs) ? 0.9 : 0.3}
              />
            );
          })}

          {/* horizontal gridlines + altitude labels */}
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line
                x1={0}
                x2={w}
                y1={yScale(v)}
                y2={yScale(v)}
                stroke="currentColor"
                strokeOpacity={0.18}
                className="text-[color:var(--fg-muted)]"
              />
              <text
                x={4}
                y={yScale(v) - 3}
                fontSize={10}
                fill="var(--fg-muted)"
                className="font-mono"
              >
                {v} m
              </text>
            </g>
          ))}

          {/* distance ticks */}
          {xTicks.map((km) => {
            const x =
              distSpan > 0 ? ((km - base.dist[a]) / distSpan) * w : 0;
            if (x < 12 || x > w - 12) return null;
            return (
              <g key={`x${km}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={H - PAD_BOTTOM}
                  y2={H - PAD_BOTTOM + 4}
                  stroke="currentColor"
                  strokeOpacity={0.4}
                  className="text-[color:var(--fg-muted)]"
                />
                <text
                  x={x}
                  y={H - 5}
                  fontSize={10}
                  textAnchor="middle"
                  fill="var(--fg-muted)"
                  className="font-mono"
                >
                  {km >= 10 ? Math.round(km) : km} km
                </text>
              </g>
            );
          })}

          {/* seam markers */}
          {(seamIndices ?? [])
            .filter((idx) => idx >= a && idx <= b)
            .map((idx, i) => (
              <line
                key={`seam-${i}`}
                x1={xOf(idx)}
                x2={xOf(idx)}
                y1={0}
                y2={H - PAD_BOTTOM}
                stroke="currentColor"
                strokeOpacity={0.55}
                strokeWidth={1}
                strokeDasharray="3 3"
                className="text-[color:var(--fg-muted)]"
              />
            ))}

          {/* waypoint pins */}
          {showWaypoints &&
            wptIdx
              .filter(({ idx }) => idx >= a && idx <= b)
              .map(({ wp, idx }, i) => (
                <g key={`wpt-${i}`}>
                  <line
                    x1={xOf(idx)}
                    x2={xOf(idx)}
                    y1={12}
                    y2={yScale(base.alt[idx])}
                    stroke="#8b5cf6"
                    strokeWidth={1}
                    strokeOpacity={0.6}
                  />
                  <circle
                    cx={xOf(idx)}
                    cy={9}
                    r={4}
                    fill="#8b5cf6"
                    stroke="#ffffff"
                    strokeWidth={1.2}
                  >
                    <title>{wp.name ?? "waypoint"}</title>
                  </circle>
                </g>
              ))}

          {/* profile outline */}
          <path
            d={linePath}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth={1.4}
            strokeOpacity={0.9}
          />

          {/* drag selection */}
          {sel && (
            <g>
              <rect
                x={sel[0]}
                y={0}
                width={Math.max(1, sel[1] - sel[0])}
                height={H - PAD_BOTTOM}
                fill="#0ea5e9"
                opacity={0.15}
              />
              <line x1={sel[0]} x2={sel[0]} y1={0} y2={H - PAD_BOTTOM} stroke="#0ea5e9" />
              <line x1={sel[1]} x2={sel[1]} y1={0} y2={H - PAD_BOTTOM} stroke="#0ea5e9" />
            </g>
          )}

          {/* hover crosshair */}
          {activeIdx !== null && (
            <g>
              <line
                x1={xOf(activeIdx)}
                x2={xOf(activeIdx)}
                y1={0}
                y2={H - PAD_BOTTOM}
                stroke="#0ea5e9"
                strokeWidth={1}
              />
              <circle
                cx={xOf(activeIdx)}
                cy={yScale(base.alt[activeIdx])}
                r={3.5}
                fill="#0ea5e9"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            </g>
          )}
        </svg>

        {/* hover tooltip */}
        {activeIdx !== null && (() => {
          const leftPct = (xOf(activeIdx) / Math.max(1, w)) * 100;
          const flip = leftPct > 70;
          const g = base.grade[activeIdx];
          return (
            <div
              className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded border border-[color:var(--border)] bg-[color:var(--bg-elev)] px-1.5 py-1 text-[10px] font-mono shadow-md"
              style={{
                left: `${leftPct}%`,
                transform: flip
                  ? "translateX(-100%) translateX(-6px)"
                  : "translateX(6px)",
              }}
            >
              <div>{base.dist[activeIdx].toFixed(2)} km</div>
              <div>{Math.round(base.alt[activeIdx])} m</div>
              <div className="flex items-center gap-1 font-semibold text-[color:var(--fg)]">
                <span
                  className="inline-block h-2 w-2 flex-none rounded-[2px]"
                  style={{ background: gradeColor(g) }}
                />
                {g >= 0 ? "+" : ""}
                {g.toFixed(1)}%
              </div>
              {hasTime && time.length > activeIdx && (
                <div className="text-[color:var(--fg-muted)]">
                  {formatClock((time[activeIdx] ?? 0) - (time[0] ?? 0))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* overview strip: full profile + draggable window */}
      <svg
        ref={ovRef}
        width="100%"
        height={OV_H}
        viewBox={`0 0 ${w} ${OV_H}`}
        className="mt-1 block cursor-grab touch-none select-none rounded bg-[color:var(--bg-input)]"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          const x = svgX(e);
          const winCenter = (xFull(a) + xFull(b)) / 2;
          const inside = x >= xFull(a) && x <= xFull(b);
          ovDragRef.current = { grabOffset: inside ? x - winCenter : 0 };
          if (!inside) panTo(x, 0);
        }}
        onPointerMove={(e) => {
          if (ovDragRef.current) panTo(svgX(e), ovDragRef.current.grabOffset);
        }}
        onPointerUp={() => (ovDragRef.current = null)}
        onPointerCancel={() => (ovDragRef.current = null)}
        onDoubleClick={() => onViewRangeChange([0, n - 1])}
      >
        <path d={ovPath} fill="#0ea5e9" opacity={0.25} stroke="#0ea5e9" strokeOpacity={0.6} strokeWidth={1} />
        {/* dim outside the window */}
        <rect x={0} y={0} width={Math.max(0, xFull(a))} height={OV_H} fill="var(--bg)" opacity={0.6} />
        <rect
          x={xFull(b)}
          y={0}
          width={Math.max(0, w - xFull(b))}
          height={OV_H}
          fill="var(--bg)"
          opacity={0.6}
        />
        <rect
          x={xFull(a)}
          y={0.5}
          width={Math.max(2, xFull(b) - xFull(a))}
          height={OV_H - 1}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth={1.5}
          rx={2}
        />
      </svg>

      {/* legend + hints */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-[color:var(--fg-muted)]">
        <LegendSwatch color={STEEP_DOWN} label="descent" />
        <LegendSwatch color={GENTLE_DOWN} label="downhill" />
        {[...CLIMB_BANDS].reverse().map((band) => (
          <LegendSwatch key={band.min} color={band.color} label={band.label} />
        ))}
        <span className="ml-auto opacity-70">
          drag to zoom · scroll to zoom · double-click to reset · drag the strip to pan
        </span>
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2 w-3 rounded"
        style={{ background: color }}
      ></span>
      {label}
    </span>
  );
}

function MountainIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </svg>
  );
}

function isKept(i: number, runs: Run[]): boolean {
  if (runs.length === 0) return true;
  for (const r of runs) if (i >= r.start && i <= r.end) return true;
  return false;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Ticks at "nice" values covering [min, max], aiming for ≤ target lines. */
function niceTicks(
  min: number,
  max: number,
  target: number,
  steps: number[]
): number[] {
  const span = max - min;
  if (!(span > 0)) return [];
  let step = steps[steps.length - 1];
  for (const s of steps) {
    if (span / s <= target) {
      step = s;
      break;
    }
  }
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function haversineKm(aPt: [number, number], bPt: [number, number]): number {
  const R = 6371;
  const dLat = ((bPt[0] - aPt[0]) * Math.PI) / 180;
  const dLng = ((bPt[1] - aPt[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aPt[0] * Math.PI) / 180) *
      Math.cos((bPt[0] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
