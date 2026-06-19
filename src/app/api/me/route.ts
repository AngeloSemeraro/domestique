import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAthlete } from "@/lib/strava";

export async function GET() {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ authenticated: false });
  }
  try {
    const athlete = await getAthlete();
    return NextResponse.json({
      authenticated: true,
      athlete: {
        id: athlete.id,
        name: `${athlete.firstname} ${athlete.lastname}`.trim(),
        bikes: athlete.bikes ?? [],
        shoes: athlete.shoes ?? [],
      },
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
