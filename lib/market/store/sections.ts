import { createHash } from "node:crypto";

import type {
  RawCorporateActions,
  RawFundamentals,
  RawTickerNews,
} from "../../api/clients/fundamentals.ts";
import type { RawFinancials } from "../../api/clients/financials.ts";
import type { RawHistoryPoint } from "../../api/clients/quotes.ts";
import type { RawShortInterest } from "../../api/clients/technicals.ts";
import { parseFeedDate } from "../../api/normalize/time.ts";
import type { Returns } from "../../api/normalize/returns.ts";
import { returnsAgainst, splitRecord } from "../split-record.ts";

/* What the store keeps for one symbol, and how it decides a re-read is news.
 *
 * The gateway offers no ETag, no delta and no change feed — verified across
 * the whole live catalogue — so "has this changed" can only be answered by
 * fetching the document again and comparing it with the one already on disk.
 * That makes the comparison the entire mechanism, and it can fail in both
 * directions.
 *
 * Compare too much and every read looks like a change. The fundamentals
 * document carries the gateway's own "OK" and a rolling news feed alongside
 * the company record, so a company that has not moved in a year would rewrite
 * its row several times a day and the cadence would save nothing.
 *
 * Compare too little and a real revision passes unseen, which is worse: the
 * page then serves last quarter's employee count under this quarter's date
 * with nothing admitting the gap.
 *
 * So the stripped keys are enumerated rather than pattern-matched, and they
 * are stripped at the root only. `canonicalise` documents each one at the
 * point it drops it.
 *
 * Pure on purpose. The refresh worker runs outside Next and the read path runs
 * inside it; both need exactly these functions, and neither should have to
 * carry the other's runtime to get them. Hence no `server-only` import at the
 * top, unlike client.ts and reads.ts next door: that specifier resolves to an
 * empty module only under `--conditions=react-server`, so a plain `node`
 * worker or script would throw on the first line of this file before it got
 * anywhere near a hash. Nothing is lost by leaving it out — `node:crypto`
 * cannot be resolved in a browser bundle either, so a client component that
 * reached for `canonicalise` still fails at build time rather than at runtime.
 */

/* What `canonicalise` is handed, which is less obvious than it looks.
 *
 * The argument is the STORED payload — what `toStored` made of the response —
 * and never the `ApiResult` the client wrapped it in. The wrapper carries
 * `ms`, the elapsed request time (lib/api/errors.ts), which is a different
 * number on every single call: hash that and every check reports a change, the
 * row is rewritten and /api/revalidate is asked to drop a page that never
 * moved, which is precisely what the cadence exists to prevent.
 *
 * For six of the seven sections that mistake would be loud — a fundamentals
 * document nested under `data` does not resemble a company record. The analyst
 * section is the one place it would be silent, because its stored payload
 * `{ ok, status }` is a subset of the wrapper's own fields. So that section
 * gets a keep-list rather than a drop-list: handed the wrapper by accident, it
 * still hashes the two fields that are the content, and nothing else.
 *
 * Hashing the stored form is also the only answer that works for
 * `history_daily`. Its `derived` block is measured against the corporate
 * actions document, so on the day a split is finally published the bars are
 * byte-identical and the returns are not — a hash over the raw rows would
 * leave the corrected figures unwritten for as long as the bars held still.
 */

export const SECTIONS = [
  "profile",
  "news_gateway",
  "corporate_actions",
  "financials_annual",
  "history_daily",
  "short_interest",
  "analyst",
] as const;

export type Section = (typeof SECTIONS)[number];

/** What the analyst section observes: whether the door opened, and the code. */
export type AnalystObservation = { ok: boolean; status: number };

/* Five years of daily bars, stored as six parallel columns rather than as an
   array of objects.
 *
 * A row per bar repeats all six field names 1,274 times per symbol; the
 * columns name them once. Across ~4,400 names that is the difference between a
 * store that fits comfortably and one that does not.
 *
 * `opening`, `high`, `low` and `volume` are `number | null` because the feed
 * genuinely omits them on thin sessions, and a null has to survive the trip:
 * `toPricePoints` treats null as "no figure" and 0 as a price of zero, and the
 * candle it draws from the second is a lie the first would not have told. The
 * date and the close are not nullable — a row without either is not a bar, and
 * both `toPricePoints` and `returnsFrom` discard it — so such rows are dropped
 * here instead, which is what keeps the six columns the same length. */
export type HistoryColumns = {
  /** The feed's own format, "MM/DD/YYYY HH:MM:SS EDT", unparsed. */
  date: string[];
  price: number[];
  opening: Array<number | null>;
  high: Array<number | null>;
  low: Array<number | null>;
  volume: Array<number | null>;
};

/* The bars plus the figures measured across them.
 *
 * The returns ride along because the peer table needs one number per peer and
 * nothing else: attaching eight more five-year series to an instrument
 * snapshot to render eight percentages is how the flight payload became mostly
 * price history in the first place. They are measured against the corporate
 * actions the caller passes, or withheld entirely when it passes none — see
 * ../split-record.ts for why those two are not the same answer. */
export type StoredHistory = HistoryColumns & { derived: Returns };

/** What `toStored` needs beyond the document itself. */
export type StoredContext = { actions?: RawCorporateActions | null };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/* ------------------------------------------------------------------ */
/* Canonical form and hash                                             */
/* ------------------------------------------------------------------ */

/* The gateway's envelope. `status` is the literal word "OK" on every
   successful response; `request_id`/`requestId` is a fresh uuid per call. None
   of the three says anything about the company, and all three would otherwise
   make two identical answers hash differently. */
const ENVELOPE = new Set(["status", "request_id", "requestId"]);

/* The same, plus the news feed. `ticker_news` is a rolling list of the last
   few headlines about the company: it turns over through the day, it has its
   own section and its own six-hour cadence, and leaving it in the profile hash
   would make the company record look revised every time a wire moved. */
const PROFILE_DROPS = new Set([...ENVELOPE, "ticker_news"]);

/* The analyst section's two fields, named as the only two that count.
 *
 * Its whole content is an observed HTTP status — 403 today on every path this
 * account can reach — and the section exists so the panel can tell "the
 * account cannot see this" from "nobody covers this company". Strip the status
 * out of its hash and the one transition the section watches for, a 403 that
 * becomes a 200, writes nothing; so the envelope rule is inverted here rather
 * than merely waived. A keep-list, not an exemption, for the reason given at
 * the top of the file: it is also the guard against the transport wrapper
 * being hashed in place of the payload. */
const ANALYST_KEEP = new Set(["ok", "status"]);

/** Whether a root key of this section's stored payload belongs in the hash. */
function keepsRootKey(section: Section, key: string): boolean {
  if (section === "analyst") return ANALYST_KEEP.has(key);
  if (section === "profile") return !PROFILE_DROPS.has(key);
  return !ENVELOPE.has(key);
}

/* Sorted keys all the way down, arrays left in the order they arrived.
 *
 * Object key order is an accident of however the JSON happened to be
 * serialised upstream and has to be normalised away. Array order is not: the
 * splits list and the bars are sequences, and reordering one is a change. */
function canonicalValue(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalValue);

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      // JSON.stringify writes NaN and Infinity as null; settle it here so the
      // canonical form is the thing that gets hashed, not its serialisation.
      return Number.isFinite(value) ? value : null;
    case "object": {
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(src).sort()) {
        const v = src[key];
        // An absent key and a key set to undefined serialise identically, so
        // they must canonicalise identically too.
        if (v === undefined) continue;
        out[key] = canonicalValue(v);
      }
      return out;
    }
    default:
      /* undefined, functions, symbols and bigints. None survive a JSON round
         trip, so none can reach this from a parsed response; null keeps the
         hash defined rather than letting JSON.stringify throw. */
      return null;
  }
}

/**
 * A document reduced to the part worth comparing.
 *
 * Takes the payload `toStored` produced, not the `ApiResult` it came wrapped
 * in — see the note at the top of the file for what happens otherwise, and why
 * the analyst section is the only one where it would go unnoticed.
 *
 * Deep clone, object keys sorted recursively, arrays in order, and the root's
 * volatile keys removed. Root only: `ticker.last_updated_utc` is the single
 * field in the fundamentals document that actually says when Polygon revised
 * the company record, and a blanket strip of anything timestamp-shaped would
 * take it with the envelope.
 */
export function canonicalise(section: Section, raw: unknown): unknown {
  if (!isRecord(raw)) return canonicalValue(raw);

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(raw).sort()) {
    if (!keepsRootKey(section, key)) continue;
    const v = raw[key];
    if (v === undefined) continue;
    out[key] = canonicalValue(v);
  }
  return out;
}

/** sha256 of the canonical form, hex. What the store compares against. */
export function hashOf(canonical: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical) ?? "null")
    .digest("hex");
}

/* ------------------------------------------------------------------ */
/* When the source says its own data changed                           */
/* ------------------------------------------------------------------ */

function maxString(values: readonly (string | null)[]): string | null {
  let best: string | null = null;
  for (const v of values) if (v !== null && (best === null || v > best)) best = v;
  return best;
}

const rowsOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * The stamp the document carries for itself, or null where it carries none.
 *
 * Kept beside the hash rather than instead of it. It is the upstream's own
 * claim about freshness and several sections make no claim at all, so it
 * informs a reader — and a future "is this record stale" check — without ever
 * deciding whether a write happens.
 */
export function sourceUpdatedAt(section: Section, raw: unknown): string | null {
  if (section === "history_daily") {
    /* The bars' own last date, as ISO. Either the raw rows or the stored
       columns will do: both carry the feed's "MM/DD/YYYY HH:MM:SS EDT", which
       parseFeedDate is the only thing in this codebase allowed to read. */
    const dates = isRecord(raw)
      ? rowsOf(raw.date).map((d) => text(d))
      : rowsOf(raw).map((r) => (isRecord(r) ? text(r.date) : null));
    let newest: number | null = null;
    for (const d of dates) {
      const at = d === null ? null : parseFeedDate(d);
      if (at !== null && (newest === null || at > newest)) newest = at;
    }
    return newest === null ? null : new Date(newest).toISOString();
  }

  if (!isRecord(raw)) return null;

  switch (section) {
    case "profile": {
      const ticker = isRecord(raw.ticker) ? raw.ticker : null;
      const ratios = isRecord(raw.ratios) ? raw.ratios : null;
      // Polygon's own revision stamp first; the ratio snapshot's date is a
      // weaker claim about a narrower part of the document.
      return text(ticker?.last_updated_utc) ?? text(ratios?.date);
    }
    case "news_gateway":
      return maxString(
        rowsOf(raw.ticker_news).map((n) => (isRecord(n) ? text(n.published_utc) : null)),
      );
    case "financials_annual":
      return maxString(
        [...rowsOf(raw.income_statements), ...rowsOf(raw.balance_sheets), ...rowsOf(raw.cash_flow_statements)]
          .map((r) => (isRecord(r) ? text(r.filing_date) : null)),
      );
    case "short_interest":
      return maxString(
        rowsOf(raw.results).map((r) => (isRecord(r) ? text(r.settlement_date) : null)),
      );
    /* Corporate actions and the analyst observation carry no revision stamp.
       The dates in a corporate-actions document are the company's calendar —
       an ex-date three weeks out is a future event, not a claim about when the
       record was written — so reporting one here would put a timestamp in the
       future on a row that was written today. */
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* The jsonb payload the store keeps                                   */
/* ------------------------------------------------------------------ */

/**
 * The document as the store holds it.
 *
 * Deliberately close to the raw shapes: the page runs the existing normalisers
 * unchanged, so anything reshaped here is a second place where the gateway's
 * field names would have to be remembered.
 */
export function toStored(section: Section, raw: unknown, context?: StoredContext): unknown {
  switch (section) {
    case "profile": {
      if (!isRecord(raw)) return null;
      // The news travels in its own section on its own cadence.
      const out = { ...raw };
      delete out.ticker_news;
      return out;
    }
    case "news_gateway": {
      const news = isRecord(raw) ? raw.ticker_news : null;
      return { ticker_news: Array.isArray(news) ? news : [] };
    }
    case "corporate_actions":
    case "financials_annual":
    case "short_interest":
      return raw;
    case "analyst": {
      const r = isRecord(raw) ? raw : {};
      return { ok: r.ok === true, status: finite(r.status) ?? 0 };
    }
    case "history_daily":
      return storedHistory(rowsOf(raw), context);
  }
}

function storedHistory(rows: readonly unknown[], context?: StoredContext): StoredHistory {
  const date: string[] = [];
  const price: number[] = [];
  const opening: Array<number | null> = [];
  const high: Array<number | null> = [];
  const low: Array<number | null> = [];
  const volume: Array<number | null> = [];

  for (const r of rows) {
    if (!isRecord(r)) continue;
    const at = text(r.date);
    const close = finite(r.price);
    if (at === null || close === null) continue;
    date.push(at);
    price.push(close);
    opening.push(finite(r.opening));
    high.push(finite(r.high));
    low.push(finite(r.low));
    volume.push(finite(r.volume));
  }

  return {
    date,
    price,
    opening,
    high,
    low,
    volume,
    /* Measured from the RAW rows against the caller's corporate actions, which
       is what returnsAgainst insists on: it repairs and measures, or it does
       neither. The bars above stay unrepaired — the repair depends on a
       document that can change under them, and a stored series that had one
       applied could never be re-derived when it did. */
    derived: returnsAgainst(rows as readonly RawHistoryPoint[], splitRecord(context?.actions)),
  };
}

/* ------------------------------------------------------------------ */
/* Back out of the store                                               */
/* ------------------------------------------------------------------ */

/**
 * The inverse of `toStored`, back to the shapes the normalisers already take.
 *
 * Never throws. Everything here is jsonb that left the process days ago and
 * came back through Postgres and PostgREST wearing a TypeScript type; a row
 * that does not answer is a null the caller degrades on, exactly as it degrades
 * on a failed gateway call. A throw would instead take down a render that the
 * gateway path would have survived.
 */
export function fromStored(section: "profile", payload: unknown): RawFundamentals | null;
export function fromStored(section: "news_gateway", payload: unknown): RawTickerNews[] | null;
export function fromStored(section: "corporate_actions", payload: unknown): RawCorporateActions | null;
export function fromStored(section: "financials_annual", payload: unknown): RawFinancials | null;
export function fromStored(section: "history_daily", payload: unknown): RawHistoryPoint[] | null;
export function fromStored(section: "short_interest", payload: unknown): RawShortInterest | null;
export function fromStored(section: "analyst", payload: unknown): AnalystObservation | null;
export function fromStored(section: Section, payload: unknown): unknown;
export function fromStored(section: Section, payload: unknown): unknown {
  /* THE ABSENT MARKER STOPS HERE, before any section gets to interpret it.
   *
   * When the gateway answers definitely that it has nothing for a symbol — a
   * 404, or the `Invalid ticker` 400 the preferred classes get — the worker
   * records that fact so it stops asking, and the only column it has to record
   * it in is the payload: `{absent: true, status}`.
   *
   * Nothing on this side knew that, so the marker came back looking like a
   * document. A profile marker passed the "do we have a profile" gate and drew
   * a company page of blanks. Worse, because it is silent, a corporate_actions
   * marker reached splitRecord as a readable record of NO splits, and the
   * returns published off it were confidently unadjusted — a stock that split
   * ten-for-one reads about -93% for the year that way, with no dash and no
   * warning anywhere on the page.
   *
   * `null` is what "we have nothing stored" already means to every caller
   * here, and every caller already handles it. Keyed on the marker's shape
   * rather than on the word, so a real document carrying an `absent` field of
   * its own is untouched. */
  if (isRecord(payload) && payload.absent === true) return null;

  switch (section) {
    case "profile": {
      if (!isRecord(payload)) return null;
      const out = { ...payload };
      delete out.ticker_news;
      return out as unknown as RawFundamentals;
    }
    case "news_gateway": {
      if (!isRecord(payload) || !Array.isArray(payload.ticker_news)) return null;
      return payload.ticker_news as RawTickerNews[];
    }
    case "corporate_actions":
    case "financials_annual":
    case "short_interest":
      return isRecord(payload) ? payload : null;
    case "analyst": {
      if (!isRecord(payload)) return null;
      const status = finite(payload.status);
      if (typeof payload.ok !== "boolean" || status === null) return null;
      return { ok: payload.ok, status };
    }
    case "history_daily":
      return historyRows(payload);
  }
}

function historyRows(payload: unknown): RawHistoryPoint[] | null {
  if (!isRecord(payload)) return null;
  const { date, price, opening, high, low, volume } = payload;
  if (
    !Array.isArray(date) ||
    !Array.isArray(price) ||
    !Array.isArray(opening) ||
    !Array.isArray(high) ||
    !Array.isArray(low) ||
    !Array.isArray(volume)
  ) {
    return null;
  }

  /* Ragged columns are the one corruption this shape can suffer, and it would
     silently pair one bar's date with another bar's close. */
  const n = date.length;
  if (
    price.length !== n ||
    opening.length !== n ||
    high.length !== n ||
    low.length !== n ||
    volume.length !== n
  ) {
    return null;
  }

  const rows: RawHistoryPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const at = text(date[i]);
    const close = finite(price[i]);
    if (at === null || close === null) continue;
    rows.push({
      date: at,
      price: close,
      opening: finite(opening[i]),
      high: finite(high[i]),
      low: finite(low[i]),
      volume: finite(volume[i]),
    });
  }
  return rows;
}

/**
 * The returns measured when the history was stored.
 *
 * Separate from `fromStored` because it answers a different question: the bars
 * come back as bars, and this is the figure that rode with them so a peer row
 * costs no call of its own.
 */
export function derivedOf(payload: unknown): Returns | null {
  if (!isRecord(payload) || !isRecord(payload.derived)) return null;
  const d = payload.derived;
  return { ret1y: finite(d.ret1y), ret5y: finite(d.ret5y), cagr5y: finite(d.cagr5y) };
}
