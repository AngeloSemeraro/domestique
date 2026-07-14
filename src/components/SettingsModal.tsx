"use client";

import { useEffect, useState } from "react";
import { apiFetch, loginHref, rwgpsLoginHref } from "@/lib/api";
import {
  AlertTriangle,
  Check,
  KeyRound,
  Link2,
  Loader2,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";

type RwgpsStatus = {
  configured: boolean;
  connected: boolean;
  name: string | null;
};

export default function SettingsModal({
  athleteName,
  onClose,
}: {
  athleteName: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rwgps, setRwgps] = useState<RwgpsStatus | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    apiFetch("/api/rwgps/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRwgps(d as RwgpsStatus))
      .catch(() => {});
  }, []);

  async function disconnectRwgps() {
    setBusy("rwgps");
    await apiFetch("/api/rwgps/auth/logout", { method: "POST" }).catch(() => {});
    setRwgps((s) => (s ? { ...s, connected: false, name: null } : s));
    setBusy(null);
    setMessage("Disconnected from RideWithGPS.");
  }

  async function reauthorize() {
    if (
      !confirm(
        "You'll be logged out and sent to Strava to grant access again. Continue?"
      )
    )
      return;
    setBusy("reauth");
    await apiFetch("/api/auth/logout", { method: "POST" });
    location.href = loginHref();
  }

  async function revoke() {
    if (
      !confirm(
        "This will revoke this app's access to your Strava account. You'll have to authorize it again from scratch (Strava settings will no longer list this app). Continue?"
      )
    )
      return;
    setBusy("revoke");
    try {
      const res = await apiFetch("/api/auth/revoke", { method: "POST" });
      const data = await res.json();
      if (!data.revoked) {
        setMessage(
          `Local session cleared. Strava revoke ${data.error ? `failed (${data.error})` : "may not have completed"}. Check your Strava settings.`
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "revoke failed");
    }
    location.href = "/";
  }

  function clearGeoCache() {
    if (!confirm("Clear the local reverse-geocoding cache?")) return;
    try {
      localStorage.removeItem("sbe.geocode.v1");
      setMessage("Geocoding cache cleared.");
    } catch {
      setMessage("Couldn't clear cache (localStorage disabled?).");
    }
  }

  return (
    <div
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in w-full max-w-lg overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-3">
          <div>
            <h2 className="font-semibold tracking-tight">Preferences</h2>
            <p className="text-xs text-[color:var(--fg-muted)]">
              Signed in as {athleteName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[color:var(--fg-muted)] hover:bg-[color:var(--row-hover)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <PrefRow
            icon={<KeyRound className="h-4 w-4" />}
            title="Re-authorize with Strava"
            subtitle="Log out and re-run the OAuth flow. Useful if scopes changed or your tokens look stale."
            action={
              <button
                onClick={reauthorize}
                disabled={busy !== null}
                className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium hover:border-strava hover:text-strava disabled:opacity-50"
              >
                {busy === "reauth" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Re-authorize"
                )}
              </button>
            }
          />

          <PrefRow
            icon={<ShieldOff className="h-4 w-4 text-red-500" />}
            title="Revoke Strava access"
            subtitle="Tells Strava to forget this app entirely. You'll start fresh next time, and the app will disappear from Strava's connected apps list."
            action={
              <button
                onClick={revoke}
                disabled={busy !== null}
                className="rounded-full border border-red-500/40 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
              >
                {busy === "revoke" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Revoke"
                )}
              </button>
            }
          />

          <PrefRow
            icon={<Trash2 className="h-4 w-4" />}
            title="Clear local geocoding cache"
            subtitle="Empties the localStorage cache of reverse-geocoded locations. Useful for debugging."
            action={
              <button
                onClick={clearGeoCache}
                className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium hover:border-strava hover:text-strava"
              >
                Clear
              </button>
            }
          />

          {rwgps?.configured && (
            <div className="!mt-5 border-t border-[color:var(--border)] pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[color:var(--fg-muted)]">
                Connected services
              </p>
              {rwgps.connected ? (
                <PrefRow
                  icon={<Check className="h-4 w-4 text-sky-500" />}
                  title={`RideWithGPS — connected${rwgps.name ? ` as ${rwgps.name}` : ""}`}
                  subtitle="Upload activities to your RideWithGPS library from the Batch edit tab."
                  action={
                    <button
                      onClick={disconnectRwgps}
                      disabled={busy !== null}
                      className="rounded-full border border-red-500/40 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {busy === "rwgps" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Disconnect"
                      )}
                    </button>
                  }
                />
              ) : (
                <PrefRow
                  icon={<Link2 className="h-4 w-4 text-sky-500" />}
                  title="Connect RideWithGPS"
                  subtitle="Authorize your RideWithGPS account to upload activities to your library."
                  action={
                    <a
                      href={rwgpsLoginHref()}
                      className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold !text-white transition-colors hover:bg-sky-700"
                    >
                      <Link2 className="h-3 w-3" />
                      Connect
                    </a>
                  }
                />
              )}
            </div>
          )}

          {message && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-300">
              {message}
            </p>
          )}

          <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-input)] p-3 text-xs">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Disclaimer
            </p>
            <p className="leading-relaxed text-[color:var(--fg-muted)]">
              This software is free, open-source and provided <em>as is</em>,
              with no warranty of any kind. It talks to your Strava account on
              your behalf — back up anything irreplaceable before bulk
              operations. Use at your own risk. If it earns its keep,{" "}
              <strong className="text-[color:var(--fg)]">
                share it with a friend who rides
              </strong>{" "}
              — that&apos;s the whole reward model.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrefRow({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-input)] p-3">
      <div className="mt-0.5 text-[color:var(--fg-muted)]">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-[color:var(--fg-muted)]">{subtitle}</p>
      </div>
      <div className="flex-shrink-0 self-center">{action}</div>
    </div>
  );
}
