"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bike,
  Calendar,
  Check,
  ChevronDown,
  Edit3,
  EyeOff,
  Filter as FilterIcon,
  Loader2,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  Wand2,
} from "lucide-react";
import type { StravaActivity, StravaGear } from "@/lib/strava";
import { countryFromTimezone, ianaFromStravaTz } from "@/lib/timezone-country";
import DatePickerPopover from "./DatePickerPopover";

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
  showAll: boolean;
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

const PRESETS: { label: string; days: number | "ytd" | "all" }[] = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
  { label: "1y", days: 365 },
  { label: "YTD", days: "ytd" },
  { label: "All", days: "all" },
];

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function Editor({
  athleteName,
  bikes,
}: {
  athleteName: string;
  bikes: StravaGear[];
}) {
  const today = isoDay(new Date());
  const monthAgo = isoDay(new Date(Date.now() - 30 * 86400 * 1000));

  const [filters, setFilters] = useState<Filters>({
    after: monthAgo,
    before: today,
    showAll: false,
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

  function applyPreset(p: (typeof PRESETS)[number]) {
    const now = new Date();
    if (p.days === "all") {
      setFilters((f) => ({ ...f, showAll: true }));
      return;
    }
    let after: Date;
    if (p.days === "ytd") {
      after = new Date(now.getFullYear(), 0, 1);
    } else {
      after = new Date(Date.now() - p.days * 86400 * 1000);
    }
    setFilters((f) => ({
      ...f,
      showAll: false,
      after: isoDay(after),
      before: isoDay(now),
    }));
  }

  async function loadActivities() {
    setLoading(true);
    setLoadError(null);
    setActivities([]);
    setSelected(new Set());
    try {
      const afterTs = filters.showAll
        ? undefined
        : filters.after
          ? Math.floor(new Date(filters.after).getTime() / 1000)
          : undefined;
      const beforeTs = filters.showAll
        ? undefined
        : filters.before
          ? Math.floor(
              (new Date(filters.before).getTime() + 86400 * 1000) / 1000
            )
          : undefined;
      const maxPages = filters.showAll ? 20 : 5;
      const all: StravaActivity[] = [];
      let page = 1;
      while (page <= maxPages) {
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
        const loc = [
          a.location_city,
          a.location_state,
          a.location_country,
          ianaFromStravaTz(a.timezone),
          countryFromTimezone(a.timezone),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .replace(/_/g, " ");
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

  const updateCount = Object.values(update).filter((v) => v !== undefined).length;
  const progressPct = progress
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="animate-fade-in flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-strava text-white shadow-md shadow-strava/30">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Strava Batch Editor
            </h1>
            <p className="text-xs text-[color:var(--fg-muted)]">
              {athleteName}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[color:var(--row-hover)]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </header>

      <Card>
        <SectionHeader icon={<FilterIcon className="h-4 w-4" />} title="Filters" />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
            Quick range
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-all hover:scale-105 active:scale-95 ${
                (p.days === "all" && filters.showAll) ||
                (p.days !== "all" && !filters.showAll)
                  ? "border-strava/40"
                  : "border-[color:var(--border)]"
              } hover:border-strava hover:text-strava`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Field icon={<Calendar className="h-3.5 w-3.5" />} label="From">
            <DatePickerPopover
              value={filters.after}
              onChange={(v) => setFilters({ ...filters, after: v })}
              disabled={filters.showAll}
              label="From date"
            />
          </Field>
          <Field icon={<Calendar className="h-3.5 w-3.5" />} label="To">
            <DatePickerPopover
              value={filters.before}
              onChange={(v) => setFilters({ ...filters, before: v })}
              disabled={filters.showAll}
              label="To date"
            />
          </Field>
          <Field icon={<Activity className="h-3.5 w-3.5" />} label="Sport type">
            <SelectNative
              value={filters.sportType}
              onChange={(v) => setFilters({ ...filters, sportType: v })}
            >
              <option value="">All sports</option>
              {SPORT_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field icon={<Search className="h-3.5 w-3.5" />} label="Name contains">
            <input
              type="text"
              value={filters.nameQuery}
              onChange={(e) =>
                setFilters({ ...filters, nameQuery: e.target.value })
              }
              className={inputClass}
              placeholder="morning, race…"
            />
          </Field>
          <Field icon={<MapPin className="h-3.5 w-3.5" />} label="Location">
            <input
              type="text"
              value={filters.location}
              onChange={(e) =>
                setFilters({ ...filters, location: e.target.value })
              }
              className={inputClass}
              placeholder="italy, rome, paris…"
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={loadActivities}
            disabled={loading}
            className="group inline-flex items-center gap-2 rounded-full bg-strava px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-strava/30 transition-all hover:scale-[1.02] hover:bg-orange-600 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" />
            )}
            {loading ? "Loading…" : "Reload"}
          </button>
          {loadError && (
            <span className="text-sm text-red-500">{loadError}</span>
          )}
          <div className="ml-auto text-sm text-[color:var(--fg-muted)]">
            <span className="font-semibold text-[color:var(--fg)]">
              {filtered.length}
            </span>{" "}
            match ·{" "}
            <span className="font-semibold text-[color:var(--fg)]">
              {selected.size}
            </span>{" "}
            selected
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader
          icon={<Edit3 className="h-4 w-4" />}
          title="Batch edit"
          badge={updateCount > 0 ? `${updateCount} field${updateCount > 1 ? "s" : ""}` : undefined}
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field icon={<Activity className="h-3.5 w-3.5" />} label="Sport type">
            <SelectNative
              value={update.sport_type ?? ""}
              onChange={(v) =>
                setUpdate({ ...update, sport_type: v || undefined })
              }
            >
              <option value="">— don't change —</option>
              {SPORT_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field icon={<Bike className="h-3.5 w-3.5" />} label="Gear (bike)">
            <SelectNative
              value={update.gear_id ?? ""}
              onChange={(v) =>
                setUpdate({ ...update, gear_id: v || undefined })
              }
            >
              <option value="">— don't change —</option>
              {bikes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.primary ? " ★" : ""}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field icon={<EyeOff className="h-3.5 w-3.5" />} label="Hide from feed">
            <SelectNative
              value={
                update.hide_from_home === undefined
                  ? ""
                  : update.hide_from_home
                    ? "true"
                    : "false"
              }
              onChange={(v) =>
                setUpdate({
                  ...update,
                  hide_from_home: v === "" ? undefined : v === "true",
                })
              }
            >
              <option value="">— don't change —</option>
              <option value="true">Hide</option>
              <option value="false">Show</option>
            </SelectNative>
          </Field>
          <Field icon={<Wand2 className="h-3.5 w-3.5" />} label="Trainer (indoor)">
            <SelectNative
              value={
                update.trainer === undefined
                  ? ""
                  : update.trainer
                    ? "true"
                    : "false"
              }
              onChange={(v) =>
                setUpdate({
                  ...update,
                  trainer: v === "" ? undefined : v === "true",
                })
              }
            >
              <option value="">— don't change —</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </SelectNative>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={runBatch}
            disabled={running || selected.size === 0 || updateCount === 0}
            className="group inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition-all hover:scale-[1.02] hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {running
              ? `Applying ${progress?.done}/${progress?.total}…`
              : `Apply to ${selected.size} activit${selected.size === 1 ? "y" : "ies"}`}
          </button>
          {progress && (
            <div className="flex-1 min-w-[160px] max-w-xs">
              <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--row-hover)]">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {!running && (
                <p className="mt-1 text-xs text-[color:var(--fg-muted)]">
                  {progress.done - progress.errors.length} succeeded ·{" "}
                  {progress.errors.length} failed
                </p>
              )}
            </div>
          )}
        </div>
        {progress && progress.errors.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-red-500">
              {progress.errors.length} errors
            </summary>
            <ul className="mt-1 space-y-1 text-xs text-red-400">
              {progress.errors.map((e) => (
                <li key={e.id} className="font-mono">
                  #{e.id}: {e.error}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-[color:var(--border)] text-left">
              <tr className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
                <th className="p-3">
                  <input
                    type="checkbox"
                    checked={
                      filtered.length > 0 && selected.size === filtered.length
                    }
                    onChange={toggleAll}
                    className="accent-strava"
                  />
                </th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Sport</th>
                <th className="p-3 font-medium">Distance</th>
                <th className="p-3 font-medium">Location</th>
                <th className="p-3 font-medium">Gear</th>
                <th className="p-3 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr
                  key={a.id}
                  style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}
                  className="animate-fade-in border-b border-[color:var(--border)] transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                      className="accent-strava"
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap text-[color:var(--fg-muted)]">
                    {a.start_date_local.slice(0, 10)}
                  </td>
                  <td className="p-3">
                    <a
                      href={`https://www.strava.com/activities/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:text-strava hover:underline"
                    >
                      {a.name}
                    </a>
                  </td>
                  <td className="p-3">
                    <span className="rounded-full bg-[color:var(--row-hover)] px-2 py-0.5 text-xs">
                      {a.sport_type}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap font-mono text-xs">
                    {(a.distance / 1000).toFixed(1)} km
                  </td>
                  <td className="p-3 text-[color:var(--fg-muted)]">
                    {[a.location_city, a.location_state, a.location_country]
                      .filter(Boolean)
                      .join(", ") ||
                      (a.timezone
                        ? `${ianaFromStravaTz(a.timezone).split("/").pop()?.replace(/_/g, " ")}${
                            countryFromTimezone(a.timezone)
                              ? `, ${countryFromTimezone(a.timezone)}`
                              : ""
                          }`
                        : "—")}
                  </td>
                  <td className="p-3 text-[color:var(--fg-muted)]">
                    {bikes.find((b) => b.id === a.gear_id)?.name ??
                      a.gear_id ??
                      "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-wider">
                      {a.trainer && (
                        <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-500">
                          trainer
                        </span>
                      )}
                      {a.commute && (
                        <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-500">
                          commute
                        </span>
                      )}
                      {a.hide_from_home && (
                        <span className="rounded bg-neutral-500/15 px-1.5 py-0.5 text-neutral-500">
                          hidden
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="p-10 text-center text-[color:var(--fg-muted)]"
                  >
                    No activities. Try widening the date range or click <b>All</b>.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-strava" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}

const inputClass =
  "rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 text-sm transition-colors focus:border-strava focus:outline-none focus:ring-2 focus:ring-strava/20 disabled:opacity-50";

function Card({
  children,
  padding = true,
}: {
  children: React.ReactNode;
  padding?: boolean;
}) {
  return (
    <section
      className={`animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-sm ${
        padding ? "p-4 md:p-5" : ""
      }`}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  icon,
  title,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="text-[color:var(--fg-muted)]">{icon}</div>
      <h2 className="font-semibold tracking-tight">{title}</h2>
      {badge && (
        <span className="ml-auto rounded-full bg-strava/10 px-2 py-0.5 text-xs font-medium text-strava">
          {badge}
        </span>
      )}
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-[color:var(--fg-muted)]">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function SelectNative({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} w-full appearance-none pr-8`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--fg-muted)]" />
    </div>
  );
}
