-- 0034_market_home_blob.sql — build the landing page's answer once per sweep.
--
-- market_home has been computing its answer on every call: an aggregate over
-- the ~4,100 hot quotes into a 1.2MB document, plus ten bars sliced out of each
-- strip fund's five-year history. On this instance that measures 1.0-1.5s when
-- nothing else is running and 2.4-5.7s while the refresh worker is writing —
-- the same work, done again, every five minutes, by every process that renders
-- the dashboard, for an answer that cannot change between sweeps because the
-- sweep is the only thing that writes the rows it reads.
--
-- So the sweep now builds it. `market_build_home` runs the aggregate once and
-- stores the document in `market.home`; `market_home` reads that row and adds
-- the two cheap parts — wire and calendar — live, because those are named per
-- call and cost one indexed join each. The read path in lib/market/store/
-- reads.ts asks for neither, so the common case is one primary-key fetch of one
-- jsonb column.
--
-- What has to stay true, and how it is kept:
--
--   THE ANSWER IS THE SAME. The body of 0032's market_home is not rewritten; it
--   is split, line for line, into `market.home_core_json` (sweptAt, rows,
--   strip, weekBars) and `market.home_named_json` (wire, calendar), and
--   market_home is their concatenation. The only new logic is the choice of
--   where the core comes from.
--
--   NOBODY SEES AN EMPTY PAGE. A store with no blob yet — this migration just
--   applied, or a worker that has never run — falls back to computing the core
--   live, exactly as before. The blob is an optimisation, never a precondition.
--
--   THE STRIP IS PART OF THE KEY. The stored core carries the strip it was
--   built for, in order, and a caller asking for a different list gets the
--   live computation rather than a document that omits a fund or orders it
--   differently. The worker builds with the same constants the page reads with
--   (INDEX_ETF_SYMBOLS then SECTOR_ETF_SYMBOLS), so this only trips during the
--   deploy that changes the list, and then only until the next sweep.
--
--   NOTHING IS ANONYMOUSLY READABLE. `market.home` has RLS on with no
--   policies; the helpers in `market` are not exposed (the schema is not in the
--   API); the one new public function is revoked from public, anon and
--   authenticated and granted to service_role, like the eleven before it.

-- ── The row ──────────────────────────────────────────────────────────────────

create table if not exists market.home (
  id       smallint primary key default 1 check (id = 1),
  strip    text[] not null,
  payload  jsonb not null,
  built_at timestamptz not null default now()
);

comment on table market.home is
  'The landing page''s core answer — sweptAt, rows, strip, weekBars — built once by market_build_home after each sweep and read by market_home. One row, ever; the CHECK is what makes an upsert on id=1 the only write. `strip` is the fund list it was built for, in order, and a read asking for any other list computes live instead.';
comment on column market.home.built_at is
  'When the row was last rebuilt. A value older than the sweep cadence means the worker has stopped, which market_status already reports through quotesSweptAt.';

alter table market.home enable row level security;

-- ── The two halves ───────────────────────────────────────────────────────────

-- 0032's market_home, lines 1-4 of its return: the parts that depend only on
-- the sweep and on the strip funds' stored history.
create or replace function market.home_core_json(p_strip text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_swept bigint;
  v_rows  jsonb;
  v_strip jsonb;
  v_week  jsonb;
begin
  select (extract(epoch from max(q.swept_at)) * 1000)::bigint
    into v_swept
    from market.quotes q;

  select coalesce(jsonb_agg(jsonb_build_object(
           's',         q.symbol,
           'name',      sym.name,
           'px',        q.px,
           'chg',       q.chg,
           'chgKnown',  q.chg_known,
           'vol',       q.vol,
           'avgVol',    q.avg_vol,
           'dollarVol', q.dollar_vol,
           'relVol',    q.rel_vol,
           'mcap',      q.mcap,
           'pe',        q.pe,
           'ex',        q.ex,
           'asOf',      case when q.as_of is null then null
                             else (extract(epoch from q.as_of) * 1000)::bigint end,
           'delayed',   q.delayed) order by q.symbol), '[]'::jsonb)
    into v_rows
    from market.quotes q
    join market.symbols sym on sym.symbol = q.symbol
   where sym.hot;

  select coalesce(jsonb_agg(q.raw order by t.ord), '[]'::jsonb)
    into v_strip
    from unnest(coalesce(p_strip, '{}'::text[])) with ordinality as t(symbol, ord)
    join market.quotes q on q.symbol = t.symbol;

  select coalesce(jsonb_object_agg(w.symbol, w.bars), '{}'::jsonb)
    into v_week
    from (
      select h.symbol,
             coalesce((
               select jsonb_agg(jsonb_build_object(
                        'date',    h.payload -> 'date'    -> i,
                        'price',   h.payload -> 'price'   -> i,
                        'opening', h.payload -> 'opening' -> i,
                        'high',    h.payload -> 'high'    -> i,
                        'low',     h.payload -> 'low'     -> i,
                        'volume',  h.payload -> 'volume'  -> i) order by i)
                 from generate_series(
                        greatest(jsonb_array_length(h.payload -> 'date') - 10, 0),
                        jsonb_array_length(h.payload -> 'date') - 1
                      ) as i
             ), '[]'::jsonb) as bars
        from market.sections h
       where h.section = 'history_daily'
         and h.symbol = any(coalesce(p_strip, '{}'::text[]))
         and h.payload is not null
         and jsonb_typeof(h.payload -> 'date') = 'array'
    ) w;

  return jsonb_build_object(
    'sweptAt',  v_swept,
    'rows',     v_rows,
    'strip',    v_strip,
    'weekBars', v_week
  );
end;
$$;

comment on function market.home_core_json(text[]) is
  'The expensive half of the landing page: every hot row, the strip funds'' raw quotes and their last ten bars. Called once per sweep by market_build_home, and by market_home only when no usable blob exists.';

-- 0032's market_home, lines 5-6 of its return: the parts named per call.
create or replace function market.home_named_json(p_wire text[], p_calendar text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_wire     jsonb;
  v_calendar jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'ticker', s.symbol,
           'news',   s.payload -> 'ticker_news') order by t.ord), '[]'::jsonb)
    into v_wire
    from unnest(coalesce(p_wire, '{}'::text[])) with ordinality as t(symbol, ord)
    join market.sections s
      on s.symbol = t.symbol and s.section = 'news_gateway' and s.payload is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ticker',  s.symbol,
           'actions', s.payload) order by t.ord), '[]'::jsonb)
    into v_calendar
    from unnest(coalesce(p_calendar, '{}'::text[])) with ordinality as t(symbol, ord)
    join market.sections s
      on s.symbol = t.symbol and s.section = 'corporate_actions' and s.payload is not null;

  return jsonb_build_object(
    'wire',     v_wire,
    'calendar', v_calendar
  );
end;
$$;

comment on function market.home_named_json(text[], text[]) is
  'The cheap half of the landing page: the wire tickers'' stored news and the calendar tickers'' stored corporate actions, one indexed join each. Always computed live, so a blob never has to be rebuilt for a change to a per-call list.';

-- ── The build ────────────────────────────────────────────────────────────────

create or replace function public.market_build_home(p_strip text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_strip   text[] := coalesce(p_strip, '{}'::text[]);
  v_payload jsonb;
begin
  v_payload := market.home_core_json(v_strip);

  insert into market.home as h (id, strip, payload, built_at)
  values (1, v_strip, v_payload, now())
  on conflict (id) do update
     set strip    = excluded.strip,
         payload  = excluded.payload,
         built_at = excluded.built_at;

  return jsonb_build_object(
    'builtAt', (extract(epoch from now()) * 1000)::bigint,
    'bytes',   pg_column_size(v_payload),
    'rows',    jsonb_array_length(v_payload -> 'rows')
  );
end;
$$;

comment on function public.market_build_home(text[]) is
  'Compute the landing page''s core once and store it. Called by the refresh worker after every sweep with the strip the page reads with. Returns {builtAt, bytes, rows} so the worker can log what it wrote.';

-- ── The read ─────────────────────────────────────────────────────────────────

create or replace function public.market_home(
  p_strip    text[],
  p_wire     text[],
  p_calendar text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_strip text[] := coalesce(p_strip, '{}'::text[]);
  v_core  jsonb;
begin
  -- Array equality is order-sensitive, which is the comparison wanted: the
  -- strip is returned in the order asked for, and a blob built for another
  -- order would hand the page its funds shuffled.
  select h.payload
    into v_core
    from market.home h
   where h.id = 1
     and h.strip = v_strip;

  if v_core is null then
    v_core := market.home_core_json(v_strip);
  end if;

  return v_core || market.home_named_json(p_wire, p_calendar);
end;
$$;

comment on function public.market_home(text[], text[], text[]) is
  'Everything the terminal landing page renders, in one call. `rows` is the hot set the boards rank from; strip, weekBars, wire and calendar are the named tickers the page asks for, in the order it asks. Entries with nothing stored are omitted rather than returned empty. The core (sweptAt, rows, strip, weekBars) comes from the row market_build_home stored after the last sweep; with no such row, or a different strip, it is computed live.';

-- ── Grants ───────────────────────────────────────────────────────────────────

-- The helpers live in `market`, which the API does not expose, but Postgres
-- still grants EXECUTE to PUBLIC on creation and a schema can be exposed by a
-- config change. Shut them the same way as everything else here.
revoke all on function
  market.home_core_json(text[]),
  market.home_named_json(text[], text[]),
  public.market_build_home(text[]),
  public.market_home(text[], text[], text[])
from public, anon, authenticated;

grant execute on function
  public.market_build_home(text[]),
  public.market_home(text[], text[], text[])
to service_role;
