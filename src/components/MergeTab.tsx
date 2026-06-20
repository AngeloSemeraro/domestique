"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Bike,
  Check,
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
} from "lucide-react";
import type { StravaActivity } from "@/lib/strava";
import { buildMergedGpx, type Streams } from "@/lib/gpx";
import { parseTrackFile, type ParsedTrack } from "@/lib/file-parsers";

const RIDE_SPORTS = new Set([
  "Ride",
  "MountainBikeRide",
  "GravelRide",
  "EBikeRide",
  "EMountainBikeRide",
  "VirtualRide",
]);

type FileSource = {
  uid: string;
  filename: string;
  name: string;
  start_date: string;
  streams: Streams;
  point_count: number;
};

type OutputMode = "strava" | "download";

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

export default function MergeTab() {
  const today = new Date();
  const ninetyAgo = new Date(Date.now() - 90 * 86400 * 1000);
  const [after, setAfter] = useState(isoDay(ninetyAgo));
  const [before, setBefore] = useState(isoDay(today));

  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [files, setFiles] = useState<FileSource[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [output, setOutput] = useState<OutputMode>("strava");
  const [step, setStep] = useState<Step>({ kind: "idle" });

  async function load() {
    setLoading(true);
    setLoadError(null);
    setActivities([]);
    setSelectedIds(new Set());
    try {
      const afterTs = Math.floor(new Date(after).getTime() / 1000);
      const beforeTs = Math.floor(
        (new Date(before).getTime() + 86400 * 1000) / 1000
      );
      const all: StravaActivity[] = [];
      let page = 1;
      while (page <= 5) {
        const qs = new URLSearchParams({
          after: String(afterTs),
          before: String(beforeTs),
          page: String(page),
        });
        const res = await fetch(`/api/activities?${qs.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.activities?.length) break;
        all.push(...data.activities);
        if (data.activities.length < 100) break;
        page++;
      }
      setActivities(all.filter((a) => RIDE_SPORTS.has(a.sport_type)));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "unknown");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFileSelect(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setFileError(null);
    const added: FileSource[] = [];
    const errors: string[] = [];
    for (const f of Array.from(picked)) {
      try {
        const parsed = await parseTrackFile(f);
        added.push({
          uid: `${f.name}-${f.size}-${f.lastModified}`,
          filename: f.name,
          ...parsed,
        });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `parse error: ${f.name}`);
      }
    }
    setFiles((prev) => {
      const map = new Map(prev.map((p) => [p.uid, p]));
      for (const a of added) map.set(a.uid, a);
      return Array.from(map.values());
    });
    if (errors.length) setFileError(errors.join(" · "));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(uid: string) {
    setFiles((prev) => prev.filter((f) => f.uid !== uid));
  }

  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  const selectedActivities = useMemo(
    () => activities.filter((a) => selectedIds.has(a.id)),
    [activities, selectedIds]
  );

  type Source =
    | { kind: "strava"; key: string; name: string; start_date: string; distance_km?: number; moving_time?: number; activity: StravaActivity }
    | { kind: "file"; key: string; name: string; start_date: string; file: FileSource };

  const sources = useMemo<Source[]>(() => {
    const list: Source[] = [
      ...selectedActivities.map<Source>((a) => ({
        kind: "strava",
        key: `s-${a.id}`,
        name: a.name,
        start_date: a.start_date,
        distance_km: a.distance / 1000,
        moving_time: a.moving_time,
        activity: a,
      })),
      ...files.map<Source>((f) => ({
        kind: "file",
        key: `f-${f.uid}`,
        name: f.name,
        start_date: f.start_date,
        file: f,
      })),
    ];
    list.sort((a, b) => +new Date(a.start_date) - +new Date(b.start_date));
    return list;
  }, [selectedActivities, files]);

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
        const res = await fetch(`/api/streams/${a.id}`);
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
          };
        }
        return {
          name: s.name,
          start_date: s.start_date,
          streams: s.file.streams,
        };
      });
      const gpx = buildMergedGpx(orderedForGpx, name);

      if (output === "download") {
        const filename = `${slug(name)}-${isoDay(new Date())}.gpx`;
        triggerDownload(gpx, filename);
        setStep({ kind: "done_download", filename });
        return;
      }

      setStep({ kind: "uploading" });
      const up = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpx,
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

  function reset() {
    setStep({ kind: "idle" });
    setSelectedIds(new Set());
    setFiles([]);
    setName("");
    setDescription("");
  }

  const busy =
    step.kind !== "idle" &&
    step.kind !== "done_upload" &&
    step.kind !== "done_download" &&
    step.kind !== "error";

  const totalKm =
    sources.reduce(
      (s, src) => s + (src.kind === "strava" ? (src.distance_km ?? 0) : 0),
      0
    ) +
    files.reduce(
      (s, f) =>
        s + (f.streams.latlng ? estimateDistanceKm(f.streams.latlng.data) : 0),
      0
    );

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
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold tracking-tight">
            Local files{" "}
            <span className="text-xs font-normal text-[color:var(--fg-muted)]">
              .gpx / .fit
            </span>
          </h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[color:var(--border)] px-3 py-1.5 text-sm transition-colors hover:border-strava hover:text-strava"
          >
            <FileUp className="h-3.5 w-3.5" />
            Add file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,.fit"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-[color:var(--fg-muted)]">
            No files added. Click <strong>Add file</strong> to include local
            GPX/FIT tracks in the merge.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li
                key={f.uid}
                className="flex items-center gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-3 py-2 text-sm"
              >
                <FileUp className="h-3.5 w-3.5 text-[color:var(--fg-muted)]" />
                <span className="flex-1 truncate font-medium">{f.name}</span>
                <span className="font-mono text-xs text-[color:var(--fg-muted)]">
                  {f.point_count} pts ·{" "}
                  {new Date(f.start_date).toLocaleString(undefined, {
                    year: "2-digit",
                    month: "short",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <button
                  onClick={() => removeFile(f.uid)}
                  className="text-[color:var(--fg-muted)] hover:text-red-500"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileError && (
          <p className="mt-2 text-xs text-red-500">{fileError}</p>
        )}
      </section>

      <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <h3 className="mr-2 font-semibold tracking-tight">Strava rides</h3>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[color:var(--fg-muted)]">From</span>
            <input
              type="date"
              value={after}
              onChange={(e) => setAfter(e.target.value)}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[color:var(--fg-muted)]">To</span>
            <input
              type="date"
              value={before}
              onChange={(e) => setBefore(e.target.value)}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-strava px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-strava/30 transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {loading ? "Loading…" : "Reload"}
          </button>
          {loadError && (
            <span className="text-sm text-red-500">{loadError}</span>
          )}
          <span className="ml-auto text-sm text-[color:var(--fg-muted)]">
            <span className="font-semibold text-[color:var(--fg)]">
              {activities.length}
            </span>{" "}
            rides ·{" "}
            <span className="font-semibold text-[color:var(--fg)]">
              {selectedIds.size}
            </span>{" "}
            selected
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[color:var(--border)]">
          <table className="min-w-full text-sm">
            <thead className="border-b border-[color:var(--border)]">
              <tr className="text-left text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
                <th className="p-2.5 w-8"></th>
                <th className="p-2.5 font-medium">Date</th>
                <th className="p-2.5 font-medium">Name</th>
                <th className="p-2.5 font-medium">Sport</th>
                <th className="p-2.5 font-medium">Distance</th>
                <th className="p-2.5 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => toggle(a.id)}
                  className={`cursor-pointer border-b border-[color:var(--border)] transition-colors hover:bg-[color:var(--row-hover)] ${
                    selectedIds.has(a.id) ? "bg-strava/5" : ""
                  }`}
                >
                  <td className="p-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggle(a.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-strava"
                    />
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-[color:var(--fg-muted)]">
                    {a.start_date_local.slice(0, 10)}{" "}
                    <span className="text-[color:var(--fg-muted)]/70">
                      {a.start_date_local.slice(11, 16)}
                    </span>
                  </td>
                  <td className="p-2.5">{a.name}</td>
                  <td className="p-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--row-hover)] px-2 py-0.5 text-xs">
                      <Bike className="h-3 w-3" /> {a.sport_type}
                    </span>
                  </td>
                  <td className="p-2.5 whitespace-nowrap font-mono text-xs">
                    {(a.distance / 1000).toFixed(1)} km
                  </td>
                  <td className="p-2.5 whitespace-nowrap font-mono text-xs text-[color:var(--fg-muted)]">
                    {formatDuration(a.moving_time)}
                  </td>
                </tr>
              ))}
              {!loading && activities.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-[color:var(--fg-muted)]"
                  >
                    No rides in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
              {sources.map((s, i) => (
                <li key={s.key} className="flex items-center gap-2">
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
                </li>
              ))}
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <OutputCard
                checked={output === "strava"}
                onClick={() => setOutput("strava")}
                icon={<Cloud className="h-4 w-4" />}
                title="Upload to Strava"
                subtitle="Creates a new activity on your account"
              />
              <OutputCard
                checked={output === "download"}
                onClick={() => setOutput("download")}
                icon={<Download className="h-4 w-4" />}
                title="Download merged GPX"
                subtitle="Saves the .gpx file locally, no upload"
              />
            </div>
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
                  : "Merge & download"}
            </button>

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
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
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
    const res = await fetch(`/api/uploads/${id}`);
    const data = await res.json().catch(() => ({}));
    if (data.error) throw new Error(data.error);
    if (data.activity_id) return data.activity_id;
  }
  throw new Error("Upload still processing after 2 min — check Strava manually.");
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

function triggerDownload(text: string, filename: string) {
  const blob = new Blob([text], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function estimateDistanceKm(pts: Array<[number, number]>): number {
  if (pts.length < 2) return 0;
  const R = 6371;
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    const [lat1, lng1] = pts[i - 1];
    const [lat2, lng2] = pts[i];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    d += 2 * R * Math.asin(Math.sqrt(a));
  }
  return d;
}
