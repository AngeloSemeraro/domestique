import { redirect } from "next/navigation";
import OnboardingWizard from "@/components/OnboardingWizard";
import { isSelfHosted, missingEnvKeys } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  const missing = missingEnvKeys();
  if (missing.length === 0) {
    redirect("/");
  }
  return (
    <OnboardingWizard
      appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}
      status={{ missing, selfHosted: isSelfHosted() }}
    />
  );
}
