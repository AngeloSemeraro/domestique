import { useEffect, useState } from "react";
import {
  Edit3,
  GitMerge,
  LogOut,
  Settings as SettingsIcon,
  Wand2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { StravaGear } from "@/lib/strava";
import type { ParsedTrack } from "@/lib/file-parsers";
import type { StreamedActivity } from "@/lib/gpx";
import AppLogo from "@/components/AppLogo";
import Editor from "@/components/Editor";
import MergeTab from "@/components/MergeTab";
import AnalyzerTab from "@/components/AnalyzerTab";
import Footer from "@/components/Footer";
import SettingsModal from "@/components/SettingsModal";
import LoginScreen from "@/components/LoginScreen";

type ShortcodeTab = "edit" | "merge" | "inspector" | "all";
type ActiveTab = "edit" | "merge" | "analyze";

type AnalyzerSeed = ParsedTrack & { rawSources?: StreamedActivity[] };

type MeOk = {
  authenticated: true;
  athlete: { id: number; name: string; bikes: StravaGear[]; shoes: unknown[] };
};
type MeNo = { authenticated: false };

export default function PluginApp({ tab: scTab }: { tab: ShortcodeTab }) {
  const [me, setMe] = useState<MeOk | MeNo | null>(null);
  const [tab, setTab] = useState<ActiveTab>(initialTab(scTab));
  const [seed, setSeed] = useState<AnalyzerSeed | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    apiFetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe(d as MeOk | MeNo))
      .catch(() => setMe({ authenticated: false }));
  }, []);

  if (!me) return <Loading />;
  if (!me.authenticated) {
    return <LoginScreen />;
  }

  const tabs = visibleTabs(scTab);
  const showHeader = scTab === "all";
  const showFooter = scTab === "all";

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    location.reload();
  }

  return (
    <div className="sbe-mount-inner flex flex-col">
      {showHeader && (
        <header className="animate-fade-in flex items-center justify-between gap-4 p-4 md:p-6">
          <div className="flex items-center gap-3">
            <AppLogo size={40} />
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Domestique
              </h1>
              <p className="text-xs text-[color:var(--fg-muted)]">
                {me.athlete.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[color:var(--row-hover)]"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              Preferences
            </button>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[color:var(--row-hover)]"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </header>
      )}

      {tabs.length > 1 && (
        <nav className="animate-fade-in mx-4 flex items-center gap-1 border-b border-[color:var(--border)] md:mx-6">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`group relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "text-strava"
                    : "text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
                }`}
              >
                {t.icon}
                {t.label}
                <span
                  className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-strava transition-transform ${
                    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"
                  }`}
                />
              </button>
            );
          })}
        </nav>
      )}

      <div key={tab} className="animate-fade-in p-4 md:p-6">
        {tab === "edit" && <Editor bikes={me.athlete.bikes} />}
        {tab === "merge" && (
          <MergeTab
            onSendToAnalyzer={(s) => {
              setSeed(s);
              setTab("analyze");
            }}
          />
        )}
        {tab === "analyze" && (
          <AnalyzerTab seed={seed} onConsumeSeed={() => setSeed(null)} />
        )}
      </div>

      {showFooter && <Footer />}

      {settingsOpen && (
        <SettingsModal
          athleteName={me.athlete.name}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function initialTab(sc: ShortcodeTab): ActiveTab {
  if (sc === "edit") return "edit";
  if (sc === "merge") return "merge";
  if (sc === "inspector") return "analyze";
  return "edit";
}

function visibleTabs(sc: ShortcodeTab) {
  const all = [
    { id: "edit" as const, label: "Batch edit", icon: <Edit3 className="h-4 w-4" /> },
    { id: "merge" as const, label: "Merge rides", icon: <GitMerge className="h-4 w-4" /> },
    { id: "analyze" as const, label: "Inspector", icon: <Wand2 className="h-4 w-4" /> },
  ];
  if (sc === "all") return all;
  if (sc === "edit") return [all[0]];
  if (sc === "merge") return [all[1]];
  return [all[2]];
}

function Loading() {
  return (
    <div className="flex h-32 items-center justify-center text-sm text-[color:var(--fg-muted)]">
      Loading…
    </div>
  );
}
