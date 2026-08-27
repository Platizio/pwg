import "server-only";
import { vtGet } from "../http.ts";
import type { ApiResult } from "../errors.ts";

/* /mdp/api/v1/aggregation/analyst-ratings/* — written ahead of the entitlement.

   Every analyst path on this account answers 403 with code 4031: ratings,
   forecasts, estimates, targets, earnings, ownership, institutional. The
   middleware's TipRanks consensus refuses earlier still, at the headers. A 403
   rather than a 404 means the endpoints are there and the account is simply
   not entitled, so none of this can be exercised today and the Analyst view on
   the performance panel says so rather than filling itself.

   The shape below is transcribed from the catalogue, not from a live response,
   which is why every field is optional: what the gateway wraps the record in
   cannot be confirmed while the door is shut, and a partial match should leave
   a panel empty rather than throw. The probe's `blocked.analysts` tripwire
   watches the 403 and fails the day it lifts — that is the moment to point a
   normalizer at this module and check the shape against a real body. */

export type RawAnalystConsensus = {
  ticker?: string;
  company_name?: string;
  /** A label — "Strong Buy", "Hold" — rather than a score. */
  consensus?: string | null;
  /** The analyst counts the label is drawn from. */
  buy?: number | null;
  hold?: number | null;
  sell?: number | null;
  total_analysts?: number | null;
  /** The consensus target, and the range the individual targets span. */
  price_target?: number | null;
  low_price_target?: number | null;
  high_price_target?: number | null;
  /* Documented as the upside from the last price to the consensus target.
     Whether it arrives as 12.4 or as 0.124 is unknown until the endpoint
     opens, and the gateway is inconsistent about that elsewhere, so the figure
     needs confirming against a real body before any panel prints it. */
  price_target_upside?: number | null;
  price_target_currency_code?: string | null;
};

/* Routed through vtGet like every other client, so today's 403 arrives as
   `ok: false, status: 403` and composes with the instrument fan-out rather
   than taking a page down with it. */
export function fetchAnalystConsensus(
  ticker: string,
  revalidate: number,
  tags: string[],
  noStore = false,
): Promise<ApiResult<RawAnalystConsensus>> {
  return vtGet<RawAnalystConsensus>(
    `/mdp/api/v1/aggregation/analyst-ratings/${encodeURIComponent(ticker)}`,
    { revalidate, tags, noStore },
  );
}
