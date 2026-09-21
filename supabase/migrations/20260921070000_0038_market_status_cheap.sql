-- 0038_market_status_cheap.sql — make the health read cheap enough to trust.
--
-- THE SYMPTOM: /api/sweep flipped to `failed` with
-- `store: TimeoutError` while everything it reports on was working. The route
-- gives the store eight seconds and market_status was measured at 0.6s idle,
-- 3.2s busy and 19.9s while the refresher was draining a backlog — so the one
-- endpoint that says whether the system is healthy failed precisely when the
-- system was under load, which is when somebody is reading it.
--
-- A health check that cries wolf is worse than none: it trains whoever is on
-- call to ignore it, and this one had already been ignored through a real
-- two-day outage.
--
-- THREE SEQUENTIAL SCANS, none of which had to be.
--
-- The sections block scanned 31,044 rows through the heap — 6,092 pages,
-- because `last_error` and the TOAST pointers make those rows wide — to
-- compute three counts of narrow columns. A covering index answers all three
-- from the index alone: 1,684ms to 104ms.
--
-- It also JOINED to market.symbols, purely to require `enrolled_at is not
-- null`. Measured on the live table that join excludes exactly nothing: 0
-- sections belong to an unenrolled symbol and 0 are orphaned, because
-- market_enrol is the only thing that creates a section and it sets
-- enrolled_at in the same call. The join is dropped and the fact it depended
-- on is written down here instead, where the next person to add a section
-- writer will read it.
--
-- And the quotes block scanned a 37MB table for a count and a max, because
-- `raw jsonb` makes those rows wide too. An index on swept_at answers the max
-- directly and lets the count come from an index-only scan.
--
-- Nothing about what this function REPORTS changes. Every count is the same
-- count; only the path to it is different.

-- ── The indexes ──────────────────────────────────────────────────────────────

-- Exactly the three columns the counts read, in one covering index, so the
-- aggregate never visits the heap.
create index if not exists sections_health_idx
  on market.sections (next_check_at, claimed_at, attempts);

-- `max(swept_at)` becomes a backwards index scan of one row instead of a scan
-- of every quote.
create index if not exists quotes_swept_at_idx
  on market.quotes (swept_at);

-- ── The read ─────────────────────────────────────────────────────────────────

create or replace function public.market_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_swept    bigint;
  v_quotes   integer;
  v_hot      integer;
  v_enrolled integer;
  v_due      integer;
  v_claimed  integer;
  v_erroring integer;
  v_last     bigint;
  v_hour     jsonb;
begin
  -- Split from the count so the max can take quotes_swept_at_idx; together
  -- they force one scan that serves neither well.
  select (extract(epoch from max(swept_at)) * 1000)::bigint into v_swept from market.quotes;
  select count(*) into v_quotes from market.quotes;

  select count(*) filter (where hot),
         count(*) filter (where enrolled_at is not null)
    into v_hot, v_enrolled
    from market.symbols;

  -- No join to market.symbols. It required `enrolled_at is not null`, and on
  -- the live table that excluded nothing: a section exists only because
  -- market_enrol created it, and market_enrol sets enrolled_at in the same
  -- call. Should a section ever outlive its symbol's enrolment, these three
  -- counts would include it — which is the right reading for a health check
  -- anyway, since such a row is work the queue can still claim.
  select count(*) filter (where s.next_check_at <= now()
                            and (s.claimed_at is null
                                 or s.claimed_at < now() - interval '15 minutes')),
         count(*) filter (where s.claimed_at is not null
                            and s.claimed_at >= now() - interval '15 minutes'),
         count(*) filter (where s.attempts >= 3)
    into v_due, v_claimed, v_erroring
    from market.sections s;

  select (extract(epoch from max(at)) * 1000)::bigint
    into v_last
    from market.refresh_log;

  select jsonb_build_object(
           'changed',   count(*) filter (where outcome = 'changed'),
           'unchanged', count(*) filter (where outcome = 'unchanged'),
           'error',     count(*) filter (where outcome = 'error'),
           'absent',    count(*) filter (where outcome = 'absent'))
    into v_hour
    from market.refresh_log
   where at >= now() - interval '1 hour';

  return jsonb_build_object(
    'quotesSweptAt', v_swept,
    'hotCount',      v_hot,
    'quotesCount',   v_quotes,
    'enrolled',      v_enrolled,
    'due',           v_due,
    'claimed',       v_claimed,
    'erroring',      v_erroring,
    'lastRefreshAt', v_last,
    'lastHour',      v_hour
  );
end;
$$;

comment on function public.market_status() is
  'What the health route reports: the sweep''s age, the queue''s depth and the last hour''s outcomes. Every count is served from an index — it used to scan three wide tables and took 0.6s idle, 3.2s busy and 19.9s under a draining backlog, which timed the health route out at exactly the moment somebody would be reading it.';

revoke all on function public.market_status() from public, anon, authenticated;

grant execute on function public.market_status() to service_role;
