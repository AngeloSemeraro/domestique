"use client";

import { useEffect, useState } from "react";
import { apiFetch, loginHref } from "@/lib/api";
import {
  AlertTriangle,
  Check,
  KeyRound,
  Loader2,
  LogOut,
  ShieldOff,
  Trash2,
  User,
} from "lucide-react";

/**
 * The Preferences tab body. Formerly a modal (SettingsModal); now a panel
 * shown as its own tab. Also hosts the signed-in identity and the Logout
 * button that used to live in the header.
 */
export default function PreferencesPanel({
  athleteName,
  onLogout,
}: {
  athleteName: string;
  onLogout: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Strava API key editing.
  const [keysOpen, setKeysOpen] = useState(false);
  const [selfHosted, setSelfHosted] = useState<boolean | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [keysMsg, setKeysMsg] = useState<string | null>(null);
  const [keysSaved, setKeysSaved] = useState(false);

  useEffect(() => {
    apiFetch("/api/settings/strava-keys")
      .then((r) => r.json())
      .then((d: { selfHosted: boolean; clientId: string }) => {
        setSelfHosted(d.selfHosted);
        setClientId(d.clientId ?? "");
      })
      .catch(() => setSelfHosted(false));
  }, []);

  async function saveKeys() {
    setKeysMsg(null);
    setKeysSaved(false);
    if (!clientId.trim() || !clientSecret.trim()) {
      setKeysMsg("Enter both the Client ID and Client Secret.");
      return;
    }
    setBusy("keys");
    try {
      const res = await apiFetch("/api/settings/strava-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      setKeysSaved(true);
      setClientSecret("");
      setKeysMsg(
        "Saved to .env.local. Restart the app for the new keys to take effect."
      );
    } catch (e) {
      setKeysMsg(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(null);
    }
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
        "This will revoke this app's access to your Strava account. You'll have to authorize it again from scratch. Continue?"
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
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="animate-fade-in flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-strava/15 text-[color:var(--accent-fg)]">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
              Signed in as
            </p>
            <p className="font-semibold tracking-tight">{athleteName}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium transition-colors hover:border-strava hover:bg-strava/10"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>

      <p className="!mt-5 px-1 text-xs font-medium uppercase tracking-wider text-[color:var(--fg-muted)]">
        Strava account
      </p>
      <PrefRow
        icon={<KeyRound className="h-4 w-4" />}
        title="Re-authorize with Strava"
        subtitle="Log out and re-run the OAuth flow. Useful if scopes changed or your tokens look stale."
        action={
          <button
            onClick={reauthorize}
            disabled={busy !== null}
            className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium hover:border-strava hover:bg-strava/10 disabled:opacity-50"
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
        icon={<ShieldOff className="h-4 w-4 text-red-600" />}
        title="Revoke Strava access"
        subtitle="Tells Strava to forget this app entirely. You'll start fresh next time, and the app disappears from Strava's connected apps list."
        action={
          <button
            onClick={revoke}
            disabled={busy !== null}
            className="rounded-full border border-red-500/50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
          >
            {busy === "revoke" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Revoke"
            )}
          </button>
        }
      />
      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-[color:var(--fg-muted)]">
            <KeyRound className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Strava API keys</p>
            <p className="text-xs text-[color:var(--fg-muted)]">
              Update the app&apos;s Client ID and Client Secret — use this if
              you regenerated your credentials in the Strava API settings.
            </p>
          </div>
          <div className="flex-shrink-0 self-center">
            <button
              onClick={() => {
                setKeysOpen((o) => !o);
                setKeysMsg(null);
                setKeysSaved(false);
              }}
              className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium hover:border-strava hover:bg-strava/10"
            >
              {keysOpen ? "Cancel" : "Change"}
            </button>
          </div>
        </div>

        {keysOpen && (
          <div className="mt-3 space-y-3 border-t border-[color:var(--border)] pt-3">
            {selfHosted === false && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
                This host&apos;s environment is read-only. Update{" "}
                <code className="font-mono">STRAVA_CLIENT_ID</code> and{" "}
                <code className="font-mono">STRAVA_CLIENT_SECRET</code> in your
                hosting dashboard instead, then redeploy.
              </p>
            )}
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-[color:var(--fg-muted)]">
                Client ID
              </span>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                disabled={selfHosted === false}
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 font-mono text-sm disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-[color:var(--fg-muted)]">
                Client Secret
              </span>
              <input
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste the new secret"
                disabled={selfHosted === false}
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-2.5 py-1.5 font-mono text-sm disabled:opacity-50"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={saveKeys}
                disabled={busy !== null || selfHosted === false}
                className="inline-flex items-center gap-1.5 rounded-full bg-strava px-4 py-1.5 text-sm font-semibold text-[color:var(--accent-fg)] shadow-sm transition-colors hover:brightness-105 disabled:opacity-50"
              >
                {busy === "keys" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : keysSaved ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5" />
                )}
                Save keys
              </button>
              {keysMsg && (
                <span
                  className={`text-xs ${
                    keysSaved ? "text-emerald-600" : "text-amber-700"
                  }`}
                >
                  {keysMsg}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="!mt-5 px-1 text-xs font-medium uppercase tracking-wider text-[color:var(--fg-muted)]">
        Maintenance
      </p>
      <PrefRow
        icon={<Trash2 className="h-4 w-4" />}
        title="Clear local geocoding cache"
        subtitle="Empties the localStorage cache of reverse-geocoded locations. Useful for debugging."
        action={
          <button
            onClick={clearGeoCache}
            className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium hover:border-strava hover:bg-strava/10"
          >
            Clear
          </button>
        }
      />

      {message && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
          {message}
        </p>
      )}

      <div className="!mt-5 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-input)] p-3 text-xs">
        <p className="mb-1 flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          Disclaimer
        </p>
        <p className="leading-relaxed text-[color:var(--fg-muted)]">
          This software is free, open-source and provided <em>as is</em>, with
          no warranty of any kind. It talks to your Strava account on your
          behalf — back up anything irreplaceable before bulk operations. Use
          at your own risk. If it earns its keep,{" "}
          <strong className="text-[color:var(--fg)]">
            share it with a friend who rides
          </strong>{" "}
          — that&apos;s the whole reward model.
        </p>
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
    <div className="flex items-start gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-3">
      <div className="mt-0.5 text-[color:var(--fg-muted)]">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-[color:var(--fg-muted)]">{subtitle}</p>
      </div>
      <div className="flex-shrink-0 self-center">{action}</div>
    </div>
  );
}
