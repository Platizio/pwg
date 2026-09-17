import test from "node:test";
import assert from "node:assert/strict";

import { formatReport, runProbe, storeAssertions } from "../lib/api/probe.ts";
import { fail, ok } from "../lib/api/errors.ts";
import { resetEnv } from "../lib/api/env.ts";
import { resetStoreConfig } from "../lib/market/store/client.ts";
import type { StoreStatus } from "../lib/market/store/types.ts";
import type { Assertion } from "../lib/api/probe.ts";
import type { SessionPhase } from "../lib/market/session.ts";

/* How the probe judges `public.market_status()`.
 *
 * The call itself is a network read and cannot be tested here; the judgement
 * can, and it is the half that is easy to get quietly wrong. Two of these
 * thresholds encode a claim about the world rather than a number — an
 * overnight quote is old because a shut market reprints the same figures and
 * an unchanged quote is never written, not because anything stopped, so the
 * age that is alarming at 10:00 ET is ordinary at midnight and a probe failing
 * on it would teach the operator to ignore it. The rest pin arithmetic that
 * reads plausibly either way: "under 1%" is not "1%", `due` counts sections
 * while `enrolled` counts symbols, and a long queue with leases out is a
 * refresher working rather than one that has stopped.
 *
 * The last test is the exception, and it drives `runProbe` itself: whether an
 * absent store is skipped is a property of the report rather than of the
 * assertions, and the skip path returns before it would reach the network.
 */

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 8, 16, 14, 30, 0); // 10:30 ET, regular session

const healthy = (over: Partial<StoreStatus> = {}): StoreStatus => ({
  quotesSweptAt: NOW - 2 * MINUTE,
  hotCount: 4_400,
  quotesCount: 4_400,
  enrolled: 4_400,
  due: 12,
  claimed: 8,
  erroring: 3,
  lastRefreshAt: NOW - MINUTE,
  lastHour: { changed: 120, unchanged: 3_900, error: 4, absent: 1 },
  ...over,
});

const find = (list: Assertion[], label: string): Assertion => {
  const hit = list.find((x) => x.label === label);
  assert.ok(hit, `no assertion labelled "${label}" in: ${list.map((x) => x.label).join(", ")}`);
  return hit;
};

const at = (s: StoreStatus, phase: SessionPhase) => storeAssertions(ok(s, 200, 40), phase, NOW);
const moving = (s: StoreStatus) => at(s, "open");
const shut = (s: StoreStatus) => at(s, "closed");

test("a healthy status passes every assertion", () => {
  const list = moving(healthy());
  assert.ok(list.length >= 5, `${list.length} assertions`);
  assert.deepEqual(
    list.filter((x) => !x.ok),
    [],
  );
  /* Every line of the report has to be readable on its own — a bare `false`
     beside a label tells an operator nothing about what to do next. */
  assert.ok(list.every((x) => x.detail.trim().length > 0));
});

test("a store that did not answer reports that, and nothing else", () => {
  const list = storeAssertions(fail("rpc market_status 404", 404, 30), "open", NOW);
  assert.equal(list.length, 1);
  assert.equal(list[0].ok, false);
  assert.match(list[0].detail, /404/);
});

test("a 200 with no body is not a healthy store", () => {
  const list = storeAssertions(ok(null as unknown as StoreStatus, 200, 30), "open", NOW);
  assert.equal(list.length, 1);
  assert.equal(list[0].ok, false);
});

test("while prices move the sweep must be under six minutes old", () => {
  assert.equal(find(moving(healthy({ quotesSweptAt: NOW - 5 * MINUTE })), "quote sweep is recent").ok, true);
  assert.equal(find(moving(healthy({ quotesSweptAt: NOW - 7 * MINUTE })), "quote sweep is recent").ok, false);
});

test("a shut market is not a stale store", () => {
  /* The same age, judged twice. The overnight sweeps do run — the hot list
     half-hourly — but a shut market reprints the same quote and an unchanged
     quote is never written, so swept_at stops advancing at the close. Failing
     on that would be the probe crying wolf every night. */
  const old = healthy({ quotesSweptAt: NOW - 70 * MINUTE });
  assert.equal(find(moving(old), "quote sweep is recent").ok, false);

  const shutCheck = find(shut(old), "quote sweep is recent");
  assert.equal(shutCheck.ok, true);
  assert.match(shutCheck.detail, /shut|closed/i);

  assert.equal(find(shut(healthy({ quotesSweptAt: NOW - 100 * MINUTE })), "quote sweep is recent").ok, false);
});

test("pre-market and post-market are judged as a moving market", () => {
  /* The assertion that `pricesMove(phase)` is doing the work rather than
     `phase === "open"`, which agrees with it on exactly the two phases every
     other test here uses. Both of these print — thinly, but they print — so the
     six-minute bound applies, and reading them as shut would hide a dead
     refresher through four hours of every trading day. */
  for (const phase of ["pre-market", "post-market"] as const) {
    const fresh = find(at(healthy({ quotesSweptAt: NOW - 5 * MINUTE }), phase), "quote sweep is recent");
    assert.equal(fresh.ok, true, phase);
    assert.match(fresh.detail, /moving/i);

    const stale = find(at(healthy({ quotesSweptAt: NOW - 7 * MINUTE }), phase), "quote sweep is recent");
    assert.equal(stale.ok, false, phase);

    /* The figure, not just the verdict: an hour-old sweep is fine at midnight
       and a dead refresher at 08:00 ET. */
    assert.match(stale.detail, /limit 6m/);
  }
});

test("a store that has never been swept fails in both phases", () => {
  assert.equal(find(moving(healthy({ quotesSweptAt: null })), "quote sweep is recent").ok, false);
  assert.equal(find(shut(healthy({ quotesSweptAt: null })), "quote sweep is recent").ok, false);
});

test("an empty store is reported as empty rather than as healthy", () => {
  const list = moving(healthy({ enrolled: 0, due: 0, erroring: 0, quotesCount: 0 }));
  assert.equal(find(list, "symbols are enrolled").ok, false);
});

test("erroring is under one percent, not at it", () => {
  assert.equal(find(moving(healthy({ enrolled: 1_000, erroring: 9 })), "few sections are erroring").ok, true);
  assert.equal(find(moving(healthy({ enrolled: 1_000, erroring: 10 })), "few sections are erroring").ok, false);
  /* Nothing erroring is healthy whatever the denominator does. */
  assert.equal(find(moving(healthy({ enrolled: 0, erroring: 0 })), "few sections are erroring").ok, true);
});

test("a deep queue with nothing claiming it is a stopped refresher", () => {
  const keepingUp = (over: Partial<StoreStatus>) =>
    find(moving(healthy(over)), "the refresher is keeping up").ok;

  assert.equal(keepingUp({ enrolled: 4_400, due: 4_399, claimed: 0 }), true);
  assert.equal(keepingUp({ enrolled: 4_400, due: 4_400, claimed: 0 }), false);
  assert.equal(keepingUp({ enrolled: 0, due: 0, claimed: 0 }), true);

  /* The hours after a bootstrap, which is the one time the queue is legitimately
     the length of the whole enrolment: ~26,000 section rows behind 4,400
     symbols, all of them due inside the twenty-minute spread, and a worker
     holding sixty leases at a time as it drains them. Failing here would paint
     the probe red through exactly the window an operator is watching it. */
  assert.equal(keepingUp({ enrolled: 4_400, due: 26_000, claimed: 60 }), true);
  /* The same queue with every lease expired — the worker died mid-drain. */
  assert.equal(keepingUp({ enrolled: 4_400, due: 26_000, claimed: 0 }), false);
});

test("an unconfigured store is skipped, and a skip is neither passed nor failed", async () => {
  /* The brief's headline behaviour, and it can only be seen from the whole
     report: `storeAssertions` never runs on this path. The check returns before
     `readStatus`, so nothing here opens a socket — the ViewTrade values below
     exist only because `env()` is the first thing `runProbe` does and it throws
     on a missing one. */
  /* Through a mutable view, because src/env.d.ts declares the Supabase names
     `readonly` on purpose — application code has no business writing them. A
     test that has to unset a developer's own configuration to be deterministic
     is the one place that cast is honest, and it is undone below. */
  const bag = process.env as Record<string, string | undefined>;
  const saved = { ...bag };
  delete bag.SUPABASE_URL;
  delete bag.NEXT_PUBLIC_SUPABASE_URL;
  delete bag.SUPABASE_SERVICE_ROLE_KEY;
  bag.VIEWTRADE_GATEWAY = "https://gateway.invalid";
  bag.VIEWTRADE_API_KEY = "probe-test";
  bag.VIEWTRADE_API_SECRET = "probe-test";
  resetEnv();
  resetStoreConfig();

  try {
    const report = await runProbe(["store"]);
    assert.equal(report.checks.length, 1, "--only=store selects exactly the store check");

    const [store] = report.checks;
    assert.equal(store.id, "store");
    assert.equal(store.skipped, true);
    assert.equal(store.error, undefined);
    assert.deepEqual(store.assertions, [], "a skip asserts nothing");
    assert.match(store.detail, /SUPABASE_URL/);

    /* Neither column, which is the entire point of the flag. scripts/probe.mts
       ends on `process.exit(report.failed)`, and a skip counted as a pass would
       print a green line claiming a healthy store that does not exist. */
    assert.equal(report.passed, 0);
    assert.equal(report.failed, 0);
    assert.equal(report.skipped, 1);

    const text = formatReport(report);
    const row = text.split("\n").find((l) => l.includes("store"));
    assert.match(row ?? "", /^\s*SKIP/, text);
    assert.match(text, /0 passed · 0 failed · 1 skipped/);
  } finally {
    for (const k of Object.keys(bag)) if (!(k in saved)) delete bag[k];
    Object.assign(bag, saved);
    resetEnv();
    resetStoreConfig();
  }
});
