"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  AlertCircle,
  Check,
  Cloud,
  Download,
  ExternalLink,
  FileUp,
  Heart,
  Info,
  Loader2,
  RotateCcw,
  Trash2,
  Activity as ActivityIcon,
  Wand2,
} from "lucide-react";
import {
  buildMergedGpx,
  buildMergedTcx,
  randomDuplicateShiftSec,
  DEFAULT_MOVEMENT_FILTER,
  filteredStats,
  movingRuns,
  streamDistanceKm,
  type MovementFilter,
  type Streams,
  type StreamedActivity,
} from "@/lib/gpx";
import { parseTrackFile, type ParsedTrack } from "@/lib/file-parsers";

type Step =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "processing"; uploadId: number }
  | { kind: "done_upload"; activityId: number }
  | { kind: "done_download"; filename: string }
  | { kind: "error"; message: string };

type Loaded = ParsedTrack & {
  filename: string;
  rawSources?: StreamedActivity[];
  seamIndices?: number[];
};

export default function AnalyzerTab({
  seed,
  onConsumeSeed,
}: {
  seed?:
    | (ParsedTrack & {
        rawSources?: StreamedActivity[];
        seamIndices?: number[];
      })
    | null;
  onConsumeSeed?: () => void;
}) {
  const [file, setFile] = useState<Loaded | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [movement, setMovement] = useState<MovementFilter>(DEFAULT_MOVEMENT_FILTER);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bypassDuplicate, setBypassDuplicate] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (seed) {
      setFile({
        ...seed,
        filename: `${seed.name}.gpx (from Merge)`,
        rawSources: seed.rawSources,
        seamIndices: seed.seamIndices,
      });
      setName(seed.name);
      setParseError(null);
      setStep({ kind: "idle" });
      onConsumeSeed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  async function handleFile(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setParseError(null);
    setStep({ kind: "idle" });
    try {
      const f = picked[0];
      const parsed = await parseTrackFile(f);
      setFile({ ...parsed, filename: f.name });
      setName(parsed.name);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "parse error");
      setFile(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const analysis = useMemo(() => {
    if (!file) return null;
    const s = file.streams;
    const totalKm = streamDistanceKm(
      s.latlng?.data ?? [],
      movement.maxJumpKm
    );
    const time = s.time?.data ?? [];
    const totalSec = time.length > 1 ? time[time.length - 1] - time[0] : 0;
    const runs = movement.enabled ? movingRuns(s, movement) : [];
    const stats = filteredStats(s, movement);
    return {
      totalKm,
      totalSec,
      keptKm: movement.enabled ? stats.km : totalKm,
      keptSec: movement.enabled ? stats.sec : totalSec,
      runs,
      hasHR: (s.heartrate?.data?.length ?? 0) > 0,
      hasCad: (s.cadence?.data?.length ?? 0) > 0,
      hasAlt: (s.altitude?.data?.length ?? 0) > 0,
      hasGps: (s.latlng?.data?.length ?? 0) > 0,
      avgHr: avgOf(s.heartrate?.data),
      avgCad: avgOf(s.cadence?.data),
    };
  }, [file, movement]);

  async function publish(target: "strava" | "tcx" | "gpx") {
    if (!file) return;
    if (!name.trim()) {
      alert("Give the activity a name.");
      return;
    }
    try {
      // Keep the per-source streams when the file came from the Merge tab,
      // so the distance odometer (TCX) and <trk> partitioning (GPX) skip
      // cross-source teleports instead of summing them.
      const sourcesForBuild =
        file.rawSources && file.rawSources.length > 0
          ? file.rawSources
          : [
              {
                name,
                start_date: file.start_date,
                streams: file.streams,
                sport_hint: "Ride",
              },
            ];

      const shiftSec = bypassDuplicate ? randomDuplicateShiftSec() : 0;

      if (target === "gpx") {
        const gpx = buildMergedGpx(sourcesForBuild, name, { mode: "natural" }, movement, shiftSec);
        const filename = `${slug(name)}.gpx`;
        triggerDownload(gpx, filename, "application/gpx+xml");
        setStep({ kind: "done_download", filename });
        return;
      }

      const tcx = buildMergedTcx(sourcesForBuild, name, { mode: "natural" }, movement, shiftSec);
      if (target === "tcx") {
        const filename = `${slug(name)}.tcx`;
        triggerDownload(tcx, filename, "application/vnd.garmin.tcx+xml");
        setStep({ kind: "done_download", filename });
        return;
      }

      setStep({ kind: "uploading" });
      const up = await apiFetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: tcx,
          dataType: "tcx",
          name,
          description,
          external_id: `sbe-analyzer-${Date.now()}`,
        }),
      });
      const upData = await up.json();
      if (!up.ok) throw new Error(upData.error ?? `Upload failed (${up.status})`);
      setStep({ kind: "processing", uploadId: upData.id });
      const activityId = await pollUpload(upData.id);
      setStep({ kind: "done_upload", activityId });
    } catch (e) {
      setStep({
        kind: "error",
        message: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  function clearFile() {
    setFile(null);
    setName("");
    setDescription("");
    setStep({ kind: "idle" });
  }

  const busy = step.kind === "uploading" || step.kind === "processing";

  return (
    <div className="space-y-6">
      <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-strava/10 text-strava">
            <Wand2 className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold tracking-tight">Inspector</h2>
            <p className="text-sm text-[color:var(--fg-muted)]">
              Inspect a track, tune the movement filter live, then download
              the cleaned GPX or publish it straight to Strava.
            </p>
          </div>
        </div>

        {!file && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              handleFile(e.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 transition-colors ${
              dragOver
                ? "border-strava bg-strava/5 text-strava"
                : "border-[color:var(--border)] hover:border-strava hover:text-strava"
            }`}
          >
            <FileUp className="h-6 w-6" />
            <span className="text-sm font-medium">
              {dragOver
                ? "Drop to load"
                : "Drop or click to pick a .gpx / .fit"}
            </span>
            <span className="text-xs text-[color:var(--fg-muted)]">
              Parsed entirely in your browser; nothing is uploaded yet.
            </span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx,.fit"
          className="hidden"
          onChange={(e) => handleFile(e.target.files)}
        />
        {parseError && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-500">
            <AlertCircle className="h-3.5 w-3.5" />
            {parseError}
          </p>
        )}
      </section>

      {file && analysis && (
        <>
          <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-[color:var(--fg-muted)]" />
                <span className="font-mono text-sm">{file.filename}</span>
                <span className="text-xs text-[color:var(--fg-muted)]">
                  ({file.point_count} pts)
                </span>
              </div>
              <button
                onClick={clearFile}
                className="inline-flex items-center gap-1 text-xs text-[color:var(--fg-muted)] hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <SignalBadge present={analysis.hasGps} label="GPS" />
              <SignalBadge
                present={analysis.hasHR}
                label={`HR${analysis.avgHr ? ` ${analysis.avgHr.toFixed(0)} bpm` : ""}`}
              />
              <SignalBadge
                present={analysis.hasCad}
                label={`Cadence${analysis.avgCad ? ` ${analysis.avgCad.toFixed(0)} rpm` : ""}`}
              />
              <SignalBadge present={analysis.hasAlt} label="Altitude" />
              <span className="ml-auto inline-flex items-center gap-3 text-[color:var(--fg-muted)]">
                <span>
                  {(analysis.totalKm).toFixed(1)} km · {formatDuration(analysis.totalSec)}
                </span>
                <span>
                  Start: {new Date(file.start_date).toLocaleString()}
                </span>
              </span>
            </div>

            {(!analysis.hasHR && !analysis.hasCad) && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300">
                <Info className="mr-1 inline h-3 w-3" />
                No HR or cadence data — only speed range can be used to detect
                train/car. Tighten Max km/h aggressively.
              </div>
            )}
          </section>

          <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-semibold tracking-tight">Movement filter</h3>
              <button
                onClick={() => setMovement(DEFAULT_MOVEMENT_FILTER)}
                className="inline-flex items-center gap-1 text-xs text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
              >
                <RotateCcw className="h-3 w-3" />
                Reset defaults
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={movement.enabled}
                onChange={(e) =>
                  setMovement({ ...movement, enabled: e.target.checked })
                }
                className="accent-strava"
              />
              Drop non-moving / non-cycling segments
            </label>

            {movement.enabled && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-3">
                <NumberField
                  label="Min km/h"
                  hint="below this = stop / pause"
                  value={movement.minKmh}
                  step={0.5}
                  onChange={(v) => setMovement({ ...movement, minKmh: v })}
                />
                <NumberField
                  label="Max km/h"
                  hint="above this = car / train"
                  value={movement.maxKmh}
                  step={1}
                  onChange={(v) => setMovement({ ...movement, maxKmh: v })}
                />
                <NumberField
                  label="Min run pts"
                  hint="ignore segments shorter than N points (anti-noise)"
                  value={movement.minRunPoints}
                  step={1}
                  onChange={(v) =>
                    setMovement({ ...movement, minRunPoints: Math.max(1, v) })
                  }
                />
                <NumberField
                  label="Max jump (km)"
                  hint="distance between 2 points above this = teleport, skipped"
                  value={movement.maxJumpKm}
                  step={0.5}
                  onChange={(v) =>
                    setMovement({ ...movement, maxJumpKm: Math.max(0.1, v) })
                  }
                />
                <label className="col-span-2 flex items-center gap-2 md:col-span-3">
                  <input
                    type="checkbox"
                    checked={movement.useCadence}
                    onChange={(e) =>
                      setMovement({ ...movement, useCadence: e.target.checked })
                    }
                    className="accent-strava"
                    disabled={!analysis.hasCad}
                  />
                  Drop segments with avg cadence below
                  <input
                    type="number"
                    min="0"
                    value={movement.minAvgCadenceRpm}
                    disabled={!movement.useCadence || !analysis.hasCad}
                    onChange={(e) =>
                      setMovement({
                        ...movement,
                        minAvgCadenceRpm: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-16 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-1.5 py-0.5 disabled:opacity-50"
                  />
                  rpm
                  <span className="text-[color:var(--fg-muted)] opacity-70">
                    (≈ 0 sustained = not pedaling: train, car, parked)
                  </span>
                  {!analysis.hasCad && <span className="text-amber-500">— no data</span>}
                </label>
                <label className="col-span-2 flex items-center gap-2 md:col-span-3">
                  <input
                    type="checkbox"
                    checked={movement.useHeartRate}
                    onChange={(e) =>
                      setMovement({ ...movement, useHeartRate: e.target.checked })
                    }
                    className="accent-strava"
                    disabled={!analysis.hasHR}
                  />
                  Drop segments with avg HR below
                  <input
                    type="number"
                    min="0"
                    value={movement.minAvgHeartRate}
                    disabled={!movement.useHeartRate || !analysis.hasHR}
                    onChange={(e) =>
                      setMovement({
                        ...movement,
                        minAvgHeartRate: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-16 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-1.5 py-0.5 disabled:opacity-50"
                  />
                  bpm
                  <span className="text-[color:var(--fg-muted)] opacity-70">
                    (below this = at rest: sitting, riding in vehicle)
                  </span>
                  {!analysis.hasHR && <span className="text-amber-500">— no data</span>}
                </label>
                {movement.useCadence && movement.useHeartRate && analysis.hasCad && analysis.hasHR && (
                  <p className="col-span-2 text-xs text-[color:var(--fg-muted)] md:col-span-3">
                    <Info className="mr-1 inline h-3 w-3" />
                    A segment is dropped only when{" "}
                    <strong>both</strong> cadence AND HR are below threshold.
                    Long freewheel descents (cadence 0, HR still elevated) are
                    kept; train/car (cadence 0 AND HR at rest) are dropped.
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] p-3 md:grid-cols-4">
              <Stat
                label="Kept distance"
                value={`${analysis.keptKm.toFixed(1)} km`}
                sub={`of ${analysis.totalKm.toFixed(1)} km total`}
                good
              />
              <Stat
                label="Kept time"
                value={formatDuration(analysis.keptSec)}
                sub={`of ${formatDuration(analysis.totalSec)} total`}
                good
              />
              <Stat
                label="Dropped distance"
                value={`${(analysis.totalKm - analysis.keptKm).toFixed(1)} km`}
                sub={`${analysis.runs.length} kept segment(s)`}
                bad={analysis.totalKm > analysis.keptKm}
              />
              <Stat
                label="Dropped time"
                value={formatDuration(
                  Math.max(0, analysis.totalSec - analysis.keptSec)
                )}
                sub="pauses, stops, slow bits"
                bad={analysis.totalSec > analysis.keptSec}
              />
            </div>
          </section>

          <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
            <h3 className="mb-3 font-semibold tracking-tight">Charts</h3>
            <div className="space-y-4">
              <StreamChart
                title="Speed"
                unit="km/h"
                color="#fc4c02"
                icon={<ActivityIcon className="h-3.5 w-3.5" />}
                series={computeSpeedSeries(file.streams, movement.maxJumpKm)}
                runs={analysis.runs}
                totalPoints={file.point_count}
                seamIndices={file.seamIndices}
              />
              {analysis.hasHR && (
                <StreamChart
                  title="Heart rate"
                  unit="bpm"
                  color="#ef4444"
                  icon={<Heart className="h-3.5 w-3.5" />}
                  series={(file.streams.heartrate?.data ?? []).map((v) =>
                    typeof v === "number" ? v : null
                  )}
                  runs={analysis.runs}
                  totalPoints={file.point_count}
                  seamIndices={file.seamIndices}
                />
              )}
              {analysis.hasCad && (
                <StreamChart
                  title="Cadence"
                  unit="rpm"
                  color="#10b981"
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  series={(file.streams.cadence?.data ?? []).map((v) =>
                    typeof v === "number" ? v : null
                  )}
                  runs={analysis.runs}
                  totalPoints={file.point_count}
                  seamIndices={file.seamIndices}
                />
              )}
              {analysis.hasAlt && (
                <ElevationChart
                  streams={file.streams}
                  totalPoints={file.point_count}
                  seamIndices={file.seamIndices}
                />
              )}
            </div>
            <p className="mt-2 text-xs text-[color:var(--fg-muted)]">
              <span className="inline-block h-2 w-3 rounded bg-strava align-middle"></span>{" "}
              kept ·{" "}
              <span className="inline-block h-2 w-3 rounded bg-[color:var(--fg-muted)]/30 align-middle"></span>{" "}
              dropped · elevation profile colored by gradient
            </p>
          </section>

          <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
            <h3 className="mb-3 font-semibold tracking-tight">Publish</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
                  Name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
                  Description (Strava only)
                </span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 text-sm"
                />
              </label>
            </div>

            <label className="mt-3 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={bypassDuplicate}
                onChange={(e) => setBypassDuplicate(e.target.checked)}
                className="mt-0.5 accent-strava"
              />
              <span>
                <span className="font-medium">Bypass duplicate detection</span>{" "}
                — shift the start time back by a random 2–15 min so Strava
                accepts the upload even if the original ride is still on your
                account. May take a couple of tries.
              </span>
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => publish("strava")}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all hover:scale-[1.02] disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
                Publish to Strava
              </button>
              <button
                onClick={() => publish("tcx")}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-4 py-1.5 text-sm font-medium transition-colors hover:border-strava hover:text-strava disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Download TCX
              </button>
              <button
                onClick={() => publish("gpx")}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-4 py-1.5 text-sm font-medium transition-colors hover:border-strava hover:text-strava disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Download GPX
              </button>
              <StepStatus step={step} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SignalBadge({ present, label }: { present: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
        present
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-[color:var(--border)] text-[color:var(--fg-muted)]"
      }`}
    >
      {present ? (
        <Check className="h-3 w-3" />
      ) : (
        <span className="text-[10px]">×</span>
      )}
      {label}
    </span>
  );
}

function NumberField({
  label,
  hint,
  value,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[color:var(--fg-muted)]">
        {label}
        {hint && (
          <span className="ml-1 normal-case opacity-70">({hint})</span>
        )}
      </span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2 py-1"
      />
    </label>
  );
}

function Stat({
  label,
  value,
  sub,
  good,
  bad,
}: {
  label: string;
  value: string;
  sub: string;
  good?: boolean;
  bad?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[color:var(--fg-muted)]">
        {label}
      </p>
      <p
        className={`text-lg font-semibold ${
          good ? "text-emerald-500" : bad ? "text-red-500" : ""
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-[color:var(--fg-muted)]">{sub}</p>
    </div>
  );
}

/**
 * Filled elevation profile colored by gradient (climb / flat / descent).
 * Each x-step gets its own colored vertical rect under the line so the
 * eye reads the steepness directly off the chart.
 */
function ElevationChart({
  streams,
  totalPoints,
  seamIndices,
}: {
  streams: Streams;
  totalPoints: number;
  seamIndices?: number[];
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const ll = streams.latlng?.data ?? [];
  const alt = streams.altitude?.data ?? [];
  if (alt.length === 0 || ll.length === 0) return null;

  // Min/max from the full series for honest axis labels.
  let aMin = Infinity;
  let aMax = -Infinity;
  for (const v of alt) {
    if (typeof v === "number" && Number.isFinite(v)) {
      if (v < aMin) aMin = v;
      if (v > aMax) aMax = v;
    }
  }
  if (!Number.isFinite(aMin) || !Number.isFinite(aMax)) return null;
  const range = aMax - aMin || 1;

  // Cumulative elevation gain / loss (full data).
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < alt.length; i++) {
    const a = alt[i];
    const b = alt[i - 1];
    if (typeof a === "number" && typeof b === "number") {
      const d = a - b;
      if (d > 0) gain += d;
      else loss -= d;
    }
  }

  // Downsample for rendering.
  const W = 1000;
  const H = 100;
  const target = 400;
  const step = Math.max(1, Math.ceil(alt.length / target));

  type Sample = { x: number; y: number; gradPct: number };
  const samples: Sample[] = [];
  for (let i = 0; i < alt.length; i += step) {
    const v = alt[i];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const prevIdx = Math.max(0, i - step);
    const prev = alt[prevIdx];
    const dEle =
      typeof prev === "number" && Number.isFinite(prev) ? v - prev : 0;
    const dDist =
      i > 0 && ll[i] && ll[prevIdx]
        ? haversineKm(ll[prevIdx], ll[i]) * 1000
        : 0;
    const gradPct = dDist > 0 ? (dEle / dDist) * 100 : 0;
    samples.push({ x: i, y: v, gradPct });
  }
  if (samples.length === 0) return null;

  const xScale = (x: number) => (x / Math.max(1, totalPoints - 1)) * W;
  const yScale = (y: number) => H - ((y - aMin) / range) * (H - 8) - 4;
  const barWidth = W / Math.max(1, samples.length);

  function gradColor(pct: number): string {
    // Clamp to ±12%; map to a green→neutral→red ramp.
    const x = Math.max(-12, Math.min(12, pct));
    if (x >= 0) {
      const t = Math.min(1, x / 8); // 0 flat → 1 at ~8%
      // light green-grey (#cbd5e1) → red-orange (#ef4444)
      return mix("#cbd5e1", "#ef4444", t);
    }
    const t = Math.min(1, -x / 8);
    return mix("#cbd5e1", "#10b981", t);
  }

  // Build line path.
  const linePath = samples
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xScale(s.x).toFixed(1)} ${yScale(s.y).toFixed(1)}`)
    .join(" ");

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span
          className="inline-flex items-center gap-1.5 font-medium"
          style={{ color: "#0ea5e9" }}
        >
          <MountainIcon />
          Elevation
        </span>
        <span className="font-mono text-[color:var(--fg-muted)]">
          {Math.round(aMin)} – {Math.round(aMax)} m · ↑{Math.round(gain)} ↓
          {Math.round(loss)} m
        </span>
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-20 w-full rounded bg-[color:var(--bg-input)] touch-none"
          onPointerMove={(e) => {
            const svg = svgRef.current;
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            const xPx = e.clientX - rect.left;
            const frac = Math.max(0, Math.min(1, xPx / rect.width));
            let best = 0;
            let bestDist = Infinity;
            for (let i = 0; i < samples.length; i++) {
              const d = Math.abs(samples[i].x / Math.max(1, totalPoints - 1) - frac);
              if (d < bestDist) {
                bestDist = d;
                best = i;
              }
            }
            setHoverIdx(best);
          }}
          onPointerLeave={() => setHoverIdx(null)}
        >
          {/* gradient-colored bars under the profile */}
          {samples.map((s, i) => (
            <rect
              key={i}
              x={xScale(s.x)}
              y={yScale(s.y)}
              width={barWidth + 0.5}
              height={H - yScale(s.y)}
              fill={gradColor(s.gradPct)}
              opacity={0.85}
            />
          ))}
          {/* outline line on top */}
          <path
            d={linePath}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth={1.2}
            strokeOpacity={0.9}
          />
          {/* seam markers (dashed) */}
          {(seamIndices ?? []).map((idx, i) => (
            <line
              key={`seam-${i}`}
              x1={xScale(idx)}
              x2={xScale(idx)}
              y1={0}
              y2={H}
              stroke="currentColor"
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray="3 3"
              className="text-[color:var(--fg-muted)]"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* hover vertical line */}
          {hoverIdx !== null && samples[hoverIdx] && (
            <line
              x1={xScale(samples[hoverIdx].x)}
              x2={xScale(samples[hoverIdx].x)}
              y1={0}
              y2={H}
              stroke="#0ea5e9"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {hoverIdx !== null && samples[hoverIdx] && (() => {
          const s = samples[hoverIdx];
          const leftPct = (s.x / Math.max(1, totalPoints - 1)) * 100;
          const flip = leftPct > 70;
          return (
            <div
              className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded border border-[color:var(--border)] bg-[color:var(--bg-elev)] px-1.5 py-1 text-[10px] font-mono shadow-md"
              style={{
                left: `${leftPct}%`,
                transform: flip ? "translateX(-100%) translateX(-4px)" : "translateX(4px)",
              }}
            >
              <div>{Math.round(s.y)} m</div>
              <div
                style={{
                  color:
                    s.gradPct > 1
                      ? "#ef4444"
                      : s.gradPct < -1
                      ? "#10b981"
                      : "var(--fg-muted)",
                }}
              >
                {s.gradPct >= 0 ? "+" : ""}
                {s.gradPct.toFixed(1)}%
              </div>
            </div>
          );
        })()}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-[color:var(--fg-muted)]">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-3 rounded"
            style={{ background: "#10b981" }}
          ></span>
          descent
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-3 rounded"
            style={{ background: "#cbd5e1" }}
          ></span>
          flat
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-3 rounded"
            style={{ background: "#ef4444" }}
          ></span>
          climb
        </span>
        <span className="ml-auto opacity-70">color intensity ∝ gradient %</span>
      </div>
    </div>
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

function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function StreamChart({
  title,
  unit,
  color,
  icon,
  series,
  runs,
  totalPoints,
  seamIndices,
}: {
  title: string;
  unit: string;
  color: string;
  icon: React.ReactNode;
  series: Array<number | null>;
  runs: Array<{ start: number; end: number }>;
  totalPoints: number;
  seamIndices?: number[];
}) {
  const W = 1000;
  const H = 80;
  const targetSamples = 400;
  const step = Math.max(1, Math.ceil(series.length / targetSamples));

  const samples: Array<{ x: number; v: number | null; kept: boolean }> = [];
  for (let i = 0; i < series.length; i += step) {
    const kept = isIndexKept(i, runs);
    samples.push({ x: i, v: series[i] ?? null, kept });
  }
  // Compute min/max from the full series (not the downsampled one) so the
  // header label reflects the real range, including spikes the chart
  // sampling might skip.
  let min = Infinity;
  let max = -Infinity;
  for (const v of series) {
    if (typeof v === "number" && Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const range = max - min || 1;
  const xScale = (x: number) => (x / Math.max(1, totalPoints - 1)) * W;
  const yScale = (v: number) => H - ((v - min) / range) * H;

  // Build path segments separated by kept/dropped boundaries
  type Seg = { kept: boolean; d: string };
  const segs: Seg[] = [];
  let currentKept = samples[0]?.kept ?? true;
  let path = "";
  let started = false;
  for (const s of samples) {
    if (s.v === null) continue;
    if (s.kept !== currentKept && started) {
      segs.push({ kept: currentKept, d: path });
      currentKept = s.kept;
      path = `M ${xScale(s.x).toFixed(1)} ${yScale(s.v).toFixed(1)}`;
    } else if (!started) {
      path = `M ${xScale(s.x).toFixed(1)} ${yScale(s.v).toFixed(1)}`;
      started = true;
    } else {
      path += ` L ${xScale(s.x).toFixed(1)} ${yScale(s.v).toFixed(1)}`;
    }
  }
  if (path) segs.push({ kept: currentKept, d: path });

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium" style={{ color }}>
          {icon}
          {title}
        </span>
        <span className="font-mono text-[color:var(--fg-muted)]">
          {min.toFixed(0)} – {max.toFixed(0)} {unit}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-16 w-full rounded bg-[color:var(--bg-input)]"
      >
        {segs.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke={s.kept ? color : "currentColor"}
            strokeWidth={s.kept ? 1.5 : 1}
            strokeOpacity={s.kept ? 1 : 0.25}
            className={s.kept ? "" : "text-[color:var(--fg-muted)]"}
          />
        ))}
        {(seamIndices ?? []).map((idx, i) => (
          <line
            key={`seam-${i}`}
            x1={xScale(idx)}
            x2={xScale(idx)}
            y1={0}
            y2={H}
            stroke="currentColor"
            strokeOpacity={0.55}
            strokeWidth={1}
            strokeDasharray="3 3"
            className="text-[color:var(--fg-muted)]"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}

function StepStatus({ step }: { step: Step }) {
  if (step.kind === "idle") return null;
  if (step.kind === "uploading")
    return <span className="text-sm text-[color:var(--fg-muted)]">Uploading…</span>;
  if (step.kind === "processing")
    return (
      <span className="text-sm text-[color:var(--fg-muted)]">
        Strava processing (#{step.uploadId})…
      </span>
    );
  if (step.kind === "done_upload")
    return (
      <a
        href={`https://www.strava.com/activities/${step.activityId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm font-medium !text-emerald-600 hover:underline dark:!text-emerald-400"
      >
        Open new activity
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    );
  if (step.kind === "done_download")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" />
        Downloaded {step.filename}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-red-500">
      <AlertCircle className="h-3.5 w-3.5" />
      {step.message}
    </span>
  );
}

function avgOf(arr: Array<number | undefined> | undefined): number | null {
  if (!arr || arr.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const v of arr) {
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

function isIndexKept(i: number, runs: Array<{ start: number; end: number }>): boolean {
  if (runs.length === 0) return true;
  for (const r of runs) {
    if (i >= r.start && i <= r.end) return true;
  }
  return false;
}

function computeSpeedSeries(
  streams: Streams,
  maxJumpKm = 1
): Array<number | null> {
  const ll = streams.latlng?.data ?? [];
  const t = streams.time?.data ?? [];
  const out: Array<number | null> = new Array(ll.length).fill(null);
  for (let i = 1; i < ll.length; i++) {
    const dKm = haversineKm(ll[i - 1], ll[i]);
    if (dKm > maxJumpKm) {
      out[i] = null; // treat teleport as gap, not a 360k km/h spike
      continue;
    }
    const dtH = ((t[i] ?? i) - (t[i - 1] ?? i - 1)) / 3600;
    out[i] = dtH > 0 ? dKm / dtH : 0;
  }
  if (out.length > 0) out[0] = out[1] ?? 0;
  return out;
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

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "activity"
  );
}

function triggerDownload(
  text: string,
  filename: string,
  mime = "application/gpx+xml"
) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function pollUpload(id: number): Promise<number> {
  const start = Date.now();
  const TIMEOUT_MS = 120_000;
  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await apiFetch(`/api/uploads/${id}`);
    const data = await res.json().catch(() => ({}));
    if (data.error) {
      const msg = String(data.error);
      if (/duplicate/i.test(msg)) {
        throw new Error(
          `Strava: ${msg}. Delete the source activity first, or use Download.`
        );
      }
      throw new Error(msg);
    }
    if (data.activity_id) return data.activity_id;
  }
  throw new Error("Upload still processing after 2 min — check Strava manually.");
}
