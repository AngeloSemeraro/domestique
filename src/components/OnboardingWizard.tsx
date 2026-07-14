"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Sparkles,
} from "lucide-react";
import AppLogo from "./AppLogo";

type Status = { missing: string[]; selfHosted: boolean };

export default function OnboardingWizard({
  appUrl,
  status,
}: {
  appUrl: string;
  status: Status;
}) {
  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [sessionSecret, setSessionSecret] = useState("");
  const [rwgpsClientId, setRwgpsClientId] = useState("");
  const [rwgpsClientSecret, setRwgpsClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/onboarding/random-secret")
      .then((r) => r.json())
      .then((d) => setSessionSecret(d.secret))
      .catch(() => {});
  }, []);

  async function regenSecret() {
    try {
      const r = await fetch("/api/onboarding/random-secret");
      const d = await r.json();
      setSessionSecret(d.secret);
    } catch {
      /* ignore */
    }
  }

  async function save() {
    setSaveError(null);
    if (!status.selfHosted) {
      setSaveError(
        "This deployment is read-only; copy the values shown into your host's environment variable settings."
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/save-env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          sessionSecret: sessionSecret.trim(),
          appUrl,
          rwgpsClientId: rwgpsClientId.trim(),
          rwgpsClientSecret: rwgpsClientSecret.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  const callbackDomain = (() => {
    try {
      return new URL(appUrl).hostname;
    } catch {
      return "localhost";
    }
  })();

  const canAdvanceFromStep2 =
    clientId.trim().length > 0 &&
    clientSecret.trim().length > 0 &&
    sessionSecret.trim().length >= 32;

  return (
    <main className="flex min-h-screen flex-col items-center bg-[color:var(--bg)] p-4 md:p-8">
      <div className="w-full max-w-2xl space-y-6">
        <header className="animate-fade-in flex items-center gap-3">
          <AppLogo size={40} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Domestique
            </h1>
            <p className="text-xs text-[color:var(--fg-muted)]">
              First-run setup
            </p>
          </div>
        </header>

        <Stepper current={step} total={4} />

        <section className="animate-scale-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-5 shadow-sm md:p-6">
          {step === 0 && (
            <WelcomeStep
              missing={status.missing}
              selfHosted={status.selfHosted}
            />
          )}
          {step === 1 && <CreateAppStep callbackDomain={callbackDomain} />}
          {step === 2 && (
            <CredentialsStep
              clientId={clientId}
              setClientId={setClientId}
              clientSecret={clientSecret}
              setClientSecret={setClientSecret}
              sessionSecret={sessionSecret}
              regenSecret={regenSecret}
              showSecret={showSecret}
              setShowSecret={setShowSecret}
              showSession={showSession}
              setShowSession={setShowSession}
              rwgpsClientId={rwgpsClientId}
              setRwgpsClientId={setRwgpsClientId}
              rwgpsClientSecret={rwgpsClientSecret}
              setRwgpsClientSecret={setRwgpsClientSecret}
              appUrl={appUrl}
            />
          )}
          {step === 3 && (
            <SaveStep
              clientId={clientId}
              clientSecret={clientSecret}
              sessionSecret={sessionSecret}
              appUrl={appUrl}
              rwgpsClientId={rwgpsClientId}
              rwgpsClientSecret={rwgpsClientSecret}
              selfHosted={status.selfHosted}
              saving={saving}
              saved={saved}
              error={saveError}
              onSave={save}
            />
          )}

          <div className="mt-6 flex items-center justify-between border-t border-[color:var(--border)] pt-4">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || saving || saved}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[color:var(--row-hover)] disabled:opacity-40"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            {step < 3 && (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 2 && !canAdvanceFromStep2}
                className="inline-flex items-center gap-1.5 rounded-full bg-strava px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-strava/30 transition-all hover:scale-[1.02] disabled:opacity-40"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i <= current ? "bg-strava" : "bg-[color:var(--border)]"
          }`}
        />
      ))}
    </div>
  );
}

function WelcomeStep({
  missing,
  selfHosted,
}: {
  missing: string[];
  selfHosted: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-strava">
        <Sparkles className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">
          Welcome
        </span>
      </div>
      <h2 className="text-2xl font-bold tracking-tight">
        Let&apos;s connect Strava (~2 minutes)
      </h2>
      <p className="text-sm leading-relaxed text-[color:var(--fg-muted)]">
        Domestique talks to your account on your behalf using
        Strava&apos;s official OAuth API. To do that you need to register a
        tiny &quot;application&quot; in your Strava account — this gives you
        a Client ID and Client Secret that stay on{" "}
        <strong>this computer only</strong>. Nothing ever goes to anyone
        else&apos;s server.
      </p>
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] p-3 text-xs">
        <p className="mb-1 font-medium">What we&apos;ll do together</p>
        <ol className="ml-5 list-decimal space-y-1 text-[color:var(--fg-muted)]">
          <li>Open the Strava API portal and create your app (1 minute)</li>
          <li>Copy the Client ID + Client Secret back here</li>
          <li>
            We save them to <code>.env.local</code> in this project folder,
            generate a random session secret, and you&apos;re in
          </li>
        </ol>
      </div>
      {missing.length > 0 && (
        <p className="text-xs text-[color:var(--fg-muted)]">
          Missing: {missing.join(", ")}
        </p>
      )}
      {!selfHosted && (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            This looks like a hosted deployment (read-only filesystem). The
            wizard will show you the values to paste into your host&apos;s
            environment variable settings instead of writing them to disk.
          </span>
        </div>
      )}
    </div>
  );
}

function CreateAppStep({ callbackDomain }: { callbackDomain: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-strava">
        <ExternalLink className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">
          Step 1 — Create your Strava app
        </span>
      </div>
      <h2 className="text-2xl font-bold tracking-tight">
        Open the Strava API portal
      </h2>
      <a
        href="https://www.strava.com/settings/api"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-full bg-strava px-4 py-2 text-sm font-semibold !text-white shadow-md shadow-strava/30 transition-all hover:scale-[1.02]"
      >
        Open Strava API settings
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <p className="text-sm text-[color:var(--fg-muted)]">
        Click <strong>Create &amp; Manage Your App</strong> (or scroll to{" "}
        <strong>My API Application</strong> if you have one). Fill in the
        form like this:
      </p>
      <FieldList
        items={[
          { k: "Application Name", v: "Domestique (or anything)" },
          { k: "Category", v: "Other" },
          { k: "Club", v: "Leave blank" },
          { k: "Website", v: "http://localhost (or any URL)" },
          {
            k: "Authorization Callback Domain",
            v: callbackDomain,
            hint: "Important — just the domain, no http://, no port, no path",
          },
        ]}
      />
      <p className="text-sm text-[color:var(--fg-muted)]">
        Upload any icon (a square image works), then accept and save. The
        next page will show your <strong>Client ID</strong> and{" "}
        <strong>Client Secret</strong>. Click <em>Show</em> on the Secret to
        reveal it.
      </p>
    </div>
  );
}

function CredentialsStep({
  clientId,
  setClientId,
  clientSecret,
  setClientSecret,
  sessionSecret,
  regenSecret,
  showSecret,
  setShowSecret,
  showSession,
  setShowSession,
  rwgpsClientId,
  setRwgpsClientId,
  rwgpsClientSecret,
  setRwgpsClientSecret,
  appUrl,
}: {
  clientId: string;
  setClientId: (v: string) => void;
  clientSecret: string;
  setClientSecret: (v: string) => void;
  sessionSecret: string;
  regenSecret: () => void;
  showSecret: boolean;
  setShowSecret: (b: boolean) => void;
  showSession: boolean;
  setShowSession: (b: boolean) => void;
  rwgpsClientId: string;
  setRwgpsClientId: (v: string) => void;
  rwgpsClientSecret: string;
  setRwgpsClientSecret: (v: string) => void;
  appUrl: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-strava">
        <KeyRound className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">
          Step 2 — Paste your credentials
        </span>
      </div>
      <h2 className="text-2xl font-bold tracking-tight">Paste them here</h2>
      <p className="text-sm text-[color:var(--fg-muted)]">
        These values stay in <code>.env.local</code> on your machine. Nothing
        is sent anywhere by this wizard.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
          Client ID
        </span>
        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="e.g. 123456"
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-3 py-2 font-mono text-sm"
          autoFocus
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
          Client Secret
        </span>
        <div className="relative">
          <input
            type={showSecret ? "text" : "password"}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="40-char hex string"
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-3 py-2 pr-10 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
            aria-label={showSecret ? "Hide" : "Show"}
          >
            {showSecret ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center justify-between text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
          <span>Session Secret (auto-generated)</span>
          <button
            type="button"
            onClick={regenSecret}
            className="text-[10px] normal-case text-strava hover:underline"
          >
            Regenerate
          </button>
        </span>
        <div className="relative">
          <input
            type={showSession ? "text" : "password"}
            value={sessionSecret}
            readOnly
            className="w-full cursor-default rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-3 py-2 pr-10 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setShowSession(!showSession)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
          >
            {showSession ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-[color:var(--fg-muted)]">
          Used to encrypt the session cookie. Never sent to Strava.
        </p>
      </label>

      <details className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] p-3">
        <summary className="cursor-pointer text-sm font-medium">
          RideWithGPS upload{" "}
          <span className="font-normal text-[color:var(--fg-muted)]">
            — optional, you can skip this
          </span>
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-relaxed text-[color:var(--fg-muted)]">
            Lets you upload activities straight to your RideWithGPS library.
            On{" "}
            <a
              href="https://ridewithgps.com/api"
              target="_blank"
              rel="noreferrer"
              className="text-strava hover:underline"
            >
              ridewithgps.com
            </a>{" "}
            open <strong>Account Settings → Developers</strong>, create an API
            client, and set its <strong>Redirect URI</strong> to:
          </p>
          <code className="block break-all rounded border border-[color:var(--border)] bg-[color:var(--bg-elev)] px-2 py-1.5 text-xs">
            {appUrl.replace(/\/$/, "")}/api/rwgps/auth/callback
          </code>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
              RideWithGPS Client ID
            </span>
            <input
              type="text"
              value={rwgpsClientId}
              onChange={(e) => setRwgpsClientId(e.target.value)}
              placeholder="from your API client"
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev)] px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-wider text-[color:var(--fg-muted)]">
              RideWithGPS Client Secret
            </span>
            <input
              type="password"
              value={rwgpsClientSecret}
              onChange={(e) => setRwgpsClientSecret(e.target.value)}
              placeholder="from your API client"
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev)] px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
      </details>
    </div>
  );
}

function SaveStep({
  clientId,
  clientSecret,
  sessionSecret,
  appUrl,
  rwgpsClientId,
  rwgpsClientSecret,
  selfHosted,
  saving,
  saved,
  error,
  onSave,
}: {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  appUrl: string;
  rwgpsClientId: string;
  rwgpsClientSecret: string;
  selfHosted: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
}) {
  const envText = [
    `STRAVA_CLIENT_ID=${clientId}`,
    `STRAVA_CLIENT_SECRET=${clientSecret}`,
    `NEXT_PUBLIC_APP_URL=${appUrl}`,
    `SESSION_SECRET=${sessionSecret}`,
    ...(rwgpsClientId.trim() && rwgpsClientSecret.trim()
      ? [
          `RWGPS_CLIENT_ID=${rwgpsClientId.trim()}`,
          `RWGPS_CLIENT_SECRET=${rwgpsClientSecret.trim()}`,
        ]
      : []),
  ].join("\n");

  function setOnceUnused(_: unknown) {
    // never called; here only to silence ESLint about react-hooks if added later
  }
  void setOnceUnused;

  function copy() {
    navigator.clipboard?.writeText(envText).catch(() => {});
  }

  if (saved) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">You&apos;re set!</h2>
        <p className="text-sm text-[color:var(--fg-muted)]">
          Saved to <code>.env.local</code>. Now restart the dev server:
        </p>
        <pre className="mx-auto inline-block rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] px-3 py-2 text-left font-mono text-xs">
          {`Ctrl + C   # stop\nnpm run dev`}
        </pre>
        <p className="text-sm text-[color:var(--fg-muted)]">
          Then reload this page and click <em>Connect with Strava</em>.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-strava px-4 py-2 text-sm font-semibold !text-white shadow-md shadow-strava/30 transition-all hover:scale-[1.02]"
        >
          Reload
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-strava">
        <Check className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">
          Step 3 — Save and you&apos;re in
        </span>
      </div>
      <h2 className="text-2xl font-bold tracking-tight">
        {selfHosted ? "Save to .env.local" : "Paste into your host env vars"}
      </h2>
      <p className="text-sm text-[color:var(--fg-muted)]">
        {selfHosted
          ? "We'll write this file into your project folder (any existing .env.local will be backed up as .env.local.bak)."
          : "Your environment is read-only, so the wizard can't write the file. Copy these values and paste them in your host's environment variables panel."}
      </p>

      <div className="relative">
        <pre className="overflow-x-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] p-3 font-mono text-xs">
          {envText}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="absolute right-2 top-2 rounded border border-[color:var(--border)] bg-[color:var(--bg-elev)] px-2 py-1 text-xs hover:border-strava hover:text-strava"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>

      {error && (
        <p className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {selfHosted && (
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition-all hover:scale-[1.02] disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {saving ? "Saving…" : "Save .env.local"}
        </button>
      )}
    </div>
  );
}

function FieldList({
  items,
}: {
  items: Array<{ k: string; v: string; hint?: string }>;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-input)] divide-y divide-[color:var(--border)]">
      {items.map((it) => (
        <div key={it.k} className="grid grid-cols-3 gap-2 p-2 text-xs">
          <span className="font-medium text-[color:var(--fg-muted)]">
            {it.k}
          </span>
          <span className="col-span-2 font-mono">
            {it.v}
            {it.hint && (
              <span className="ml-2 text-[color:var(--fg-muted)]/70 font-sans">
                — {it.hint}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
