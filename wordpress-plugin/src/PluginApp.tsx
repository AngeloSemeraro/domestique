import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StravaGear } from "@/lib/strava";
import type { ParsedTrack } from "@/lib/file-parsers";
import type { StreamedActivity } from "@/lib/gpx";
import Editor from "@/components/Editor";
import MergeTab from "@/components/MergeTab";
import AnalyzerTab from "@/components/AnalyzerTab";
import Footer from "@/components/Footer";
import PreferencesPanel from "@/components/PreferencesPanel";
import DomestiqueHeader, {
  type HeaderTab,
} from "@/components/DomestiqueHeader";
import LoginScreen from "@/components/LoginScreen";

type ShortcodeTab = "edit" | "merge" | "inspector" | "all";
type ActiveTab = "edit" | "merge" | "analyze" | "preferences";

type AnalyzerSeed = ParsedTrack & { rawSources?: StreamedActivity[] };

type MeOk = {
  authenticated: true;
  athlete: { id: number; name: string; bikes: StravaGear[]; shoes: unknown[] };
};
type MeNo = { authenticated: false };

const LEFT_TABS: HeaderTab[] = [
  { id: "edit", label: "Batch Edit" },
  { id: "merge", label: "Merge Rides" },
  { id: "analyze", label: "Inspect" },
];
const RIGHT_TABS: HeaderTab[] = [{ id: "preferences", label: "Preferences" }];

export default function PluginApp({ tab: scTab }: { tab: ShortcodeTab }) {
  const [me, setMe] = useState<MeOk | MeNo | null>(null);
  const [tab, setTab] = useState<ActiveTab>(initialTab(scTab));
  const [seed, setSeed] = useState<AnalyzerSeed | null>(null);

  useEffect(() => {
    apiFetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe(d as MeOk | MeNo))
      .catch(() => setMe({ authenticated: false }));
  }, []);

  if (!me) return <Loading />;
  if (!me.authenticated) return <LoginScreen />;

  const athlete = me.athlete;

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    location.reload();
  }

  const full = scTab === "all";

  return (
    <div className="sbe-mount-inner flex flex-col">
      {full && (
        <DomestiqueHeader
          leftTabs={LEFT_TABS}
          rightTabs={RIGHT_TABS}
          active={tab}
          onChange={(id) => setTab(id as ActiveTab)}
        />
      )}

      <div key={tab} className="animate-fade-in p-4 md:p-6">
        {tab === "edit" && <Editor bikes={athlete.bikes} />}
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
        {tab === "preferences" && (
          <PreferencesPanel athleteName={athlete.name} onLogout={logout} />
        )}
      </div>

      {full && <Footer />}
    </div>
  );
}

function initialTab(sc: ShortcodeTab): ActiveTab {
  if (sc === "merge") return "merge";
  if (sc === "inspector") return "analyze";
  return "edit";
}

function Loading() {
  return (
    <div className="flex h-32 items-center justify-center text-sm text-[color:var(--fg-muted)]">
      Loading…
    </div>
  );
}
