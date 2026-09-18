-- Tests for 0031 — the market store.
--
-- Every assertion below runs against a row that actually exists, per the house
-- rule 0028 exists to enforce: a CHECK or a WHERE is only evaluated against rows
-- a statement touches, so a test that asserts about an empty table reports
-- success whether or not the code under it works. The fixture is therefore built
-- through the RPCs themselves rather than by INSERT, which has the second
-- benefit that every function body here is executed at least once — plpgsql only
-- plans the SQL inside a function when that function runs, so an unexercised RPC
-- is an unparsed RPC.
--
-- The four assertions that cannot write a row are the RLS and grant checks: they
-- read the catalogue, because that is where the fact lives. They are first so a
-- failure there reads as "the migration did not apply" rather than as a cascade.
--
-- Symbols are ZTST*: real tickers would collide with whatever the project holds
-- and make the file's result depend on the state of the database rather than on
-- the code.

begin;

select plan(45);

-- ── The schema is shut ──────────────────────────────────────────────────────

select ok(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'market' and c.relname = 'symbols'),
  'row level security is enabled on market.symbols'
);

select ok(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'market' and c.relname = 'quotes'),
  'row level security is enabled on market.quotes'
);

select ok(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'market' and c.relname = 'sections'),
  'row level security is enabled on market.sections'
);

select ok(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'market' and c.relname = 'refresh_log'),
  'row level security is enabled on market.refresh_log'
);

-- The one that catches the mistake documented in 0029: revoking from the two
-- named roles leaves Postgres's default grant to PUBLIC in place, and the
-- function stays reachable by a browser holding the anon key.
select ok(
  not has_function_privilege('anon', 'public.market_instrument(text)', 'execute'),
  'anon cannot execute public.market_instrument — market data is not anonymously readable'
);

-- ── The universe ────────────────────────────────────────────────────────────

select is(
  public.market_seed_symbols($$[
    {"symbol": "ZTSTA", "name": "Zeta Test A", "exchange": "NASDAQ", "tradable": true},
    {"symbol": "ZTSTB", "name": "Zeta Test B", "exchange": "NYSE",   "tradable": true}
  ]$$::jsonb),
  2,
  'market_seed_symbols writes both rows'
);

-- ── Quotes, and the closed-market clause ────────────────────────────────────

select is(
  (public.market_upsert_quotes(jsonb_build_array(jsonb_build_object(
     's', 'ZTSTA', 'name', 'Zeta Test A', 'px', 101.5, 'chg', 1.25, 'chgKnown', true,
     'vol', 1000, 'avgVol', 900, 'dollarVol', 101500, 'relVol', 1.11,
     'mcap', 1000000, 'pe', 20, 'ex', 'NASDAQ', 'asOf', 1757923200000, 'delayed', true,
     'raw', jsonb_build_object('symbol', 'ZTSTA', 'lastPrice', 101.5)
   ))) ->> 'upserted')::int,
  1,
  'market_upsert_quotes writes a new quote'
);

-- The same reading again is what a closed market looks like. If this ever reads
-- upserted, every five-minute sweep between the US close and the next open is
-- rewriting 4,400 rows and swept_at is lying about freshness.
select is(
  (public.market_upsert_quotes(jsonb_build_array(jsonb_build_object(
     's', 'ZTSTA', 'name', 'Zeta Test A', 'px', 101.5, 'chg', 1.25, 'chgKnown', true,
     'vol', 1000, 'avgVol', 900, 'dollarVol', 101500, 'relVol', 1.11,
     'mcap', 1000000, 'pe', 20, 'ex', 'NASDAQ', 'asOf', 1757923200000, 'delayed', true,
     'raw', jsonb_build_object('symbol', 'ZTSTA', 'lastPrice', 101.5)
   ))) ->> 'unchanged')::int,
  1,
  'and an identical sweep writes nothing at all'
);

select is(
  (public.market_upsert_quotes(jsonb_build_array(jsonb_build_object(
     's', 'ZTSTB', 'name', 'Zeta Test B', 'px', 42.5, 'chg', -0.5, 'chgKnown', true,
     'vol', 500, 'avgVol', 400, 'dollarVol', 21250, 'relVol', 1.25,
     'mcap', 250000, 'pe', 11, 'ex', 'NYSE', 'asOf', 1757923200000, 'delayed', true,
     'raw', jsonb_build_object('symbol', 'ZTSTB', 'lastPrice', 42.5)
   ))) ->> 'upserted')::int,
  1,
  'and the peer gets a quote of its own'
);

-- The return value is the size of the hot set, and the sweep logs it as its own
-- receipt. It is deterministic whatever the table held before the call, because
-- the function rewrites hot across every row: afterwards exactly the named
-- symbols that exist are hot.
select is(
  public.market_set_hot(array['ZTSTA']),
  1,
  'market_set_hot reports the size of the hot set it just computed'
);

select is(
  (select s.hot from market.symbols s where s.symbol = 'ZTSTA'),
  true,
  'and the named symbol is the one in it'
);

-- ── Enrolment and the lease ─────────────────────────────────────────────────

select is(
  public.market_enrol(
    array['ZTSTA'],
    array['profile', 'corporate_actions', 'history_daily', 'financials_annual'],
    2),
  4,
  'market_enrol opens a queue row per section'
);

-- Enrolment spreads next_check_at over twenty minutes, so nothing is due yet.
-- Pulling it into the past is the fixture, not a shortcut around the predicate.
update market.sections set next_check_at = now() - interval '1 minute'
 where symbol = 'ZTSTA';

select is(
  (select j ->> 'symbol' from public.market_claim_due(10, array['profile']) as j),
  'ZTSTA',
  'market_claim_due hands back the due row'
);

select is(
  (select s.attempts from market.sections s
    where s.symbol = 'ZTSTA' and s.section = 'profile'),
  1,
  'and counts the attempt'
);

select ok(
  (select s.claimed_at is not null from market.sections s
    where s.symbol = 'ZTSTA' and s.section = 'profile'),
  'and takes the lease'
);

select is_empty(
  $$ select * from public.market_claim_due(10, array['profile']) $$,
  'so a second claim a moment later finds nothing — two workers cannot take the same job'
);

-- ── Completion: unchanged writes almost nothing ─────────────────────────────

select is(
  (public.market_complete('ZTSTA', 'profile', null, 'hash-1', false, null,
                          now() + interval '1 day', 12, null) ->> 'version')::int,
  0,
  'an unchanged completion leaves the version where it was'
);

-- Null in, null out. This says less than it looks like it does — the section has
-- no payload yet, so it cannot prove one would survive. The assertion that does
-- is further down, after a payload has actually been stored.
select ok(
  (select s.payload is null from market.sections s
    where s.symbol = 'ZTSTA' and s.section = 'profile'),
  'and does not invent a payload out of the null it was handed'
);

select is(
  (select s.unchanged_streak from market.sections s
    where s.symbol = 'ZTSTA' and s.section = 'profile'),
  1,
  'and counts the streak the cadence stretches on'
);

-- ── Completion: changed writes the payload and bumps the version ────────────

select is(
  (public.market_complete(
     'ZTSTA', 'profile',
     jsonb_build_object('related_companies', jsonb_build_array(
       jsonb_build_object('ticker', 'ZTSTB'))),
     'hash-2', true, null, now() + interval '1 day', 15, null) ->> 'version')::int,
  1,
  'a changed completion bumps the version the cache tag turns on'
);

select is(
  (select s.payload -> 'related_companies' -> 0 ->> 'ticker' from market.sections s
    where s.symbol = 'ZTSTA' and s.section = 'profile'),
  'ZTSTB',
  'and stores what it was given'
);

-- And now the invariant the store rests on, asserted against a section that has
-- something to lose. In production every unchanged completion carries a null
-- payload — the worker compared hashes and has nothing new to send — so an
-- unchanged branch that assigned p_payload would blank every stored section on
-- its next unchanged check, quietly, one section at a time. The pair above cannot
-- see that: the section was null going in, so null-in/null-out passes either way.
select is(
  (public.market_complete('ZTSTA', 'profile', null, 'hash-2', false, null,
                          now() + interval '1 day', 8, null) ->> 'version')::int,
  1,
  'a later unchanged completion leaves the version where the change left it'
);

select is(
  (select s.payload -> 'related_companies' -> 0 ->> 'ticker' from market.sections s
    where s.symbol = 'ZTSTA' and s.section = 'profile'),
  'ZTSTB',
  'and leaves the stored payload standing — an unchanged check must never blank it'
);

-- ── A new split invalidates what was measured against the old record ────────

update market.sections set next_check_at = now() + interval '1 day'
 where symbol = 'ZTSTA' and section in ('history_daily', 'financials_annual');

select public.market_complete(
  'ZTSTA', 'corporate_actions',
  jsonb_build_object('dividends', jsonb_build_array(), 'splits', jsonb_build_array(
    jsonb_build_object('execution_date', '2026-06-01', 'split_from', 1, 'split_to', 10))),
  'hash-ca', true, null, now() + interval '1 day', 5, null);

select ok(
  (select s.next_check_at <= now() from market.sections s
    where s.symbol = 'ZTSTA' and s.section = 'history_daily'),
  'a changed corporate_actions makes the daily history due immediately'
);

-- ── Pull-through: a symbol nobody has ever fetched ──────────────────────────

select lives_ok(
  $$ select public.market_touch_visit('ZTSTC') $$,
  'market_touch_visit accepts a symbol the store has never heard of'
);

select is(
  (select s.priority from market.symbols s where s.symbol = 'ZTSTC'),
  2,
  'and inserts it at visited priority'
);

select is(
  (select count(*)::int from market.sections s where s.symbol = 'ZTSTC'),
  6,
  'and enrols six sections'
);

select is_empty(
  $$ select 1 from market.sections where symbol = 'ZTSTC' and section = 'news_gateway' $$,
  'but not the news gateway — those three articles are only read on the wire strip'
);

-- ── Fixture for the read path ───────────────────────────────────────────────

select public.market_seed_symbols(
  $$[{"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust", "exchange": "ARCX", "tradable": true}]$$::jsonb);
select public.market_enrol(array['SPY'], array['history_daily'], 3);
select public.market_complete(
  'SPY', 'history_daily',
  jsonb_build_object(
    'date',   jsonb_build_array('01/02/2026 16:00:00 EST'),
    'price',  jsonb_build_array(500.25),
    'volume', jsonb_build_array(90000000)),
  'hash-spy', true, null, now() + interval '1 day', 9, null);

select public.market_enrol(array['ZTSTB'], array['history_daily', 'news_gateway'], 1);

-- Twelve sessions so the ten-bar slice has something to leave behind.
select public.market_complete(
  'ZTSTB', 'history_daily',
  jsonb_build_object(
    'date',    (select jsonb_agg(to_char(date '2026-01-01' + g, 'MM/DD/YYYY') || ' 16:00:00 EST' order by g)
                  from generate_series(1, 12) g),
    'price',   (select jsonb_agg((40 + g)::numeric order by g) from generate_series(1, 12) g),
    'opening', (select jsonb_agg((39 + g)::numeric order by g) from generate_series(1, 12) g),
    'high',    (select jsonb_agg((41 + g)::numeric order by g) from generate_series(1, 12) g),
    'low',     (select jsonb_agg((38 + g)::numeric order by g) from generate_series(1, 12) g),
    'volume',  (select jsonb_agg((1000 * g)::numeric order by g) from generate_series(1, 12) g),
    'derived', jsonb_build_object('ret1y', 12.5)),
  'hash-b-hist', true, null, now() + interval '1 day', 7, null);

select public.market_complete(
  'ZTSTB', 'news_gateway',
  jsonb_build_object('ticker_news', jsonb_build_array(
    jsonb_build_object('title', 'Zeta Test B reports'))),
  'hash-b-news', true, null, now() + interval '1 day', 3, null);

-- ── One instrument page, one call ───────────────────────────────────────────

create temp table instrument_probe as select public.market_instrument('ZTSTA') as j;

-- These two asserted the opposite until 0033, which took the benchmark out of
-- this answer: SPY's five years of bars are identical on every instrument page,
-- so shipping them inside all ~500 of them cost 86KB of the 213KB each returned.
-- The series is read once through market_sections and joined by the caller
-- (lib/market/store/reads.ts). Asserting the ABSENCE is what stops it coming
-- back: a future edit that re-adds the join would otherwise pass every test
-- here and quietly restore the payload that timed the deployed reads out.
select ok(
  (select not (j ? 'market') from instrument_probe),
  'market_instrument does not carry the SPY benchmark — 0033 moved it to a shared read'
);

select is(
  (select public.market_sections(array['SPY'], 'history_daily') -> 0 ->> 'symbol'),
  'SPY',
  'and market_sections is where the benchmark series comes from instead'
);

select is(
  (select j -> 'row' ->> 'px' from instrument_probe),
  '101.5',
  'and projects the quote back into the SweepRow shape the page already takes'
);

select is(
  (select j -> 'peers' -> 0 ->> 's' from instrument_probe),
  'ZTSTB',
  'and lists the related company as a priced peer'
);

select is(
  (select j -> 'peers' -> 0 ->> 'ret1y' from instrument_probe),
  '12.5',
  'carrying the one-year return derived when its history was stored'
);

-- ── One landing page, one call ──────────────────────────────────────────────

create temp table home_probe as
  select public.market_home(array['ZTSTB'], array['ZTSTB'], array['ZTSTA']) as j;

select is(
  (select jsonb_array_length(j -> 'rows') from home_probe),
  1,
  'market_home ranks from the hot set alone'
);

select is(
  (select j -> 'rows' -> 0 ->> 's' from home_probe),
  'ZTSTA',
  'and that is the symbol market_set_hot marked'
);

select is(
  (select j -> 'strip' -> 0 ->> 'symbol' from home_probe),
  'ZTSTB',
  'the strip hands back the raw quote, in the order the page asked for'
);

select is(
  (select jsonb_array_length(j -> 'weekBars' -> 'ZTSTB') from home_probe),
  10,
  'weekBars slices the last ten sessions out of the columnar history'
);

select is(
  (select j -> 'weekBars' -> 'ZTSTB' -> 9 ->> 'price' from home_probe),
  '52',
  'and the last of them is the most recent bar, not the oldest'
);

select is(
  (select j -> 'wire' -> 0 -> 'news' -> 0 ->> 'title' from home_probe),
  'Zeta Test B reports',
  'the wire carries the gateway articles for the named tickers'
);

select is(
  (select j -> 'calendar' -> 0 ->> 'ticker' from home_probe),
  'ZTSTA',
  'and the calendar carries the corporate actions for its own'
);

-- ── Batch read and health ───────────────────────────────────────────────────

select is(
  public.market_sections(array['ZTSTA', 'ZTSTC'], 'profile') -> 0 ->> 'symbol',
  'ZTSTA',
  'market_sections returns only the symbols that have a payload'
);

select is(
  (public.market_status() ->> 'enrolled')::int,
  (select count(*)::int from market.symbols where enrolled_at is not null),
  'market_status reports the enrolled count'
);

-- ── Retention ───────────────────────────────────────────────────────────────

insert into market.refresh_log (symbol, section, outcome, changed, at) values
  ('ZTPURGE', 'profile', 'unchanged', false, now() - interval '8 days'),
  ('ZTPURGE', 'profile', 'unchanged', false, now());

select ok(
  (private.purge_expired_records() ->> 'marketRefreshLog')::int >= 1,
  'the nightly purge counts the refresh log rows it removed'
);

select is_empty(
  $$ select 1 from market.refresh_log
      where symbol = 'ZTPURGE' and at < now() - interval '7 days' $$,
  'the eight-day-old row is gone'
);

select isnt_empty(
  $$ select 1 from market.refresh_log where symbol = 'ZTPURGE' $$,
  'and today''s is kept'
);

select * from finish();

rollback;
