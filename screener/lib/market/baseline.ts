import file from "./data/baseline.json" with { type: "json" };
import type { Snapshot, SweepRow } from "../api/sweep.ts";

/* The cold-start baseline.

   A full sweep is two hundred and seventy-odd calls and about five seconds.
   In steady state a cron keeps the cache warm and nobody waits, but the first
   request after a deploy finds nothing and pays for all of it. This is one
   real sweep, committed, so that request has something true to render.

   It is real data that was once true. That is the entire distinction between
   this and the seeded mock the terminal was built on, and it is why every
   panel built from it is flagged stale and carries the timestamp below. A
   plausible wrong price is worse than a blank one; a real price with a date on
   it is neither. */

type BaselineFile = {
  builtAt: string;
  sweptAt: number;
  rows: SweepRow[];
};

/* Statically imported so the bundler carries it into the deployment; a
   dynamic read would resolve to nothing on a serverless filesystem, and an
   ESM require() would simply be undefined. An empty file yields null, which
   every caller already handles. */
const data = file as BaselineFile;

function load(): BaselineFile | null {
  return Array.isArray(data?.rows) && data.rows.length > 0 ? data : null;
}

/** The committed sweep, or null when none has been built. */
export function baselineSnapshot(): Snapshot | null {
  const file = load();
  if (!file) return null;

  return {
    rows: file.rows,
    sweptAt: file.sweptAt,
    requested: file.rows.length,
    calls: 0,
    failedChunks: 0,
    missing: 0,
    ms: 0,
  };
}

/** The sentence a panel shows when it is drawn from the baseline. */
export function describeBaseline(): string | null {
  const file = load();
  if (!file) return null;
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(file.sweptAt);
  return `Showing the last sweep taken on ${when} UTC — the live feed has not answered yet.`;
}
