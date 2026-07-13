import { ArrowRight, AlertCircle } from "lucide-react";
import AppLogo from "./AppLogo";
import { loginHref } from "@/lib/api";

export default function LoginScreen({ error }: { error?: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="animate-scale-in flex flex-col items-center gap-4">
        <AppLogo size={72} />
        <h1 className="text-center text-4xl font-bold tracking-tight">
          Domestique
        </h1>
        <p className="max-w-md text-center text-[color:var(--fg-muted)]">
          Edit sport type, gear, indoor flag and visibility on many activities
          at once. Filter by date, sport, name and location.
        </p>
      </div>

      {error && (
        <div className="animate-fade-in flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <a
        href={loginHref()}
        className="group animate-fade-in inline-flex items-center gap-2 rounded-full bg-strava px-6 py-3 font-semibold !text-white shadow-lg shadow-strava/30 transition-all hover:scale-[1.02] hover:bg-orange-600 active:scale-[0.98]"
      >
        Connect with Strava
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </a>
    </main>
  );
}
