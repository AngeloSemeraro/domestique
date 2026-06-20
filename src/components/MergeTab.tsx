"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bike,
  Check,
  ExternalLink,
  GitMerge,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { StravaActivity } from "@/lib/strava";
import { buildMergedGpx, type Streams } from "@/lib/gpx";

const RIDE_SPORTS = new Set([
  "Ride",
  "MountainBikeRide",
  "GravelRide",
  "EBikeRide",
  "EMountainBikeRide",
  "VirtualRide",
]);

type Step =
  | { kind: "idle" }
  | { kind: "fetching"; done: number; total: number }
  | { kind: "uploading" }
  | { kind: "processing"; uploadId: number }
  | { kind: "done"; activityId: number }
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
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [step, setStep] = useState<Step>({ kind: "idle" });

  async function load() {
    setLoading(true);
    setLoadError(null);
    setActivities([]);
    setSelected(new Set());
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

  const selectedActivities = useMemo(
    () =>
      activities
        .filter((a) => selected.has(a.id))
        .sort((a, b) => +new Date(a.start_date) - +new Date(b.start_date)),
    [activities, selected]
  );

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    if (next.size >= 2 && !name) {
      const sel = activities
        .filter((a) => next.has(a.id))
        .sort((x, y) => +new Date(x.start_date) - +new Date(y.start_date));
      setName(`Merged: ${sel[0]?.name ?? "ride"} + ${next.size - 1} more`);
    }
  }

  async function runMerge() {
    if (selectedActivities.length < 2) return;
    if (!name.trim()) {
      alert("Give the merged activity a name.");
      return;
    }
    setStep({ kind: "fetching", done: 0, total: selectedActivities.length });

    const fetched: Array<{
      id: number;
      name: string;
      start_date: string;
      streams: Streams;
    }> = [];

    try {
      for (let i = 0; i < selectedActivities.length; i++) {
        const a = selectedActivities[i];
        const res = await fetch(`/api/streams/${a.id}`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(`Streams for ${a.name}: ${e.error ?? res.status}`);
        }
        const streams = (await res.json()) as Streams;
        if (!streams.latlng?.data?.length) {
          throw new Error(
            `"${a.name}" has no GPS track (indoor / manual?) — can't merge.`
          );
        }
        fetched.push({
          id: a.id,
          name: a.name,
          start_date: a.start_date,
          streams,
        });
        setStep({
          kind: "fetching",
          done: i + 1,
          total: selectedActivities.length,
        });
        await new Promise((r) => setTimeout(r, 200));
      }

      const gpx = buildMergedGpx(fetched, name);

      setStep({ kind: "uploading" });
      const up = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpx,
          name,
          description:
            description ||
            `Merged from: ${fetched.map((f) => f.name).join(", ")}`,
          external_id: `sbe-merge-${Date.now()}`,
        }),
      });
      const upData = await up.json();
      if (!up.ok) {
        throw new Error(upData.error ?? `Upload failed (${up.status})`);
      }

      setStep({ kind: "processing", uploadId: upData.id });
      const activityId = await pollUpload(upData.id);
      setStep({ kind: "done", activityId });
    } catch (e) {
      setStep({
        kind: "error",
        message: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  function reset() {
    setStep({ kind: "idle" });
    setSelected(new Set());
    setName("");
    setDescription("");
  }

  const busy = step.kind !== "idle" && step.kind !== "done" && step.kind !== "error";

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
              Combine 2+ rides into a single new activity (uploaded as a
              merged GPX).
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-600 dark:text-blue-300">
          <div className="flex gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <p>
              Strava doesn&apos;t expose a delete API, so the original rides
              stay on your profile. Hide them with the Batch edit tab
              (Hide&nbsp;from&nbsp;feed) or delete them by hand on{" "}
              <a
                href="https://www.strava.com/athlete/training"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                strava.com
              </a>
              . Only rides with a GPS track can be merged (no indoor / manual).
            </p>
          </div>
        </div>
      </section>

      <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end gap-3">
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
            className="group inline-flex items-center gap-2 rounded-full bg-strava px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-strava/30 transition-all hover:scale-[1.02] disabled:opacity-50"
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
            rides · <span className="font-semibold text-[color:var(--fg)]">
              {selected.size}
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
                    selected.has(a.id) ? "bg-strava/5" : ""
                  }`}
                >
                  <td className="p-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
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

      {selected.size >= 2 && (
        <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 md:p-5 shadow-sm">
          <h3 className="mb-3 font-semibold tracking-tight">
            Merge {selected.size} rides
          </h3>

          <div className="mb-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] p-3 text-sm">
            <p className="mb-1 text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
              Order (by start time)
            </p>
            <ol className="space-y-1">
              {selectedActivities.map((a, i) => (
                <li key={a.id} className="flex gap-2">
                  <span className="text-[color:var(--fg-muted)]">{i + 1}.</span>
                  <span className="font-mono text-xs text-[color:var(--fg-muted)]">
                    {a.start_date_local.slice(0, 16).replace("T", " ")}
                  </span>
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="font-mono text-xs text-[color:var(--fg-muted)]">
                    {(a.distance / 1000).toFixed(1)} km
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-[color:var(--fg-muted)]">
              Total ≈{" "}
              {(
                selectedActivities.reduce((s, a) => s + a.distance, 0) / 1000
              ).toFixed(1)}{" "}
              km ·{" "}
              {formatDuration(
                selectedActivities.reduce((s, a) => s + a.moving_time, 0)
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
                Description (optional)
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 text-sm"
                placeholder="Auto-generated from source ride names if blank"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={runMerge}
              disabled={busy || selected.size < 2}
              className="group inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all hover:scale-[1.02] disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {busy ? "Working…" : `Merge & upload`}
            </button>

            <StepStatus step={step} />

            {(step.kind === "done" || step.kind === "error") && (
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

function StepStatus({ step }: { step: Step }) {
  if (step.kind === "idle") return null;
  if (step.kind === "fetching") {
    return (
      <span className="text-sm text-[color:var(--fg-muted)]">
        Fetching GPS tracks {step.done}/{step.total}…
      </span>
    );
  }
  if (step.kind === "uploading") {
    return (
      <span className="text-sm text-[color:var(--fg-muted)]">
        Uploading merged GPX…
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
  if (step.kind === "done") {
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
    if (data.error) {
      throw new Error(data.error);
    }
    if (data.activity_id) {
      return data.activity_id;
    }
  }
  throw new Error("Upload still processing after 2 min — check Strava manually.");
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
