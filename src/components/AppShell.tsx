"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
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
import PreferencesPanel from "./PreferencesPanel";
import DomestiqueHeader, {
  type HeaderTab,
  CONTAINER_MAX,
  CONTAINER_PAD,
} from "./DomestiqueHeader";

type TabId = "edit" | "merge" | "analyze" | "preferences";

const LEFT_TABS: HeaderTab[] = [
  { id: "edit", label: "Batch Edit" },
  { id: "merge", label: "Merge Rides" },
  { id: "analyze", label: "Inspect" },
];
const RIGHT_TABS: HeaderTab[] = [{ id: "preferences", label: "Preferences" }];

export default function AppShell({
  athleteName,
  bikes,
}: {
  athleteName: string;
  bikes: StravaGear[];
}) {
  const [tab, setTab] = useState<TabId>("edit");
  const [analyzerSeed, setAnalyzerSeed] = useState<AnalyzerSeed | null>(null);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    location.href = "/";
  }

  function sendToAnalyzer(seed: AnalyzerSeed) {
    setAnalyzerSeed(seed);
    setTab("analyze");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--bg)]">
      <DomestiqueHeader
        leftTabs={LEFT_TABS}
        rightTabs={RIGHT_TABS}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      <main
        className="w-full flex-1 py-6 md:py-8"
        style={{
          maxWidth: CONTAINER_MAX,
          marginInline: "auto",
          paddingLeft: CONTAINER_PAD,
          paddingRight: CONTAINER_PAD,
        }}
      >
        <div key={tab} className="animate-fade-in">
          {tab === "edit" && <Editor bikes={bikes} />}
          {tab === "merge" && <MergeTab onSendToAnalyzer={sendToAnalyzer} />}
          {tab === "analyze" && (
            <AnalyzerTab
              seed={analyzerSeed}
              onConsumeSeed={() => setAnalyzerSeed(null)}
            />
          )}
          {tab === "preferences" && (
            <PreferencesPanel athleteName={athleteName} onLogout={logout} />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
