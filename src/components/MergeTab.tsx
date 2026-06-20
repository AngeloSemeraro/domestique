"use client";

import { GitMerge, AlertCircle, ExternalLink } from "lucide-react";

export default function MergeTab() {
  return (
    <div className="space-y-6">
      <section className="animate-fade-in rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-strava/10 text-strava">
            <GitMerge className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Merge rides
            </h2>
            <p className="text-sm text-[color:var(--fg-muted)]">
              Combine multiple rides into a single activity
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
            <div className="space-y-3 text-sm">
              <p>
                <strong>
                  Strava does not expose its native "merge" feature via API.
                </strong>{" "}
                The only programmatic way to combine rides is to download
                each one's GPS track, stitch them together, and upload the
                result as a new activity. Decide which approach you want
                before we build it:
              </p>

              <div className="space-y-2 pl-1">
                <p>
                  <strong>A) Real merge</strong> — fetch GPX/streams for the
                  selected rides, sort chronologically, glue into one GPX,
                  upload as a new activity via <code>POST /uploads</code>.
                  Caveat: Strava removed{" "}
                  <code>DELETE /activities/&#123;id&#125;</code> from the
                  public API, so the originals stay on your profile until
                  you delete them by hand (you can batch-hide them from the
                  feed via the other tab).
                </p>
                <p>
                  <strong>B) Suggest + link</strong> — find pairs/groups of
                  rides that look like candidates (same day, same gear,
                  start of B within X minutes of end of A) and give you
                  direct links to Strava's UI to merge them officially in
                  the browser.
                </p>
              </div>

              <p className="text-xs text-[color:var(--fg-muted)]">
                Tell me which one and I'll wire it up.
              </p>

              <a
                href="https://support.strava.com/hc/en-us/articles/216917447"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-strava hover:underline"
              >
                Strava's own merge docs
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
