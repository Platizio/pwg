-- Tests for 0035 — reading the hot set back.
--
-- Same discipline as the files beside it: the fixture is built through the RPCs
-- so every function body runs, and the assertions are made against rows that
-- exist. Symbols are ZTST* so the result depends on the code rather than on
-- what the project happens to hold.

begin;

select plan(6);

select ok(
  not has_function_privilege('anon', 'public.market_hot_symbols()', 'execute'),
  'anon cannot execute public.market_hot_symbols — the hot set is market data too'
);

select is(
  public.market_seed_symbols($$[
    {"symbol": "ZTSTA", "name": "Zeta Test A", "exchange": "NASDAQ", "tradable": true},
    {"symbol": "ZTSTB", "name": "Zeta Test B", "exchange": "NYSE",   "tradable": true}
  ]$$::jsonb),
  2,
  'two symbols seeded'
);

-- Before anything is marked, the answer is an empty array rather than null. The
-- worker reads `Array.isArray(data) && data.length > 0`, so a null here would
-- be indistinguishable from a failed read — and the worker would go on with no
-- hot list, which turns every five-minute sweep into a full-universe one.
select is(
  public.market_hot_symbols(),
  '[]'::jsonb,
  'an unmarked store answers an empty array, not null'
);

select ok(
  public.market_set_hot(array['ZTSTB', 'ZTSTA']) is not null,
  'both symbols marked hot'
);

-- Sorted, not in the order they were written: two reads of an unchanged set
-- must be byte-identical or a diff in a log means nothing.
select is(
  public.market_hot_symbols(),
  '["ZTSTA", "ZTSTB"]'::jsonb,
  'the set comes back sorted'
);

-- The property the worker depends on: what set_hot wrote is what comes back,
-- including the demotion. A symbol dropped from the set must not linger here,
-- or a worker restarting would keep re-quoting names the last sweep retired.
select ok(
  public.market_set_hot(array['ZTSTA']) is not null
    and public.market_hot_symbols() = '["ZTSTA"]'::jsonb,
  'and follows market_set_hot exactly, demotions included'
);

select * from finish();

rollback;
