import { apiFetch } from "./api";
export type GeoLocation = {
  city: string | null;
  state: string | null;
  country: string | null;
};

const CACHE_KEY = "sbe.geocode.v1";
const NEGATIVE_VALUE: GeoLocation = { city: null, state: null, country: null };

type Cache = Record<string, GeoLocation>;

function readCache(): Cache {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(c: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* quota or disabled — silently degrade */
  }
}

/** Round to ~100 m so nearby starts dedupe. */
export function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export function cachedGeo(lat: number, lng: number): GeoLocation | null {
  return readCache()[coordKey(lat, lng)] ?? null;
}

export function formatGeo(g: GeoLocation | null | undefined): string {
  if (!g) return "";
  return [g.city, g.state, g.country].filter(Boolean).join(", ");
}

/**
 * Reverse-geocode a list of [id, lat, lng] tuples, calling `onResult` as
 * each finishes. Respects Nominatim's 1 req/sec usage policy and persists
 * results to localStorage. Returns a function to abort the queue.
 */
export function geocodeQueue(
  items: Array<{ id: number; lat: number; lng: number }>,
  onResult: (id: number, geo: GeoLocation) => void,
  onProgress?: (done: number, total: number) => void
): () => void {
  let aborted = false;
  const cache = readCache();
  const pending: typeof items = [];

  for (const it of items) {
    const k = coordKey(it.lat, it.lng);
    if (cache[k]) {
      onResult(it.id, cache[k]);
    } else {
      pending.push(it);
    }
  }

  let done = items.length - pending.length;
  onProgress?.(done, items.length);

  (async () => {
    for (const it of pending) {
      if (aborted) return;
      const k = coordKey(it.lat, it.lng);
      try {
        const res = await apiFetch(`/api/geocode?lat=${it.lat}&lng=${it.lng}`);
        if (res.ok) {
          const geo = (await res.json()) as GeoLocation;
          cache[k] = geo;
          writeCache(cache);
          onResult(it.id, geo);
        } else {
          cache[k] = NEGATIVE_VALUE;
          writeCache(cache);
        }
      } catch {
        /* network — skip silently */
      }
      done++;
      onProgress?.(done, items.length);
      await new Promise((r) => setTimeout(r, 1100));
    }
  })();

  return () => {
    aborted = true;
  };
}
