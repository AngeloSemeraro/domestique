import "./globals.css";
import { createRoot } from "react-dom/client";
import PluginApp from "./PluginApp";

declare global {
  interface Window {
    SBE_BOOTSTRAP?: {
      restRoot: string;
      nonce: string;
      loginUrl: string;
      logoutUrl: string;
      revokeUrl: string;
      meUrl: string;
      iconUrl: string;
      version: string;
      /** Present when the WP admin configured the RideWithGPS API client. */
      rwgpsLoginUrl?: string;
    };
  }
}

function boot() {
  const mounts = document.querySelectorAll<HTMLElement>("[data-sbe-mount]");
  mounts.forEach((el) => {
    if (el.dataset.sbeBooted === "1") return;
    el.dataset.sbeBooted = "1";
    const tab = (el.dataset.sbeTab as "edit" | "merge" | "inspector" | "all") ?? "all";
    createRoot(el).render(<PluginApp tab={tab} />);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
