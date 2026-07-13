"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Edit3,
  GitMerge,
  LogOut,
  Settings as SettingsIcon,
  Wand2,
} from "lucide-react";
import AppLogo from "./AppLogo";
import type { StravaGear } from "@/lib/strava";
import type { ParsedTrack } from "@/lib/file-parsers";
import type { StreamedActivity } from "@/lib/gpx";

export type AnalyzerSeed = ParsedTrack & {
  rawSources?: StreamedActivity[];
  seamIndices?: number[];
};
import Editor from "./Editor";
import MergeTab from "./MergeTab";
import AnalyzerTab from "./AnalyzerTab";
import Footer from "./Footer";
import SettingsModal from "./SettingsModal";

type TabId = "edit" | "merge" | "analyze";

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: "edit", label: "Batch edit", icon: <Edit3 className="h-4 w-4" /> },
  { id: "merge", label: "Merge rides", icon: <GitMerge className="h-4 w-4" /> },
  { id: "analyze", label: "Inspector", icon: <Wand2 className="h-4 w-4" /> },
];

export default function AppShell({
  athleteName,
  bikes,
}: {
  athleteName: string;
  bikes: StravaGear[];
}) {
  const [tab, setTab] = useState<TabId>("edit");
  const [analyzerSeed, setAnalyzerSeed] = useState<AnalyzerSeed | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    location.href = "/";
  }

  function sendToAnalyzer(seed: AnalyzerSeed) {
    setAnalyzerSeed(seed);
    setTab("analyze");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main
        className="mx-auto w-full flex-1 space-y-6 py-4 md:py-8"
        style={{
          maxWidth: "1440px",
          paddingLeft: "clamp(1rem, 6vw, 8rem)",
          paddingRight: "clamp(1rem, 6vw, 8rem)",
        }}
      >
        <header className="animate-fade-in flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppLogo size={40} />
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Domestique
              </h1>
              <p className="text-xs text-[color:var(--fg-muted)]">{athleteName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[color:var(--row-hover)]"
              aria-label="Preferences"
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

        <nav className="animate-fade-in flex items-center gap-1 border-b border-[color:var(--border)]">
          {TABS.map((t) => {
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

        <div key={tab} className="animate-fade-in">
          {tab === "edit" && <Editor bikes={bikes} />}
          {tab === "merge" && <MergeTab onSendToAnalyzer={sendToAnalyzer} />}
          {tab === "analyze" && (
            <AnalyzerTab
              seed={analyzerSeed}
              onConsumeSeed={() => setAnalyzerSeed(null)}
            />
          )}
        </div>
      </main>

      <Footer />

      {settingsOpen && (
        <SettingsModal
          athleteName={athleteName}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
