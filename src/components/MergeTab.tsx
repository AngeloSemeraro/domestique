"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  AlertCircle,
  Bike,
  Check,
  ChevronDown,
  Cloud,
  Download,
  ExternalLink,
  FileUp,
  GitMerge,
  Info,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import type { StravaActivity } from "@/lib/strava";
import {
  buildMergedGpx,
  buildMergedTcx,
  combineSourcesForDisplay,
  randomDuplicateShiftSec,
  DEFAULT_MOVEMENT_FILTER,
  filteredStats,
  streamAvgKmh,
  streamDistanceKm,
  type MovementFilter,
  type Streams,
  type StreamedActivity,
  type TimingOptions,
} from "@/lib/gpx";
import type { ParsedTrack } from "@/lib/file-parsers";
import { ActivitySourceBox, type LocalFile } from "./SourcePicker";

const RIDE_SPORTS = new Set([
  "Ride",
  "MountainBikeRide",
  "GravelRide",
  "EBikeRide",
  "EMountainBikeRide",
  "VirtualRide",
]);

type FileSource = LocalFile;

type OutputMode = "strava" | "tcx" | "gpx";

type TimingChoice =
  | { kind: "natural" }
  | { kind: "match"; key: string }
  | { kind: "custom" };

type Step =
  | { kind: "idle" }
  | { kind: "fetching"; done: number; total: number }
  | { kind: "building" }
  | { kind: "uploading" }
  | { kind: "processing"; uploadId: number }
  | { kind: "done_upload"; activityId: number }
  | { kind: "done_download"; filename: string }
  | { kind: "error"; message: string };

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function MergeTab({
  onSendToAnalyzer,
}: {
  onSendToAnalyzer?: (
    seed: ParsedTrack & {
      rawSources?: StreamedActivity[];
      seamIndices?: number[];
    }
  ) => void;
}) {
  // Selected Strava rides (full objects — the shared picker owns the list).
  const [selectedActs, setSelectedActs] = useState<Map<number, StravaActivity>>(
    new Map()
  );
  const [files, setFiles] = useState<FileSource[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [output, setOutput] = useState<OutputMode>("strava");
  const [timing, setTiming] = useState<TimingChoice>({ kind: "natural" });
  const [customKmh, setCustomKmh] = useState<string>("25");
  const [movement, setMovement] = useState<MovementFilter>(DEFAULT_MOVEMENT_FILTER);
  const [showMovementOpts, setShowMovementOpts] = useState(false);
  const [bypassDuplicate, setBypassDuplicate] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "idle" });

  function toggleActivity(a: StravaActivity) {
    setSelectedActs((prev) => {
      const next = new Map(prev);
      if (next.has(a.id)) next.delete(a.id);
      else next.set(a.id, a);
      return next;
    });
  }

  function addFiles(added: FileSource[]) {
    setFiles((prev) => {
      const map = new Map(prev.map((p) => [p.uid, p]));
      for (const a of added) map.set(a.uid, a);
      return Array.from(map.values());
    });
  }

  function removeFile(uid: string) {
    setFiles((prev) => prev.filter((f) => f.uid !== uid));
  }

  const selectedActivities = useMemo(
    () => Array.from(selectedActs.values()),
    [selectedActs]
  );

  type Source =
    | {
        kind: "strava";
        key: string;
        name: string;
        start_date: string;
        distance_km: number;
        moving_time: number;
        avg_kmh: number;
        activity: StravaActivity;
      }
    | {
        kind: "file";
        key: string;
        name: string;
        start_date: string;
        distance_km: number;
        avg_kmh: number;
        file: FileSource;
      };

  const sources = useMemo<Source[]>(() => {
    const list: Source[] = [
      ...selectedActivities.map<Source>((a) => ({
        kind: "strava",
        key: `s-${a.id}`,
        name: a.name,
        start_date: a.start_date,
        distance_km: a.distance / 1000,
        moving_time: a.moving_time,
        avg_kmh: (a.average_speed ?? 0) * 3.6,
        activity: a,
      })),
      ...files.map<Source>((f) => ({
        kind: "file",
        key: `f-${f.uid}`,
        name: f.name,
        start_date: f.start_date,
        distance_km: f.streams.latlng
          ? streamDistanceKm(f.streams.latlng.data, 1)
          : 0,
        avg_kmh: streamAvgKmh(f.streams, movement),
        file: f,
      })),
    ];
    list.sort((a, b) => +new Date(a.start_date) - +new Date(b.start_date));
    return list;
  }, [selectedActivities, files, movement]);

  useEffect(() => {
    if (sources.length >= 2 && !name) {
      setName(`Merged: ${sources[0].name} + ${sources.length - 1} more`);
    }
  }, [sources, name]);

  async function runMerge() {
    if (sources.length < 2) return;
    if (!name.trim()) {
      alert("Give the merged activity a name.");
      return;
    }

    const stravaSources = sources.filter((s) => s.kind === "strava") as Array<
      Extract<Source, { kind: "strava" }>
    >;
    setStep({
      kind: "fetching",
      done: 0,
      total: stravaSources.length,
    });

    try {
      const streamsById = new Map<number, Streams>();
      for (let i = 0; i < stravaSources.length; i++) {
        const a = stravaSources[i].activity;
        const res = await apiFetch(`/api/streams/${a.id}`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(`Streams for ${a.name}: ${e.error ?? res.status}`);
        }
        const s = (await res.json()) as Streams;
        if (!s.latlng?.data?.length) {
          throw new Error(
            `"${a.name}" has no GPS track (indoor / manual?) — can't merge.`
          );
        }
        streamsById.set(a.id, s);
        setStep({
          kind: "fetching",
          done: i + 1,
          total: stravaSources.length,
        });
        await new Promise((r) => setTimeout(r, 200));
      }

      setStep({ kind: "building" });
      const orderedForGpx = sources.map((s) => {
        if (s.kind === "strava") {
          return {
            name: s.name,
            start_date: s.start_date,
            streams: streamsById.get(s.activity.id)!,
            sport_hint: s.activity.sport_type,
          };
        }
        return {
          name: s.name,
          start_date: s.start_date,
          streams: s.file.streams,
          sport_hint: "Ride",
        };
      });
      const timingOpts: TimingOptions = resolveTiming(timing, sources, customKmh);
      const shiftSec = bypassDuplicate ? randomDuplicateShiftSec() : 0;

      if (output === "gpx") {
        const gpx = buildMergedGpx(orderedForGpx, name, timingOpts, movement, shiftSec);
        const filename = `${slug(name)}-${isoDay(new Date())}.gpx`;
        triggerDownload(gpx, filename, "application/gpx+xml");
        setStep({ kind: "done_download", filename });
        return;
      }

      // TCX carries an explicit per-point DistanceMeters odometer that skips
      // teleports, so Strava uses the real ridden distance instead of summing
      // GPS points across unrecorded transfers.
      const tcx = buildMergedTcx(orderedForGpx, name, timingOpts, movement, shiftSec);

      if (output === "tcx") {
        const filename = `${slug(name)}-${isoDay(new Date())}.tcx`;
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
          description:
            description ||
            `Merged from: ${sources.map((s) => s.name).join(", ")}`,
          external_id: `sbe-merge-${Date.now()}`,
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

  async function sendToAnalyzer() {
    if (!onSendToAnalyzer) return;
    if (sources.length < 2) return;
    if (!name.trim()) {
      alert("Give the merged activity a name first.");
      return;
    }
    const stravaSources = sources.filter((s) => s.kind === "strava") as Array<
      Extract<Source, { kind: "strava" }>
    >;
    setStep({ kind: "fetching", done: 0, total: stravaSources.length });
    try {
      const streamsById = new Map<number, Streams>();
      for (let i = 0; i < stravaSources.length; i++) {
        const a = stravaSources[i].activity;
        const res = await apiFetch(`/api/streams/${a.id}`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(`Streams for ${a.name}: ${e.error ?? res.status}`);
        }
        const s = (await res.json()) as Streams;
        if (!s.latlng?.data?.length) {
          throw new Error(`"${a.name}" has no GPS track — can't merge.`);
        }
        streamsById.set(a.id, s);
        setStep({ kind: "fetching", done: i + 1, total: stravaSources.length });
        await new Promise((r) => setTimeout(r, 200));
      }
      setStep({ kind: "building" });
      const orderedForGpx = sources.map((s) => {
        if (s.kind === "strava") {
          return {
            name: s.name,
            start_date: s.start_date,
            streams: streamsById.get(s.activity.id)!,
            sport_hint: s.activity.sport_type,
          };
        }
        return {
          name: s.name,
          start_date: s.start_date,
          streams: s.file.streams,
          sport_hint: "Ride",
        };
      });
      // Skip the GPX round-trip. parseGpxFile would flatten every <trk>
      // back into one stream, and the Analyzer would later emit a single
      // <trk> on download — collapsing our 3-trk structure. Instead, pass
      // the raw orderedForGpx so the Analyzer can re-emit them as 3 <trk>
      // when the user downloads or publishes.
      const display = combineSourcesForDisplay(orderedForGpx);
      onSendToAnalyzer({
        name,
        start_date: display.start_date,
        streams: display.streams,
        point_count: display.point_count,
        rawSources: orderedForGpx,
        seamIndices: display.seam_indices,
      });
      setStep({ kind: "idle" });
    } catch (e) {
      setStep({
        kind: "error",
        message: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  function reset() {
    setStep({ kind: "idle" });
    setSelectedActs(new Map());
    setFiles([]);
    setName("");
    setDescription("");
  }

  const busy =
    step.kind !== "idle" &&
    step.kind !== "done_upload" &&
    step.kind !== "done_download" &&
    step.kind !== "error";

  const totalKm = sources.reduce((s, src) => s + src.distance_km, 0);
  const previewAvgKmh = computePreviewAvgKmh(timing, sources, customKmh);

  const filterPreview = useMemo(() => {
    if (!movement.enabled || files.length === 0) return null;
    let keptKm = 0;
    let totalKm = 0;
    let filesWithoutSignals = 0;
    for (const f of files) {
      const stats = filteredStats(f.streams, movement);
      keptKm += stats.km;
      totalKm += streamDistanceKm(f.streams.latlng?.data ?? [], movement.maxJumpKm);
      const cadOk = movement.useCadence && (f.streams.cadence?.data?.length ?? 0) > 0;
      const hrOk = movement.useHeartRate && (f.streams.heartrate?.data?.length ?? 0) > 0;
      if (!cadOk && !hrOk) filesWithoutSignals++;
    }
    return { keptKm, totalKm, filesWithoutSignals };
  }, [movement, files]);

  return (
    <div className="space-y-6">
      <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-strava/10 text-strava">
            <GitMerge className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold tracking-tight">Merge rides</h2>
            <p className="text-sm text-[color:var(--fg-muted)]">
              Pick rides from Strava and/or upload local GPX/FIT files. Output
              as a Strava activity or a downloaded GPX.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-700 dark:text-blue-300">
          <div className="flex gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <p>
              Strava has no DELETE API — uploaded originals stay on your
              profile (hide them via Batch edit). Only GPS-bearing rides can
              be merged.
            </p>
          </div>
        </div>
      </section>

      <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
        <h3 className="font-semibold tracking-tight">Sources</h3>
        <p className="mb-3 text-sm text-[color:var(--fg-muted)]">
          Pick at least two — Strava rides and/or local .gpx / .fit files, in
          any mix.
        </p>
        <ActivitySourceBox
          mode="multi"
          stravaFilter={(a) => RIDE_SPORTS.has(a.sport_type)}
          selectedActivityIds={new Set(selectedActs.keys())}
          onToggleActivity={toggleActivity}
          files={files}
          onFilesAdded={addFiles}
          onFileRemoved={removeFile}
          emptyHint="No rides in this range (only GPS ride types are listed)."
        />
      </section>

      {sources.length >= 2 && (
        <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
          <h3 className="mb-3 font-semibold tracking-tight">
            Merge {sources.length} sources
          </h3>

          <div className="mb-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] p-3 text-sm">
            <p className="mb-1 text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
              Order (by start time)
            </p>
            <ol className="space-y-1">
              {sources.map((s, i) => {
                const prev = i > 0 ? sources[i - 1] : null;
                const prevLastLL = prev
                  ? prev.kind === "strava"
                    ? null
                    : prev.file.streams.latlng?.data?.slice(-1)[0]
                  : null;
                const thisFirstLL =
                  s.kind === "strava"
                    ? null
                    : s.file.streams.latlng?.data?.[0];
                const jumpKm =
                  prevLastLL && thisFirstLL
                    ? haversineKm(prevLastLL, thisFirstLL)
                    : null;
                return (
                  <li key={s.key} className="space-y-1">
                    {jumpKm !== null && jumpKm > 1 && (
                      <div className="flex items-center gap-2 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        <span>
                          <strong>{jumpKm.toFixed(1)} km gap</strong> from
                          previous source — this distance is unrecorded
                          (car/train?) and will be added to Strava&apos;s total
                          if merged.
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[color:var(--fg-muted)]">{i + 1}.</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                          s.kind === "strava"
                            ? "bg-strava/10 text-strava"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {s.kind === "strava" ? "Strava" : "File"}
                      </span>
                      <span className="font-mono text-xs text-[color:var(--fg-muted)]">
                        {s.start_date.slice(0, 16).replace("T", " ")}
                      </span>
                      <span className="flex-1 truncate">{s.name}</span>
                      {s.kind === "strava" && s.distance_km !== undefined && (
                        <span className="font-mono text-xs text-[color:var(--fg-muted)]">
                          {s.distance_km.toFixed(1)} km
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 text-xs text-[color:var(--fg-muted)]">
              ≈ {totalKm.toFixed(1)} km
              {sources.some((s) => s.kind === "strava") && (
                <>
                  {" · "}
                  {formatDuration(
                    sources.reduce(
                      (s, src) =>
                        s + (src.kind === "strava" ? src.moving_time ?? 0 : 0),
                      0
                    )
                  )}{" "}
                  (Strava only)
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 text-sm"
                placeholder="My epic ride"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
                Description (Strava upload only)
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 text-sm"
                placeholder="Auto-generated from source names if blank"
              />
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-2 text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
              Output
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <OutputCard
                checked={output === "strava"}
                onClick={() => setOutput("strava")}
                icon={<Cloud className="h-4 w-4" />}
                title="Upload to Strava"
                subtitle="As TCX — correct distance, skips transfers"
              />
              <OutputCard
                checked={output === "tcx"}
                onClick={() => setOutput("tcx")}
                icon={<Download className="h-4 w-4" />}
                title="Download TCX"
                subtitle="Recommended — has the real distance odometer"
              />
              <OutputCard
                checked={output === "gpx"}
                onClick={() => setOutput("gpx")}
                icon={<Download className="h-4 w-4" />}
                title="Download GPX"
                subtitle="No distance field; tools re-sum from GPS"
              />
            </div>
            {output === "strava" &&
              sources.some((s) => s.kind === "strava") && (
                <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <p className="mb-2 flex items-start gap-2 text-amber-700 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      <strong>Strava will reject this as a duplicate</strong>{" "}
                      of the existing rides (same start time + GPS). You must
                      delete or hide them on strava.com first, or pick
                      <em> Download GPX</em> instead.
                    </span>
                  </p>
                  <ul className="space-y-0.5 pl-5 text-[color:var(--fg-muted)]">
                    {sources
                      .filter(
                        (s): s is Extract<typeof sources[number], { kind: "strava" }> =>
                          s.kind === "strava"
                      )
                      .map((s) => (
                        <li key={s.key} className="flex items-center gap-2">
                          <a
                            href={`https://www.strava.com/activities/${s.activity.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 truncate ![color:inherit] hover:!text-strava hover:underline"
                          >
                            {s.name}
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            {output !== "gpx" && (
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
                  accepts the upload even if the source rides are still on your
                  account. May take a couple of tries; the shift is small so the
                  date stays correct.
                </span>
              </label>
            )}
          </fieldset>

          <fieldset className="mt-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] p-3">
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={movement.enabled}
                onChange={(e) =>
                  setMovement({ ...movement, enabled: e.target.checked })
                }
                className="mt-0.5 accent-strava"
              />
              <div className="flex-1">
                <p className="font-medium">
                  Drop non-moving points (pauses, train, car…)
                </p>
                <p className="text-xs text-[color:var(--fg-muted)]">
                  Splits each source into segments where per-point speed sits
                  inside the chosen range. Useful when a recording includes a
                  train commute or long stops.
                </p>
                {movement.enabled && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowMovementOpts((v) => !v)}
                      className="mt-1 text-xs text-strava hover:underline"
                    >
                      {showMovementOpts
                        ? "Hide thresholds"
                        : `Thresholds: ${movement.minKmh}–${movement.maxKmh} km/h`}
                    </button>
                    {showMovementOpts && (
                      <div className="mt-2 flex flex-wrap gap-3">
                        <label className="flex items-center gap-1.5 text-xs">
                          Min km/h
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={movement.minKmh}
                            onChange={(e) =>
                              setMovement({
                                ...movement,
                                minKmh: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-16 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-1.5 py-0.5"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs">
                          Max km/h
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={movement.maxKmh}
                            onChange={(e) =>
                              setMovement({
                                ...movement,
                                maxKmh: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-16 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-1.5 py-0.5"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs">
                          Min run pts
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={movement.minRunPoints}
                            onChange={(e) =>
                              setMovement({
                                ...movement,
                                minRunPoints:
                                  parseInt(e.target.value, 10) || 1,
                              })
                            }
                            className="w-16 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-1.5 py-0.5"
                          />
                        </label>
                        <label className="flex w-full items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={movement.useCadence}
                            onChange={(e) =>
                              setMovement({
                                ...movement,
                                useCadence: e.target.checked,
                              })
                            }
                            className="accent-strava"
                          />
                          Cadence check (drop segments with avg cadence below
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={movement.minAvgCadenceRpm}
                            disabled={!movement.useCadence}
                            onChange={(e) =>
                              setMovement({
                                ...movement,
                                minAvgCadenceRpm:
                                  parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-14 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-1.5 py-0.5 disabled:opacity-50"
                          />
                          rpm)
                        </label>
                        <label className="flex w-full items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={movement.useHeartRate}
                            onChange={(e) =>
                              setMovement({
                                ...movement,
                                useHeartRate: e.target.checked,
                              })
                            }
                            className="accent-strava"
                          />
                          HR check (drop segments with avg HR below
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={movement.minAvgHeartRate}
                            disabled={!movement.useHeartRate}
                            onChange={(e) =>
                              setMovement({
                                ...movement,
                                minAvgHeartRate:
                                  parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-14 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-1.5 py-0.5 disabled:opacity-50"
                          />
                          bpm) — best universal filter for train/car
                        </label>
                      </div>
                    )}
                    {filterPreview && (
                      <>
                        <p className="mt-2 text-xs text-[color:var(--fg-muted)]">
                          File sources: kept{" "}
                          <span className="font-semibold text-[color:var(--fg)]">
                            {filterPreview.keptKm.toFixed(1)} km
                          </span>{" "}
                          of {filterPreview.totalKm.toFixed(1)} km
                          {filterPreview.totalKm > filterPreview.keptKm && (
                            <>
                              {" "}· dropped{" "}
                              <span className="font-semibold text-red-500">
                                {(
                                  filterPreview.totalKm - filterPreview.keptKm
                                ).toFixed(1)}{" "}
                                km
                              </span>
                            </>
                          )}
                          . Strava sources are filtered at upload time.
                        </p>
                        {filterPreview.filesWithoutSignals > 0 && (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                            {filterPreview.filesWithoutSignals} file(s) without
                            cadence{movement.useHeartRate ? " or HR" : ""} data
                            — only the speed range can be used. Tighten Max
                            km/h or pre-trim the file.
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </label>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
              Average speed
              <span className="rounded-full bg-[color:var(--row-hover)] px-2 py-0.5 text-[10px] normal-case tracking-normal text-[color:var(--fg)]">
                Result ≈ {previewAvgKmh > 0 ? previewAvgKmh.toFixed(1) : "—"} km/h
              </span>
            </legend>
            <div className="space-y-1.5">
              <TimingRow
                checked={timing.kind === "natural"}
                onSelect={() => setTiming({ kind: "natural" })}
                title="Natural (keep original timestamps)"
                subtitle="Each source keeps its own pace; gaps between sources are preserved."
              />
              {sources.map((s) => (
                <TimingRow
                  key={s.key}
                  checked={timing.kind === "match" && timing.key === s.key}
                  onSelect={() => setTiming({ kind: "match", key: s.key })}
                  title={`Match: ${s.name}`}
                  subtitle={`Rescale total time so the merged ride averages ${s.avg_kmh > 0 ? s.avg_kmh.toFixed(1) : "?"} km/h.`}
                  badge={s.avg_kmh > 0 ? `${s.avg_kmh.toFixed(1)} km/h` : "—"}
                  disabled={!(s.avg_kmh > 0)}
                />
              ))}
              <TimingRow
                checked={timing.kind === "custom"}
                onSelect={() => setTiming({ kind: "custom" })}
                title="Custom target"
                subtitle="Rescale total time to hit your own target km/h."
                extra={
                  timing.kind === "custom" && (
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={customKmh}
                      onChange={(e) => setCustomKmh(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-20 rounded border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2 py-1 text-sm"
                    />
                  )
                }
              />
            </div>
            {timing.kind !== "natural" && (
              <p className="mt-2 text-xs text-[color:var(--fg-muted)]">
                Rescaling preserves the relative pacing inside each segment and
                concatenates segments end-to-end with no gaps.
              </p>
            )}
          </fieldset>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={runMerge}
              disabled={busy || sources.length < 2}
              className="group inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all hover:scale-[1.02] disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : output === "strava" ? (
                <Upload className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {busy
                ? "Working…"
                : output === "strava"
                  ? "Merge & upload"
                  : output === "tcx"
                    ? "Merge & download TCX"
                    : "Merge & download GPX"}
            </button>

            {onSendToAnalyzer && (
              <button
                onClick={sendToAnalyzer}
                disabled={busy || sources.length < 2}
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-4 py-1.5 text-sm font-medium transition-all hover:scale-[1.02] hover:border-strava hover:text-strava disabled:opacity-40"
                title="Build the merged file and load it in the Inspector tab without uploading"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Send to Inspector
              </button>
            )}

            <StepStatus step={step} />

            {(step.kind === "done_upload" ||
              step.kind === "done_download" ||
              step.kind === "error") && (
              <button
                onClick={reset}
                className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
              >
                Start over
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function TimingRow({
  checked,
  onSelect,
  title,
  subtitle,
  badge,
  extra,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  badge?: string;
  extra?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-strava bg-strava/5"
          : "border-[color:var(--border)] hover:border-[color:var(--fg-muted)]"
      }`}
    >
      <span
        className={`mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? "border-strava" : "border-[color:var(--border)]"
        }`}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-strava" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-[color:var(--fg-muted)]">{subtitle}</p>
      </div>
      {extra}
      {badge && (
        <span className="rounded-full bg-[color:var(--row-hover)] px-2 py-0.5 font-mono text-xs">
          {badge}
        </span>
      )}
    </button>
  );
}

function OutputCard({
  checked,
  onClick,
  icon,
  title,
  subtitle,
}: {
  checked: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
        checked
          ? "border-strava bg-strava/5"
          : "border-[color:var(--border)] hover:border-[color:var(--fg-muted)]"
      }`}
    >
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
          checked ? "bg-strava text-white" : "bg-[color:var(--row-hover)] text-[color:var(--fg-muted)]"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-[color:var(--fg-muted)]">{subtitle}</p>
      </div>
      <div
        className={`mt-1 h-3.5 w-3.5 rounded-full border-2 ${
          checked ? "border-strava bg-strava" : "border-[color:var(--border)]"
        }`}
      />
    </button>
  );
}

function StepStatus({ step }: { step: Step }) {
  if (step.kind === "idle") return null;
  if (step.kind === "fetching") {
    return (
      <span className="text-sm text-[color:var(--fg-muted)]">
        Fetching Strava streams {step.done}/{step.total}…
      </span>
    );
  }
  if (step.kind === "building") {
    return (
      <span className="text-sm text-[color:var(--fg-muted)]">
        Building merged GPX…
      </span>
    );
  }
  if (step.kind === "uploading") {
    return (
      <span className="text-sm text-[color:var(--fg-muted)]">
        Uploading to Strava…
      </span>
    );
  }
  if (step.kind === "processing") {
    return (
      <span className="text-sm text-[color:var(--fg-muted)]">
        Strava processing (upload #{step.uploadId})…
      </span>
    );
  }
  if (step.kind === "done_upload") {
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
  }
  if (step.kind === "done_download") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" />
        Downloaded {step.filename}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-red-500">
      <AlertCircle className="h-3.5 w-3.5" />
      {step.message}
    </span>
  );
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
          `Strava: ${msg}. Delete the source activities on strava.com first, or use "Download GPX".`
        );
      }
      throw new Error(msg);
    }
    if (data.activity_id) return data.activity_id;
  }
  throw new Error("Upload still processing after 2 min — check Strava manually.");
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
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "merged-ride";
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

function resolveTiming(
  choice: TimingChoice,
  sources: Array<{ key: string; avg_kmh: number }>,
  customKmh: string
): TimingOptions {
  if (choice.kind === "natural") return { mode: "natural" };
  if (choice.kind === "match") {
    const src = sources.find((s) => s.key === choice.key);
    const kmh = src?.avg_kmh ?? 0;
    return kmh > 0 ? { mode: "target_kmh", kmh } : { mode: "natural" };
  }
  const n = parseFloat(customKmh);
  return n > 0 ? { mode: "target_kmh", kmh: n } : { mode: "natural" };
}

function computePreviewAvgKmh(
  choice: TimingChoice,
  sources: Array<{ key: string; avg_kmh: number; distance_km: number }>,
  customKmh: string
): number {
  if (choice.kind === "match") {
    return sources.find((s) => s.key === choice.key)?.avg_kmh ?? 0;
  }
  if (choice.kind === "custom") {
    const n = parseFloat(customKmh);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  // Natural: weighted by distance, approximates Strava's result
  const totalKm = sources.reduce((s, x) => s + x.distance_km, 0);
  if (totalKm <= 0) return 0;
  const totalHours = sources.reduce(
    (h, x) => h + (x.avg_kmh > 0 ? x.distance_km / x.avg_kmh : 0),
    0
  );
  return totalHours > 0 ? totalKm / totalHours : 0;
}
