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

/* Market time, not UTC and not the reader's.
 *
 * These were UTC and unlabelled, so a US equity's intraday chart opened at
 * 13:30 and a reader in Mumbai had no way to tell whether that was a New York
 * session hour, their own, or neither. The session is a fact about New York,
 * so the clock is New York and every stamp that carries a clock says ET. */
const ET_ZONE = "America/New_York";

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: ET_ZONE,
});

const DATE = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: ET_ZONE,
});

/** Clock only — an intraday axis repeating the same date five times says nothing. */
export const clockOf = (seconds: number) => TIME.format(seconds * 1000);

/** Short date only, for daily and longer axes. */
export const dayOf = (seconds: number) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: ET_ZONE,
  }).format(seconds * 1000);

/* A clock is meaningless without its zone, so the intraday stamp carries one.
   A date needs none: the ET calendar day is the trading day, which is the only
   day a reader of this chart cares about. */
export const formatStamp = (seconds: number, intraday: boolean) =>
  intraday
    ? `${DATE.format(seconds * 1000)} · ${TIME.format(seconds * 1000)} ET`
    : DATE.format(seconds * 1000);

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
