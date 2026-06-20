import { NextResponse } from "next/server";
import { isSelfHosted, missingEnvKeys } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    missing: missingEnvKeys(),
    selfHosted: isSelfHosted(),
  });
}
