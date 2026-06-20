"use client";

import { useState } from "react";
import { Activity, Edit3, GitMerge, LogOut, Wand2 } from "lucide-react";
import type { StravaGear } from "@/lib/strava";
import Editor from "./Editor";
import MergeTab from "./MergeTab";
import AnalyzerTab from "./AnalyzerTab";

type TabId = "edit" | "merge" | "analyze";

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: "edit", label: "Batch edit", icon: <Edit3 className="h-4 w-4" /> },
  { id: "merge", label: "Merge rides", icon: <GitMerge className="h-4 w-4" /> },
  { id: "analyze", label: "Analyzer", icon: <Wand2 className="h-4 w-4" /> },
];

export default function AppShell({
  athleteName,
  bikes,
}: {
  athleteName: string;
  bikes: StravaGear[];
}) {
  const [tab, setTab] = useState<TabId>("edit");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/";
  }

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
            <p className="text-xs text-[color:var(--fg-muted)]">{athleteName}</p>
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
        {tab === "merge" && <MergeTab />}
        {tab === "analyze" && <AnalyzerTab />}
      </div>
    </main>
  );
}
