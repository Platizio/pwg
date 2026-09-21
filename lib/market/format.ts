import { readerZone, zoneLabel } from "./ranges.ts";

/**
 * Fixed `en-US` locale everywhere. Using the visitor's locale would make the
 * server and client disagree on decimal separators and blow up hydration.
 */
export const money = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const usd = (n: number) => `$${money(n)}`;

/** Signed percentage, using a true minus sign rather than a hyphen. */
export const pct = (n: number, digits = 2) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}%`;

export const signed = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;

export const compactVolume = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
};

/* The reader's clock, and it says whose clock it is.
 *
 * THREE CLOCKS IN ONE CHART. This stamp is what the crosshair tooltip and the
 * accessible data table print, and it was pinned to New York while the axis
 * beside it had already moved to the reader's own zone (ranges.ts:40-125) and
 * the library's crosshair label was rendering the raw UTC timestamp. So one
 * intraday chart showed a reader in Mumbai 19:00 on the axis, 13:30 in the
 * tooltip and 13:30 again on the crosshair — three different numbers for one
 * instant, none of which was their own time.
 *
 * The rule is the one ranges.ts already settled: the clock is the READER'S, and
 * the label names it. A reader who sits down at 19:00 should not have to do the
 * arithmetic on every glance, and the zone name is what keeps that honest — the
 * original fault here was never the zone, it was the silence about which zone.
 *
 * ET remains the fallback — `readerZone` returns it when a runtime will not
 * resolve a zone — because the session is a fact about New York and a wrong
 * guess about the reader is worse than an honest default.
 *
 * Resolved LAZILY, never at module scope. This module is imported by server
 * components for `money` and `pct`, and a zone read at import time on Render
 * would bake in the host's UTC and be quietly wrong for everybody. */

/* Built per zone rather than per call: constructing an Intl formatter is the
   expensive part, and the crosshair re-stamps on every mouse move. */
const STAMPS = new Map<string, { time: Intl.DateTimeFormat; date: Intl.DateTimeFormat }>();

function stampsFor(zone: string) {
  const held = STAMPS.get(zone);
  if (held) return held;
  const made = {
    time: new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: zone,
    }),
    date: new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: zone,
    }),
  };
  STAMPS.set(zone, made);
  return made;
}

/**
 * One plotted point's instant, as the reader's own clock reads it.
 *
 * A clock is meaningless without its zone, so the intraday stamp carries one —
 * "Sep 18, 2026 · 19:00 IST" rather than a bare 19:00 that could be anywhere.
 *
 * A DAILY bar gets no clock and no zone, and that is deliberate rather than an
 * omission: its stamp is the trading day, the bar covers a whole session, and
 * printing a zone on it would invite the reader to believe the bar happened at
 * a moment. The date itself is rendered in the reader's zone so it agrees with
 * the axis above it.
 *
 * `zone` is a parameter with a default rather than a read inside the body, for
 * the same reason `zoneLabel` takes one (ranges.ts): a formatter whose answer
 * depends on the machine it runs on cannot be pinned by a test, and this one
 * has to be — it is the thing a reader looks at.
 */
export const formatStamp = (seconds: number, intraday: boolean, zone = readerZone()) => {
  const { time, date } = stampsFor(zone);
  const ms = seconds * 1000;
  return intraday ? `${date.format(ms)} · ${time.format(ms)} ${zoneLabel(zone, ms)}` : date.format(ms);
};

/* Market capitalisation, in the register a table column has room for.

   Fixed `en-US` for the same reason every other formatter here is: the sector
   table renders on the server as well, and a visitor-locale separator would
   disagree with the client and break hydration. */
export const marketCap = (n: number | null): string => {
  if (n === null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
};

/** A ratio, or a dash where the company has no earnings to divide by. */
export const ratio = (n: number | null): string =>
  n === null || !Number.isFinite(n) ? "—" : n.toFixed(2);
