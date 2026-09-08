/* What the cache warmer should say about itself.
 *
 * /api/sweep reported `ok: failures.length === 0`, and one of the eight things
 * it counted was "corporate actions: N of 93 failed". EA and EQR are delisted —
 * both stopped printing in August 2026, both 404 on every reference endpoint —
 * so N was permanently at least 2, so `ok` was permanently false. The flag
 * carried no information: an operator could not tell a real outage from a
 * Tuesday.
 *
 * The deeper fault was flattening a distinction the assembler already makes.
 * "Serving the committed baseline" means the whole terminal is showing week-old
 * prices. "Week history: 1 of 11 failed" means one sector card is missing its
 * week column. Both were one bit.
 *
 * Two severities, because there are exactly two operator responses: fix it now,
 * or notice it tomorrow. `ok` stays true through a degradation on purpose — a
 * monitor that pages for a quiet company is one nobody reads by the time it
 * matters.
 */

export type Severity = "fatal" | "degraded";

/** One thing that went wrong, and how much it matters. */
export type Fault = { severity: Severity; message: string };

export type Health = {
  status: "ok" | "degraded" | "failed";
  /** False only when something needs attention now. */
  ok: boolean;
};

export function health(faults: readonly Fault[]): Health {
  if (faults.some((f) => f.severity === "fatal")) return { status: "failed", ok: false };
  if (faults.length > 0) return { status: "degraded", ok: true };
  return { status: "ok", ok: true };
}

/* Past this fraction of a fan-out, the shortfall stops being a few quiet
   companies and starts being the gateway. Half is deliberately generous: the
   per-ticker lists are hand-curated large caps, so losing more than half of
   them has never once meant anything but an upstream problem. */
const TOLERANCE = 0.5;

/**
 * Classify a per-ticker fan-out that did not fully answer.
 *
 * Returns null when nothing was lost — and when nothing was asked, because a
 * fan-out that never ran is not evidence of anything.
 */
export function shortfall(
  label: string,
  failed: number,
  asked: number,
  tolerance = TOLERANCE,
): Fault | null {
  if (asked <= 0 || failed <= 0) return null;
  const severity: Severity = failed / asked > tolerance ? "fatal" : "degraded";
  return { severity, message: `${label}: ${failed} of ${asked} failed` };
}
