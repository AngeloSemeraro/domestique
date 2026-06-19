"use client";

import { useEffect, useMemo, useState } from "react";
import type { StravaActivity, StravaGear } from "@/lib/strava";

const SPORT_TYPES = [
  "AlpineSki", "BackcountrySki", "Badminton", "Canoeing", "Crossfit",
  "EBikeRide", "Elliptical", "EMountainBikeRide", "Golf", "GravelRide",
  "Handcycle", "HighIntensityIntervalTraining", "Hike", "IceSkate",
  "InlineSkate", "Kayaking", "Kitesurf", "MountainBikeRide", "NordicSki",
  "Pickleball", "Pilates", "Racquetball", "Ride", "RockClimbing",
  "RollerSki", "Rowing", "Run", "Sail", "Skateboard", "Snowboard",
  "Snowshoe", "Soccer", "Squash", "StairStepper", "StandUpPaddling",
  "Surfing", "Swim", "TableTennis", "Tennis", "TrailRun", "Velomobile",
  "VirtualRide", "VirtualRow", "VirtualRun", "Walk", "WeightTraining",
  "Wheelchair", "Windsurf", "Workout", "Yoga",
];

type Filters = {
  after: string;
  before: string;
  sportType: string;
  nameQuery: string;
  location: string;
};

type Update = {
  sport_type?: string;
  gear_id?: string;
  hide_from_home?: boolean;
  trainer?: boolean;
};

type BatchProgress = {
  total: number;
  done: number;
  errors: Array<{ id: number; error: string }>;
};

export default function Editor({
  athleteName,
  bikes,
}: {
  athleteName: string;
  bikes: StravaGear[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  const [filters, setFilters] = useState<Filters>({
    after: monthAgo,
    before: today,
    sportType: "",
    nameQuery: "",
    location: "",
  });
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [update, setUpdate] = useState<Update>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);

  async function loadActivities() {
    setLoading(true);
    setLoadError(null);
    setActivities([]);
    setSelected(new Set());
    try {
      const afterTs = filters.after
        ? Math.floor(new Date(filters.after).getTime() / 1000)
        : undefined;
      const beforeTs = filters.before
        ? Math.floor(
            (new Date(filters.before).getTime() + 86400 * 1000) / 1000
          )
        : undefined;
      const all: StravaActivity[] = [];
      let page = 1;
      while (page <= 5) {
        const qs = new URLSearchParams();
        if (afterTs) qs.set("after", String(afterTs));
        if (beforeTs) qs.set("before", String(beforeTs));
        qs.set("page", String(page));
        const res = await fetch(`/api/activities?${qs.toString()}`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!data.activities?.length) break;
        all.push(...data.activities);
        if (data.activities.length < 100) break;
        page++;
      }
      setActivities(all);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "unknown");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (filters.sportType && a.sport_type !== filters.sportType) return false;
      if (
        filters.nameQuery &&
        !a.name.toLowerCase().includes(filters.nameQuery.toLowerCase())
      )
        return false;
      if (filters.location) {
        const q = filters.location.toLowerCase();
        const loc = [a.location_city, a.location_state, a.location_country]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!loc.includes(q)) return false;
      }
      return true;
    });
  }, [activities, filters]);

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((a) => a.id)));
    }
  }

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function runBatch() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (Object.keys(update).length === 0) {
      alert("Select at least one field to update.");
      return;
    }
    if (
      !confirm(
        `Apply changes to ${ids.length} activities? This cannot be undone in bulk.`
      )
    )
      return;
    setRunning(true);
    setProgress({ total: ids.length, done: 0, errors: [] });
    const CHUNK = 5;
    let done = 0;
    const errors: BatchProgress["errors"] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const res = await fetch("/api/activities/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: slice, update }),
      });
      const data = await res.json();
      for (const r of data.results ?? []) {
        done++;
        if (!r.ok) errors.push({ id: r.id, error: r.error });
      }
      setProgress({ total: ids.length, done, errors: [...errors] });
    }
    setRunning(false);
    setActivities((prev) =>
      prev.map((a) =>
        selected.has(a.id) && !errors.find((e) => e.id === a.id)
          ? { ...a, ...update }
          : a
      )
    );
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/";
  }

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Strava Batch Editor{" "}
          <span className="text-base font-normal text-neutral-400">
            — {athleteName}
          </span>
        </h1>
        <button
          onClick={logout}
          className="rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-800"
        >
          Logout
        </button>
      </header>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-3 font-semibold">Filters</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="flex flex-col text-sm">
            <span className="text-neutral-400">From</span>
            <input
              type="date"
              value={filters.after}
              onChange={(e) => setFilters({ ...filters, after: e.target.value })}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="text-neutral-400">To</span>
            <input
              type="date"
              value={filters.before}
              onChange={(e) => setFilters({ ...filters, before: e.target.value })}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="text-neutral-400">Sport type</span>
            <select
              value={filters.sportType}
              onChange={(e) =>
                setFilters({ ...filters, sportType: e.target.value })
              }
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
            >
              <option value="">All</option>
              {SPORT_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="text-neutral-400">Name contains</span>
            <input
              type="text"
              value={filters.nameQuery}
              onChange={(e) =>
                setFilters({ ...filters, nameQuery: e.target.value })
              }
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="text-neutral-400">Location contains</span>
            <input
              type="text"
              placeholder="city / state / country"
              value={filters.location}
              onChange={(e) =>
                setFilters({ ...filters, location: e.target.value })
              }
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={loadActivities}
            disabled={loading}
            className="rounded bg-strava px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Reload"}
          </button>
          {loadError && (
            <span className="text-sm text-red-400">{loadError}</span>
          )}
          <span className="text-sm text-neutral-400">
            {filtered.length} match · {selected.size} selected
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-3 font-semibold">Batch edit</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="flex flex-col text-sm">
            <span className="text-neutral-400">Set sport type</span>
            <select
              value={update.sport_type ?? ""}
              onChange={(e) =>
                setUpdate({
                  ...update,
                  sport_type: e.target.value || undefined,
                })
              }
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
            >
              <option value="">— don't change —</option>
              {SPORT_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="text-neutral-400">Set gear (bike)</span>
            <select
              value={update.gear_id ?? ""}
              onChange={(e) =>
                setUpdate({ ...update, gear_id: e.target.value || undefined })
              }
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
            >
              <option value="">— don't change —</option>
              {bikes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.primary ? " ★" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="text-neutral-400">Hide from feed</span>
            <select
              value={
                update.hide_from_home === undefined
                  ? ""
                  : update.hide_from_home
                    ? "true"
                    : "false"
              }
              onChange={(e) =>
                setUpdate({
                  ...update,
                  hide_from_home:
                    e.target.value === "" ? undefined : e.target.value === "true",
                })
              }
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
            >
              <option value="">— don't change —</option>
              <option value="true">Hide</option>
              <option value="false">Show</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="text-neutral-400">Trainer (indoor)</span>
            <select
              value={
                update.trainer === undefined
                  ? ""
                  : update.trainer
                    ? "true"
                    : "false"
              }
              onChange={(e) =>
                setUpdate({
                  ...update,
                  trainer:
                    e.target.value === "" ? undefined : e.target.value === "true",
                })
              }
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
            >
              <option value="">— don't change —</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={runBatch}
            disabled={running || selected.size === 0}
            className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {running
              ? `Applying… ${progress?.done}/${progress?.total}`
              : `Apply to ${selected.size} activities`}
          </button>
          {progress && !running && (
            <span className="text-sm text-neutral-400">
              Done: {progress.done - progress.errors.length} · Errors:{" "}
              {progress.errors.length}
            </span>
          )}
        </div>
        {progress && progress.errors.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-red-400">
              {progress.errors.length} errors
            </summary>
            <ul className="mt-1 space-y-1 text-xs text-red-300">
              {progress.errors.map((e) => (
                <li key={e.id}>
                  #{e.id}: {e.error}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-900 text-left">
            <tr>
              <th className="p-2">
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 && selected.size === filtered.length
                  }
                  onChange={toggleAll}
                />
              </th>
              <th className="p-2">Date</th>
              <th className="p-2">Name</th>
              <th className="p-2">Sport</th>
              <th className="p-2">Distance</th>
              <th className="p-2">Location</th>
              <th className="p-2">Gear</th>
              <th className="p-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr
                key={a.id}
                className={`border-t border-neutral-800 ${
                  selected.has(a.id) ? "bg-strava/10" : ""
                }`}
              >
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggle(a.id)}
                  />
                </td>
                <td className="p-2 whitespace-nowrap text-neutral-400">
                  {a.start_date_local.slice(0, 10)}
                </td>
                <td className="p-2">
                  <a
                    href={`https://www.strava.com/activities/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {a.name}
                  </a>
                </td>
                <td className="p-2">{a.sport_type}</td>
                <td className="p-2 whitespace-nowrap">
                  {(a.distance / 1000).toFixed(1)} km
                </td>
                <td className="p-2 text-neutral-400">
                  {[a.location_city, a.location_state, a.location_country]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td className="p-2 text-neutral-400">
                  {bikes.find((b) => b.id === a.gear_id)?.name ??
                    a.gear_id ??
                    "—"}
                </td>
                <td className="p-2 text-xs text-neutral-400">
                  {a.trainer ? "trainer " : ""}
                  {a.commute ? "commute " : ""}
                  {a.hide_from_home ? "hidden" : ""}
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-neutral-500">
                  No activities. Try widening the date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
