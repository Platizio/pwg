-- Tests for 0034 — the landing page's stored answer.
--
-- Same discipline as 0032's file: the fixture is built through the RPCs, so
-- every function body runs at least once and every assertion is made against a
-- row that exists. Symbols are ZTST* so the result depends on the code and not
-- on what the project happens to hold.
--
-- The assertion that matters most is the pair in the middle: after a build, a
-- changed quote is NOT visible through market_home until the next build. That
-- is the whole point of the row — the read is a fetch, not an aggregate — and
-- it is also the property a careless "fix" would remove by making market_home
-- recompute whenever it felt stale.

begin;

select plan(21);

-- ── Shut ────────────────────────────────────────────────────────────────────

select ok(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'market' and c.relname = 'home'),
  'row level security is enabled on market.home'
);

select ok(
  not has_function_privilege('anon', 'public.market_build_home(text[])', 'execute'),
  'anon cannot execute public.market_build_home'
);

-- ── Fixture, through the RPCs ───────────────────────────────────────────────

select is(
  public.market_seed_symbols($$[
    {"symbol": "ZTSTA", "name": "Zeta Test A", "exchange": "NASDAQ", "tradable": true},
    {"symbol": "ZTSTB", "name": "Zeta Test B", "exchange": "NYSE",   "tradable": true}
  ]$$::jsonb),
  2,
  'two symbols seeded'
);

select is(
  (public.market_upsert_quotes(jsonb_build_array(jsonb_build_object(
     's', 'ZTSTA', 'name', 'Zeta Test A', 'px', 101.5, 'chg', 1.25, 'chgKnown', true,
     'vol', 1000, 'avgVol', 900, 'dollarVol', 101500, 'relVol', 1.11,
     'mcap', 1000000, 'pe', 20, 'ex', 'NASDAQ', 'asOf', 1757923200000, 'delayed', true,
     'raw', jsonb_build_object('symbol', 'ZTSTA', 'lastPrice', 101.5)
   ))) ->> 'upserted')::int,
  1,
  'ZTSTA quoted'
);

select is(
  (public.market_upsert_quotes(jsonb_build_array(jsonb_build_object(
     's', 'ZTSTB', 'name', 'Zeta Test B', 'px', 42.5, 'chg', -0.5, 'chgKnown', true,
     'vol', 500, 'avgVol', 400, 'dollarVol', 21250, 'relVol', 1.25,
     'mcap', 250000, 'pe', 11, 'ex', 'NYSE', 'asOf', 1757923200000, 'delayed', true,
     'raw', jsonb_build_object('symbol', 'ZTSTB', 'lastPrice', 42.5)
   ))) ->> 'upserted')::int,
  1,
  'ZTSTB quoted'
);

select ok(
  public.market_set_hot(array['ZTSTA']) is not null,
  'ZTSTA is the hot set'
);

-- ── Before any build: live, as before ───────────────────────────────────────

select is(
  (select count(*) from market.home)::int,
  0,
  'no blob has been built yet'
);

select is(
  (select jsonb_array_length(public.market_home(array['ZTSTB'], '{}', '{}') -> 'rows')),
  1,
  'and market_home still answers, computing the core live'
);

-- ── The build ───────────────────────────────────────────────────────────────

create temp table build_probe as
  select public.market_build_home(array['ZTSTB']) as j;

select is(
  (select (j ->> 'rows')::int from build_probe),
  1,
  'market_build_home reports the hot rows it stored'
);

select is(
  (select count(*) from market.home)::int,
  1,
  'one row, and only ever one'
);

select is(
  (select strip from market.home where id = 1),
  array['ZTSTB'],
  'carrying the strip it was built for'
);

create temp table read_probe as
  select public.market_home(array['ZTSTB'], '{}', '{}') as j;

select is(
  (select j -> 'strip' -> 0 ->> 'symbol' from read_probe),
  'ZTSTB',
  'the read hands back the strip in the order asked'
);

select is(
  (select j -> 'rows' -> 0 ->> 's' from read_probe),
  'ZTSTA',
  'and the hot row'
);

-- ── The read is a fetch, not an aggregate ───────────────────────────────────

select is(
  (public.market_upsert_quotes(jsonb_build_array(jsonb_build_object(
     's', 'ZTSTA', 'name', 'Zeta Test A', 'px', 200, 'chg', 1.25, 'chgKnown', true,
     'vol', 1000, 'avgVol', 900, 'dollarVol', 200000, 'relVol', 1.11,
     'mcap', 1000000, 'pe', 20, 'ex', 'NASDAQ', 'asOf', 1757923260000, 'delayed', true,
     'raw', jsonb_build_object('symbol', 'ZTSTA', 'lastPrice', 200)
   ))) ->> 'upserted')::int,
  1,
  'a later sweep moves ZTSTA'
);

select is(
  (select (public.market_home(array['ZTSTB'], '{}', '{}') -> 'rows' -> 0 ->> 'px')::numeric),
  101.5,
  'but market_home still answers from the blob until it is rebuilt'
);

select ok(
  public.market_build_home(array['ZTSTB']) is not null,
  'the next sweep rebuilds it'
);

select is(
  (select (public.market_home(array['ZTSTB'], '{}', '{}') -> 'rows' -> 0 ->> 'px')::numeric),
  -- 200::numeric, not 200. pgTAP resolves is() per argument type, and
  -- is(numeric, integer, text) does not exist: an integer literal here aborts
  -- the whole file with "function is(numeric, integer, unknown) does not
  -- exist", which reads as a broken suite rather than a typing slip.
  200::numeric,
  'and the new price is what the page gets'
);

-- ── A different strip is not this blob ──────────────────────────────────────

select is(
  (select public.market_home(array['ZTSTA'], '{}', '{}') -> 'strip' -> 0 ->> 'symbol'),
  'ZTSTA',
  'a read for another strip computes live rather than serving the stored list'
);

-- ── The named halves are always live ────────────────────────────────────────

create temp table named_probe as
  select public.market_home(array['ZTSTB'], array['ZTSTB'], array['ZTSTA']) as j;

select is(
  (select jsonb_typeof(j -> 'wire') from named_probe),
  'array',
  'wire is answered beside the blob'
);

select is(
  (select jsonb_typeof(j -> 'calendar') from named_probe),
  'array',
  'and so is calendar'
);

select ok(
  (select (j ->> 'bytes')::int > 0 from build_probe),
  'the build reports the size it wrote, for the worker log'
);

select * from finish();

rollback;
