import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  if (!lat || !lng) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(
    lat
  )}&lon=${encodeURIComponent(lng)}&format=json&zoom=10&addressdetails=1`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "domestique/0.1 (https://github.com/AngeloSemeraro/domestique)",
      "Accept-Language": "en",
    },
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `nominatim ${res.status}` },
      { status: 502 }
    );
  }
  const data = await res.json();
  const a = data.address ?? {};
  const city =
    a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? a.county ?? null;
  const state = a.state ?? a.region ?? null;
  const country = a.country ?? null;
  return NextResponse.json({ city, state, country });
}
