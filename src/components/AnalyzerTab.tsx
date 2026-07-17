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
import type { ParsedTrack } from "@/lib/file-parsers";
import { fetchActivityStreams } from "@/lib/export-client";
import ElevationProfile from "./ElevationProfile";
import TrackMap from "./TrackMapLazy";
import {
  ActivitySourceBox,
  type LocalFile,
  type SourcePick,
} from "./SourcePicker";

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
  // Files added through the unified source box (kept so the user can switch
  // between them after Clear).
  const [pickerFiles, setPickerFiles] = useState<LocalFile[]>([]);
  const [sourceLoading, setSourceLoading] = useState<string | null>(null);
  // Shared hover / zoom state mirrored between the map, the elevation
  // profile and the stream charts. viewRange null = full track.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [viewRange, setViewRange] = useState<[number, number] | null>(null);
  const [showWaypoints, setShowWaypoints] = useState(true);

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
      setViewRange(null);
      setHoverIdx(null);
      onConsumeSeed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  function loadParsed(parsed: ParsedTrack, filename: string) {
    setParseError(null);
    setStep({ kind: "idle" });
    setFile({ ...parsed, filename });
    setName(parsed.name);
    setViewRange(null);
    setHoverIdx(null);
  }

  async function handlePick(pick: SourcePick) {
    setParseError(null);
    if (pick.kind === "file") {
      loadParsed(pick.file, pick.file.filename);
      return;
    }
    const a = pick.activity;
    setSourceLoading(a.name);
    try {
      const streams = await fetchActivityStreams(a.id);
      loadParsed(
        {
          name: a.name,
          start_date: a.start_date,
          streams,
          point_count: streams.latlng?.data?.length ?? 0,
          has_time: true,
        },
        `${a.name} (Strava activity ${a.id})`
      );
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "failed to load streams");
    } finally {
      setSourceLoading(null);
    }
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

  // Memoized: recomputing haversines on every hover-driven render is wasteful.
  const speedSeries = useMemo(
    () =>
      file ? computeSpeedSeries(file.streams, movement.maxJumpKm) : [],
    [file, movement.maxJumpKm]
  );

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
    setViewRange(null);
    setHoverIdx(null);
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
              Pick one of your Strava rides or a local .gpx / .fit file,
              explore it on the map and elevation profile, tune the movement
              filter live, then download the cleaned file or publish it
              straight to Strava.
            </p>
          </div>
        </div>

        {!file && (
          <>
            <ActivitySourceBox
              mode="single"
              files={pickerFiles}
              onFilesAdded={(added) => {
                setPickerFiles((prev) => {
                  const map = new Map(prev.map((f) => [f.uid, f]));
                  for (const f of added) map.set(f.uid, f);
                  return Array.from(map.values());
                });
                // Dropping a single file means "inspect this one" — load it.
                if (added.length === 1) handlePick({ kind: "file", file: added[0] });
              }}
              onFileRemoved={(uid) =>
                setPickerFiles((prev) => prev.filter((f) => f.uid !== uid))
              }
              onPick={handlePick}
              emptyHint="No activities in this range."
            />
            {sourceLoading && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[color:var(--fg-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading “{sourceLoading}” from Strava…
              </p>
            )}
          </>
        )}
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
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-100 p-2 text-xs text-amber-900">
                <Info className="mr-1 inline h-3 w-3" />
                No HR or cadence data — only speed range can be used to detect
                train/car. Tighten Max km/h aggressively.
              </div>
            )}

            {file.has_time === false && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-100 p-2 text-xs text-amber-900">
                <Info className="mr-1 inline h-3 w-3" />
                This file has no timestamps — synthetic times (1 s per point)
                were generated so charts, downloads and Strava upload still
                work. Speed and duration are not meaningful.
              </div>
            )}
          </section>

          {(analysis.hasGps || analysis.hasAlt) && (
            <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold tracking-tight">
                  Map &amp; elevation
                </h3>
                {(file.waypoints?.length ?? 0) > 0 && (
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={showWaypoints}
                      onChange={(e) => setShowWaypoints(e.target.checked)}
                      className="accent-strava"
                    />
                    Waypoints ({file.waypoints!.length})
                  </label>
                )}
              </div>
              {analysis.hasGps && (
                <TrackMap
                  latlng={file.streams.latlng?.data ?? []}
                  runs={analysis.runs}
                  waypoints={file.waypoints}
                  showWaypoints={showWaypoints}
                  hoverIdx={hoverIdx}
                  viewRange={viewRange}
                  onHover={setHoverIdx}
                  className="h-72 md:h-96"
                />
              )}
              {analysis.hasAlt ? (
                <div className={analysis.hasGps ? "mt-4" : ""}>
                  <ElevationProfile
                    streams={file.streams}
                    totalPoints={file.point_count}
                    runs={analysis.runs}
                    seamIndices={file.seamIndices}
                    waypoints={file.waypoints}
                    showWaypoints={showWaypoints}
                    hoverIdx={hoverIdx}
                    onHover={setHoverIdx}
                    viewRange={viewRange ?? [0, file.point_count - 1]}
                    onViewRangeChange={(r) =>
                      setViewRange(
                        r[0] <= 0 && r[1] >= file.point_count - 1 ? null : r
                      )
                    }
                    maxJumpKm={movement.maxJumpKm}
                    hasTime={file.has_time !== false}
                  />
                </div>
              ) : (
                <p className="mt-3 text-xs text-[color:var(--fg-muted)]">
                  <Info className="mr-1 inline h-3 w-3" />
                  No altitude data in this file — the elevation profile is
                  unavailable.
                </p>
              )}
            </section>
          )}

          <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
            <h3 className="mb-3 font-semibold tracking-tight">Charts</h3>
            <div className="space-y-4">
              <StreamChart
                title="Speed"
                unit="km/h"
                color="#ef95b0"
                icon={<ActivityIcon className="h-3.5 w-3.5" />}
                series={speedSeries}
                runs={analysis.runs}
                totalPoints={file.point_count}
                seamIndices={file.seamIndices}
                viewRange={viewRange}
                hoverIdx={hoverIdx}
                onHover={setHoverIdx}
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
                  viewRange={viewRange}
                  hoverIdx={hoverIdx}
                  onHover={setHoverIdx}
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
                  viewRange={viewRange}
                  hoverIdx={hoverIdx}
                  onHover={setHoverIdx}
                />
              )}
            </div>
            <p className="mt-2 text-xs text-[color:var(--fg-muted)]">
              <span className="inline-block h-2 w-3 rounded bg-strava align-middle"></span>{" "}
              kept ·{" "}
              <span className="inline-block h-2 w-3 rounded bg-[color:var(--fg-muted)]/30 align-middle"></span>{" "}
              dropped · hover to pin the position on the map
              {viewRange && " · charts follow the elevation zoom window"}
            </p>
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
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
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
                    label="Min pts"
                    hint="ignore segments shorter than N points (anti-noise)"
                    value={movement.minRunPoints}
                    step={1}
                    onChange={(v) =>
                      setMovement({ ...movement, minRunPoints: Math.max(1, v) })
                    }
                  />
                  <NumberField
                    label="Max jump km"
                    hint="distance between 2 points above this = teleport, skipped"
                    value={movement.maxJumpKm}
                    step={0.5}
                    onChange={(v) =>
                      setMovement({ ...movement, maxJumpKm: Math.max(0.1, v) })
                    }
                  />
                </div>
                <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  <label
                    className="flex items-center gap-2"
                    title="≈ 0 sustained = not pedaling (train, car, parked). Kept unless HR is also low."
                  >
                    <input
                      type="checkbox"
                      checked={movement.useCadence}
                      onChange={(e) =>
                        setMovement({ ...movement, useCadence: e.target.checked })
                      }
                      className="accent-strava"
                      disabled={!analysis.hasCad}
                    />
                    <span className="whitespace-nowrap">Avg cadence below</span>
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
                      className="w-14 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-1.5 py-0.5 text-right disabled:opacity-50"
                    />
                    <span className="text-[color:var(--fg-muted)]">rpm</span>
                    {!analysis.hasCad && (
                      <span className="text-amber-500">no data</span>
                    )}
                  </label>
                  <label
                    className="flex items-center gap-2"
                    title="below this = at rest (sitting, riding in a vehicle)"
                  >
                    <input
                      type="checkbox"
                      checked={movement.useHeartRate}
                      onChange={(e) =>
                        setMovement({ ...movement, useHeartRate: e.target.checked })
                      }
                      className="accent-strava"
                      disabled={!analysis.hasHR}
                    />
                    <span className="whitespace-nowrap">Avg HR below</span>
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
                      className="w-14 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-1.5 py-0.5 text-right disabled:opacity-50"
                    />
                    <span className="text-[color:var(--fg-muted)]">bpm</span>
                    {!analysis.hasHR && (
                      <span className="text-amber-500">no data</span>
                    )}
                  </label>
                </div>
                {movement.useCadence &&
                  movement.useHeartRate &&
                  analysis.hasCad &&
                  analysis.hasHR && (
                    <p className="text-[color:var(--fg-muted)]">
                      <Info className="mr-1 inline h-3 w-3" />
                      A segment is dropped only when <strong>both</strong>{" "}
                      cadence AND HR are below threshold — freewheel descents
                      stay, train/car are dropped.
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
    <label
      className="flex items-center justify-between gap-2"
      title={hint}
    >
      <span className="text-[color:var(--fg-muted)] whitespace-nowrap">
        {label}
      </span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-16 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2 py-1 text-right"
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

function StreamChart({
  title,
  unit,
  color,
  icon,
  series,
  runs,
  totalPoints,
  seamIndices,
  viewRange,
  hoverIdx,
  onHover,
}: {
  title: string;
  unit: string;
  color: string;
  icon: React.ReactNode;
  series: Array<number | null>;
  runs: Array<{ start: number; end: number }>;
  totalPoints: number;
  seamIndices?: number[];
  /** Zoom window shared with the elevation profile; null = full track. */
  viewRange?: [number, number] | null;
  hoverIdx?: number | null;
  /** Hovering the chart drives the shared crosshair on the map + siblings. */
  onHover?: (idx: number | null) => void;
}) {
  const W = 1000;
  const H = 80;
  const targetSamples = 400;
  const last = Math.max(0, Math.min(totalPoints, series.length) - 1);
  const a = viewRange ? Math.max(0, Math.min(viewRange[0], last)) : 0;
  const b = viewRange ? Math.max(a, Math.min(viewRange[1], last)) : last;
  const step = Math.max(1, Math.ceil((b - a + 1) / targetSamples));

  // Map a pointer position to the nearest track index within the window.
  const idxFromClientX = (clientX: number, el: SVGSVGElement): number => {
    const rect = el.getBoundingClientRect();
    const frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.round(a + Math.max(0, Math.min(1, frac)) * (b - a));
  };
  // Nearest finite value to hoverIdx (series has gaps at teleports), for the
  // marker dot + readout.
  const hoverActive =
    typeof hoverIdx === "number" && hoverIdx >= a && hoverIdx <= b;
  let hoverVal: number | null = null;
  if (hoverActive) {
    for (let d = 0; d <= 4; d++) {
      const lv = series[hoverIdx! - d];
      const rv = series[hoverIdx! + d];
      if (typeof lv === "number" && Number.isFinite(lv)) { hoverVal = lv; break; }
      if (typeof rv === "number" && Number.isFinite(rv)) { hoverVal = rv; break; }
    }
  }

  const samples: Array<{ x: number; v: number | null; kept: boolean }> = [];
  for (let i = a; i <= b; i += step) {
    const kept = isIndexKept(i, runs);
    samples.push({ x: i, v: series[i] ?? null, kept });
  }
  // Compute min/max from the full-resolution visible window (not the
  // downsampled samples) so the header label reflects the real range,
  // including spikes the chart sampling might skip.
  let min = Infinity;
  let max = -Infinity;
  for (let i = a; i <= b; i++) {
    const v = series[i];
    if (typeof v === "number" && Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const range = max - min || 1;
  const xScale = (x: number) => ((x - a) / Math.max(1, b - a)) * W;
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
          {hoverVal !== null ? (
            <span className="font-semibold" style={{ color }}>
              {hoverVal.toFixed(0)} {unit}
            </span>
          ) : (
            <>
              {min.toFixed(0)} – {max.toFixed(0)} {unit}
            </>
          )}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-16 w-full cursor-crosshair touch-none rounded bg-[color:var(--bg-input)]"
        onPointerMove={(e) => onHover?.(idxFromClientX(e.clientX, e.currentTarget))}
        onPointerLeave={() => onHover?.(null)}
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
        {(seamIndices ?? [])
          .filter((idx) => idx >= a && idx <= b)
          .map((idx, i) => (
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
        {typeof hoverIdx === "number" && hoverIdx >= a && hoverIdx <= b && (
          <line
            x1={xScale(hoverIdx)}
            x2={xScale(hoverIdx)}
            y1={0}
            y2={H}
            stroke="#0ea5e9"
            strokeWidth={1}
            strokeOpacity={0.8}
            vectorEffect="non-scaling-stroke"
          />
        )}
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
