export default function LoginScreen({ error }: { error?: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Strava Batch Editor</h1>
      <p className="max-w-md text-center text-neutral-400">
        Edit sport type, gear, indoor flag and visibility on many activities at
        once. Filter by date range, sport, name and location.
      </p>
      {error && (
        <p className="rounded bg-red-900/50 px-4 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <a
        href="/api/auth/login"
        className="rounded-md bg-strava px-6 py-3 font-semibold text-white hover:bg-orange-600"
      >
        Connect with Strava
      </a>
    </main>
  );
}
