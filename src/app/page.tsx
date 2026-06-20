import { getSession } from "@/lib/session";
import LoginScreen from "@/components/LoginScreen";
import AppShell from "@/components/AppShell";
import { getAthlete } from "@/lib/strava";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session.accessToken) {
    return <LoginScreen />;
  }
  try {
    const athlete = await getAthlete();
    return (
      <AppShell
        athleteName={`${athlete.firstname} ${athlete.lastname}`.trim()}
        bikes={athlete.bikes ?? []}
      />
    );
  } catch {
    return <LoginScreen error="Session expired. Please log in again." />;
  }
}
