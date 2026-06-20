/**
 * IANA timezone → country name lookup, focused on regions Strava users in
 * Europe / Americas commonly visit. Falls back to "" when unknown — callers
 * should also include the raw timezone string in their search corpus so any
 * embedded city name (e.g. "Tokyo") still matches.
 */
const MAP: Record<string, string> = {
  // Europe
  "Europe/Rome": "Italy",
  "Europe/Vatican": "Italy",
  "Europe/Paris": "France",
  "Europe/Berlin": "Germany",
  "Europe/Madrid": "Spain",
  "Europe/Lisbon": "Portugal",
  "Europe/Amsterdam": "Netherlands",
  "Europe/Brussels": "Belgium",
  "Europe/Vienna": "Austria",
  "Europe/Zurich": "Switzerland",
  "Europe/London": "United Kingdom",
  "Europe/Dublin": "Ireland",
  "Europe/Copenhagen": "Denmark",
  "Europe/Stockholm": "Sweden",
  "Europe/Oslo": "Norway",
  "Europe/Helsinki": "Finland",
  "Europe/Warsaw": "Poland",
  "Europe/Prague": "Czech Republic",
  "Europe/Budapest": "Hungary",
  "Europe/Athens": "Greece",
  "Europe/Istanbul": "Turkey",
  "Europe/Bucharest": "Romania",
  "Europe/Sofia": "Bulgaria",
  "Europe/Belgrade": "Serbia",
  "Europe/Zagreb": "Croatia",
  "Europe/Ljubljana": "Slovenia",
  "Europe/Bratislava": "Slovakia",
  "Europe/Luxembourg": "Luxembourg",
  "Europe/Monaco": "Monaco",
  "Europe/Andorra": "Andorra",
  "Europe/Malta": "Malta",
  "Europe/Reykjavik": "Iceland",
  "Atlantic/Canary": "Spain",
  "Atlantic/Madeira": "Portugal",

  // Americas
  "America/New_York": "United States",
  "America/Chicago": "United States",
  "America/Denver": "United States",
  "America/Los_Angeles": "United States",
  "America/Phoenix": "United States",
  "America/Anchorage": "United States",
  "America/Toronto": "Canada",
  "America/Vancouver": "Canada",
  "America/Montreal": "Canada",
  "America/Mexico_City": "Mexico",
  "America/Sao_Paulo": "Brazil",
  "America/Argentina/Buenos_Aires": "Argentina",
  "America/Santiago": "Chile",
  "America/Bogota": "Colombia",
  "America/Lima": "Peru",

  // Asia / Oceania
  "Asia/Tokyo": "Japan",
  "Asia/Seoul": "South Korea",
  "Asia/Shanghai": "China",
  "Asia/Hong_Kong": "Hong Kong",
  "Asia/Singapore": "Singapore",
  "Asia/Bangkok": "Thailand",
  "Asia/Jakarta": "Indonesia",
  "Asia/Dubai": "United Arab Emirates",
  "Asia/Jerusalem": "Israel",
  "Australia/Sydney": "Australia",
  "Australia/Melbourne": "Australia",
  "Australia/Brisbane": "Australia",
  "Australia/Perth": "Australia",
  "Pacific/Auckland": "New Zealand",

  // Africa
  "Africa/Cairo": "Egypt",
  "Africa/Johannesburg": "South Africa",
  "Africa/Casablanca": "Morocco",
  "Africa/Nairobi": "Kenya",
};

/**
 * Strava's timezone field looks like "(GMT+01:00) Europe/Rome".
 * Extract the IANA region part.
 */
export function ianaFromStravaTz(tz: string | null | undefined): string {
  if (!tz) return "";
  const m = tz.match(/[A-Z][A-Za-z_]+\/[A-Za-z_\/]+/);
  return m ? m[0] : tz;
}

export function countryFromTimezone(tz: string | null | undefined): string {
  const iana = ianaFromStravaTz(tz);
  return MAP[iana] ?? "";
}
