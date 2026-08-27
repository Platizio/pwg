/* An independent opinion on the numbers.

   Everything else in this codebase checks the gateway against itself: that
   changePercent agrees with change over the previous close, that market cap is
   in the units we think. All of that would still pass if the gateway handed us
   the right shape for the wrong company, or a price three days old, or a value
   scaled by a hundred.

   So this asks somebody else. Yahoo's public chart endpoint is not a
   dependency of the product — nothing renders from it — it is a second witness
   used by the probe, and disagreement is a finding rather than an error. */

export type CrossCheck = {
  symbol: string;
  ours: number;
  theirs: number | null;
  /** Signed difference as a percentage of the independent price. */
  diffPct: number;
  ok: boolean;
  note: string;
};

export function compareQuote(
  symbol: string,
  ours: number,
  theirs: number | null,
  tolerancePct: number,
): CrossCheck {
  if (theirs === null || !Number.isFinite(theirs) || theirs <= 0) {
    return {
      symbol,
      ours,
      theirs: null,
      diffPct: Number.NaN,
      ok: false,
      note: "no independent price available",
    };
  }

  const diffPct = ((ours - theirs) / theirs) * 100;
  const ok = Math.abs(diffPct) <= tolerancePct;

  return {
    symbol,
    ours,
    theirs,
    diffPct,
    ok,
    note: ok
      ? "agrees"
      : `differs by ${diffPct.toFixed(1)}% (ours ${ours}, independent ${theirs})`,
  };
}

type YahooChart = {
  chart?: {
    result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }>;
  };
};

/** One independent last price, or null. Never throws: an unreachable second
    witness is a check we could not run, not a failure of the product. */
export async function independentPrice(symbol: string): Promise<number | null> {
  // Yahoo writes class shares with a dash where the gateway uses a dot.
  const encoded = encodeURIComponent(symbol.replace(/\./g, "-"));
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=1d&interval=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as YahooChart;
    const meta = body.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? meta?.chartPreviousClose;
    return typeof price === "number" && Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

type YahooSeries = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { adjclose?: Array<{ adjclose?: Array<number | null> }> };
    }>;
  };
};

/** An independent trailing one-year total return, in percent, or null.

    Uses the adjusted close, which is what makes it a fair comparison: the
    point of this check is that our own series is not adjusted unless we
    adjust it. */
export async function independentYearReturn(symbol: string): Promise<number | null> {
  const encoded = encodeURIComponent(symbol.replace(/\./g, "-"));
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=1y&interval=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as YahooSeries;
    const closes = (body.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose ?? []).filter(
      (v): v is number => typeof v === "number" && v > 0,
    );
    if (closes.length < 2) return null;
    return (closes[closes.length - 1] / closes[0] - 1) * 100;
  } catch {
    return null;
  }
}

/** An independent five-year compound annual rate, in percent, or null.

    The one-year check alone is not enough. When every split on record was
    being applied blindly, one-year returns still agreed — the damage was all
    in the older half of the series — while five-year figures were out by a
    factor of ten. Whatever is wrong with a price history tends to show up
    first at the far end of it. */
export async function independentFiveYearCagr(symbol: string): Promise<number | null> {
  const encoded = encodeURIComponent(symbol.replace(/\./g, "-"));
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5y&interval=1mo`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as YahooSeries;
    const closes = (body.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose ?? []).filter(
      (v): v is number => typeof v === "number" && v > 0,
    );
    if (closes.length < 24) return null;
    const years = (closes.length - 1) / 12;
    return ((closes[closes.length - 1] / closes[0]) ** (1 / years) - 1) * 100;
  } catch {
    return null;
  }
}
