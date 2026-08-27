/* Feed timestamps.

   History rows arrive as "MM/DD/YYYY HH:MM:SS EDT". V8 parses that today, but
   the moment the zone suffix moves or disappears Date.parse silently falls
   back to server-local time and every date shifts by the host's offset. An
   explicit parser fails loudly instead. */

const ZONES: Record<string, number> = {
  EDT: -4, EST: -5, ET: -5, CDT: -5, CST: -6,
  MDT: -6, MST: -7, PDT: -7, PST: -8, UTC: 0, GMT: 0,
};

const FEED_DATE =
  /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?(?:\s+([A-Z]{2,4}))?$/;

/** Epoch ms, or null when the shape is not what we expect. */
export function parseFeedDate(s: string): number | null {
  const m = FEED_DATE.exec(s.trim());
  if (!m) return null;
  const [, mm, dd, yyyy, hh = "0", mi = "0", ss = "0", zone] = m;
  const offsetHours = zone ? ZONES[zone] : 0;
  if (zone && offsetHours === undefined) return null;
  const utc = Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
  return utc - (offsetHours ?? 0) * 3_600_000;
}

/** "15m ago", "2h ago" — the staleness readout on the dateline. */
export function relativeAge(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Percent change between the last point and the one N sessions earlier. */
export function changeOverSessions(
  points: Array<{ date: string; price: number }>,
  sessions: number,
): number | null {
  const asc = points
    .map((p) => ({ t: parseFeedDate(p.date), price: p.price }))
    .filter((p): p is { t: number; price: number } => p.t !== null && p.price > 0)
    .sort((a, b) => a.t - b.t);

  if (asc.length < sessions + 1) return null;
  const last = asc[asc.length - 1].price;
  const prev = asc[asc.length - 1 - sessions].price;
  return prev > 0 ? (last / prev - 1) * 100 : null;
}
