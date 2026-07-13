"use client";

/**
 * Shared "activity sources" box: one card with two tabs — Strava rides and
 * local .gpx/.fit files — used by all three app tabs:
 *
 * - Batch edit composes `SourceTabs` + its own rich Strava table +
 *   `LocalFilesPanel` (local files join the export flows).
 * - Merge rides and Inspector use the combined `ActivitySourceBox`
 *   (multi-select for merging, single-pick for inspecting).
 */

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Bike,
  FileUp,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import type { StravaActivity } from "@/lib/strava";
import { parseTrackFile, type ParsedTrack } from "@/lib/file-parsers";

export type LocalFile = ParsedTrack & { uid: string; filename: string };

export type SourcePick =
  | { kind: "strava"; activity: StravaActivity }
  | { kind: "file"; file: LocalFile };

/** Parse a FileList into LocalFile entries; returns parse errors per file. */
export async function parseLocalFiles(
  picked: FileList | File[] | null
): Promise<{ files: LocalFile[]; errors: string[] }> {
  const files: LocalFile[] = [];
  const errors: string[] = [];
  for (const f of Array.from(picked ?? [])) {
    try {
      const parsed = await parseTrackFile(f);
      files.push({
        uid: `${f.name}-${f.size}-${f.lastModified}`,
        filename: f.name,
        ...parsed,
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `parse error: ${f.name}`);
    }
  }
  return { files, errors };
}

/* ------------------------------------------------------------------ */
/* Tab header                                                          */
/* ------------------------------------------------------------------ */

export function SourceTabs({
  active,
  onChange,
  stravaCount,
  fileCount,
}: {
  active: "strava" | "files";
  onChange: (t: "strava" | "files") => void;
  stravaCount?: number;
  fileCount?: number;
}) {
  const tab = (id: "strava" | "files", label: string, count?: number) => (
    <button
      type="button"
      onClick={() => onChange(id)}
      className={`relative inline-flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
        active === id
          ? "text-strava"
          : "text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
            active === id
              ? "bg-strava/10 text-strava"
              : "bg-[color:var(--row-hover)] text-[color:var(--fg-muted)]"
          }`}
        >
          {count}
        </span>
      )}
      <span
        className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-strava transition-transform ${
          active === id ? "scale-x-100" : "scale-x-0"
        }`}
      />
    </button>
  );
  return (
    <div className="mb-3 flex items-center gap-1 border-b border-[color:var(--border)]">
      {tab("strava", "Strava rides", stravaCount)}
      {tab("files", "Local files", fileCount)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local files panel                                                   */
/* ------------------------------------------------------------------ */

export function LocalFilesPanel({
  files,
  onAdd,
  onRemove,
  mode,
  selectedUids,
  onToggle,
  onPick,
}: {
  files: LocalFile[];
  onAdd: (files: LocalFile[], errors: string[]) => void;
  onRemove: (uid: string) => void;
  /** multi = checkbox selection; single = click a row to pick it. */
  mode: "multi" | "single";
  selectedUids?: Set<string>;
  onToggle?: (uid: string) => void;
  onPick?: (f: LocalFile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setBusy(true);
    setError(null);
    const { files: parsed, errors } = await parseLocalFiles(picked);
    if (errors.length) setError(errors.join(" · "));
    onAdd(parsed, errors);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handle(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-6 transition-colors ${
          dragOver
            ? "border-strava bg-strava/5 text-strava"
            : "border-[color:var(--border)] hover:border-strava hover:text-strava"
        }`}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FileUp className="h-5 w-5" />
        )}
        <span className="text-sm font-medium">
          {dragOver ? "Drop to load" : "Drop or click to add .gpx / .fit files"}
        </span>
        <span className="text-xs text-[color:var(--fg-muted)]">
          Parsed entirely in your browser; nothing is uploaded yet.
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,.fit"
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f) => {
            const selected = selectedUids?.has(f.uid) ?? false;
            return (
              <li
                key={f.uid}
                onClick={() => {
                  if (mode === "single") onPick?.(f);
                  else onToggle?.(f.uid);
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-[color:var(--row-hover)] ${
                  selected
                    ? "border-strava/50 bg-strava/5"
                    : "border-[color:var(--border)] bg-[color:var(--bg-input)]"
                }`}
              >
                {mode === "multi" && onToggle && (
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggle(f.uid)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-strava"
                  />
                )}
                <FileUp className="h-3.5 w-3.5 flex-shrink-0 text-[color:var(--fg-muted)]" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {f.name}
                  <span className="ml-2 text-xs font-normal text-[color:var(--fg-muted)]">
                    {f.filename}
                  </span>
                </span>
                <span className="whitespace-nowrap font-mono text-xs text-[color:var(--fg-muted)]">
                  {f.point_count} pts ·{" "}
                  {new Date(f.start_date).toLocaleDateString(undefined, {
                    year: "2-digit",
                    month: "short",
                    day: "2-digit",
                  })}
                  {f.has_time === false ? " · no time" : ""}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(f.uid);
                  }}
                  className="text-[color:var(--fg-muted)] hover:text-red-500"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compact Strava picker                                               */
/* ------------------------------------------------------------------ */

const PRESETS: Array<{ label: string; days: number | "ytd" }> = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 180 },
  { label: "1y", days: 365 },
  { label: "YTD", days: "ytd" },
];

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function StravaPickList({
  mode,
  filter,
  selectedIds,
  onToggle,
  onPick,
  emptyHint,
}: {
  mode: "multi" | "single";
  /** Optional predicate to restrict listed activities (e.g. rides only). */
  filter?: (a: StravaActivity) => boolean;
  selectedIds?: Set<number>;
  onToggle?: (a: StravaActivity) => void;
  onPick?: (a: StravaActivity) => void;
  emptyHint?: string;
}) {
  const [after, setAfter] = useState(isoDay(new Date(Date.now() - 90 * 86400 * 1000)));
  const [before, setBefore] = useState(isoDay(new Date()));
  const [preset, setPreset] = useState<string | null>("90d");
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function load(afterStr = after, beforeStr = before) {
    setLoading(true);
    setError(null);
    try {
      const afterTs = Math.floor(new Date(afterStr).getTime() / 1000);
      const beforeTs = Math.floor(
        (new Date(beforeStr).getTime() + 86400 * 1000) / 1000
      );
      const all: StravaActivity[] = [];
      let page = 1;
      while (page <= 5) {
        const qs = new URLSearchParams({
          after: String(afterTs),
          before: String(beforeTs),
          page: String(page),
        });
        const res = await apiFetch(`/api/activities?${qs.toString()}`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(String(e.error ?? `HTTP ${res.status}`));
        }
        const data = await res.json();
        if (!data.activities?.length) break;
        all.push(...data.activities);
        if (data.activities.length < 100) break;
        page++;
      }
      setActivities(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(p: (typeof PRESETS)[number]) {
    const now = new Date();
    const a =
      p.days === "ytd"
        ? new Date(now.getFullYear(), 0, 1)
        : new Date(Date.now() - p.days * 86400 * 1000);
    setPreset(p.label);
    setAfter(isoDay(a));
    setBefore(isoDay(now));
    load(isoDay(a), isoDay(now));
  }

  const shown = activities.filter((a) => {
    if (filter && !filter(a)) return false;
    if (query && !a.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all hover:scale-105 ${
              preset === p.label
                ? "border-strava text-strava"
                : "border-[color:var(--border)] text-[color:var(--fg-muted)] hover:border-[color:var(--fg-muted)]"
            }`}
          >
            {p.label}
          </button>
        ))}
        <input
          type="date"
          value={after}
          onChange={(e) => {
            setPreset(null);
            setAfter(e.target.value);
          }}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2 py-1 text-xs"
        />
        <span className="text-xs text-[color:var(--fg-muted)]">→</span>
        <input
          type="date"
          value={before}
          onChange={(e) => {
            setPreset(null);
            setBefore(e.target.value);
          }}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2 py-1 text-xs"
        />
        <button
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full bg-strava px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-strava/30 transition-all hover:scale-[1.02] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Reload
        </button>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[color:var(--fg-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter by name"
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] py-1 pl-7 pr-2 text-xs"
          />
        </div>
      </div>
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      <div className="max-h-72 overflow-y-auto rounded-xl border border-[color:var(--border)]">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 border-b border-[color:var(--border)] bg-[color:var(--bg-elev)]">
            <tr className="text-left text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
              <th className="w-8 p-2.5">
                {mode === "multi" && onToggle && (
                  <input
                    type="checkbox"
                    checked={shown.length > 0 && shown.every((a) => selectedIds?.has(a.id))}
                    onChange={() => {
                      const allSel = shown.every((a) => selectedIds?.has(a.id));
                      for (const a of shown) {
                        const sel = selectedIds?.has(a.id) ?? false;
                        if (allSel ? sel : !sel) onToggle(a);
                      }
                    }}
                    className="accent-strava"
                  />
                )}
              </th>
              <th className="p-2.5 font-medium">Date</th>
              <th className="p-2.5 font-medium">Name</th>
              <th className="p-2.5 font-medium">Sport</th>
              <th className="p-2.5 font-medium">Distance</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => {
              const selected = selectedIds?.has(a.id) ?? false;
              return (
                <tr
                  key={a.id}
                  onClick={() => (mode === "single" ? onPick?.(a) : onToggle?.(a))}
                  className={`cursor-pointer border-b border-[color:var(--border)] transition-colors hover:bg-[color:var(--row-hover)] ${
                    selected ? "bg-strava/5" : ""
                  }`}
                >
                  <td className="p-2.5">
                    {mode === "multi" ? (
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggle?.(a)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-strava"
                      />
                    ) : (
                      <Bike className="h-3.5 w-3.5 text-[color:var(--fg-muted)]" />
                    )}
                  </td>
                  <td className="whitespace-nowrap p-2.5 text-[color:var(--fg-muted)]">
                    {a.start_date_local.slice(0, 10)}
                  </td>
                  <td className="p-2.5">{a.name}</td>
                  <td className="p-2.5">
                    <span className="rounded-full bg-[color:var(--row-hover)] px-2 py-0.5 text-xs">
                      {a.sport_type}
                    </span>
                  </td>
                  <td className="whitespace-nowrap p-2.5 font-mono text-xs">
                    {(a.distance / 1000).toFixed(1)} km
                  </td>
                </tr>
              );
            })}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-[color:var(--fg-muted)]">
                  {emptyHint ?? "No activities in this range."}
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="p-8 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-strava" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Combined box (Merge + Inspector)                                    */
/* ------------------------------------------------------------------ */

export function ActivitySourceBox({
  mode,
  stravaFilter,
  selectedActivityIds,
  onToggleActivity,
  files,
  onFilesAdded,
  onFileRemoved,
  onPick,
  emptyHint,
}: {
  mode: "multi" | "single";
  stravaFilter?: (a: StravaActivity) => boolean;
  selectedActivityIds?: Set<number>;
  onToggleActivity?: (a: StravaActivity) => void;
  files: LocalFile[];
  onFilesAdded: (files: LocalFile[]) => void;
  onFileRemoved: (uid: string) => void;
  /** Single mode: called when the user picks a source. */
  onPick?: (pick: SourcePick) => void;
  emptyHint?: string;
}) {
  const [tab, setTab] = useState<"strava" | "files">("strava");
  return (
    <div>
      <SourceTabs
        active={tab}
        onChange={setTab}
        stravaCount={selectedActivityIds?.size}
        fileCount={files.length}
      />
      {tab === "strava" ? (
        <StravaPickList
          mode={mode}
          filter={stravaFilter}
          selectedIds={selectedActivityIds}
          onToggle={onToggleActivity}
          onPick={(a) => onPick?.({ kind: "strava", activity: a })}
          emptyHint={emptyHint}
        />
      ) : (
        <LocalFilesPanel
          mode={mode}
          files={files}
          onAdd={(fs) => onFilesAdded(fs)}
          onRemove={onFileRemoved}
          onPick={(f) => onPick?.({ kind: "file", file: f })}
        />
      )}
    </div>
  );
}
