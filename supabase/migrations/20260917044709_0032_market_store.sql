-- 0032_market_store.sql — a durable home for market reference data.
--
-- ViewTrade has no change notifications, no ETags, no deltas and no bulk
-- reference endpoint. "Notice that Oracle's profile changed" can therefore only
-- mean: fetch it again on a cadence, hash the canonical form, and compare. That
-- is cheap to do in a worker and ruinous to do in a page render, which is what
-- the terminal did — thirty gateway calls inside one request, thirty seconds for
-- ORCL, and all of it thrown away on the next deploy because the only store was
-- Next's in-memory fetch cache.
--
-- So the fetching moves out of the web process and the answers land here. The
-- worker claims due work with a lease, re-fetches, and reports back; a hash that
-- matches writes nothing at all, which is the whole economy of the thing. Pages
-- read one RPC.
--
-- Quotes are a separate rhythm: ~4,400 hot names every five minutes, all 13,797
-- hourly. They are not what the reader sees moving — prices come from the live
-- stream — they are what the rankings and the slow fields are computed from.
--
-- `market` is not in `[api] schemas`, deliberately. ViewTrade's licence does not
-- permit anonymous scraping of this data, so there is no PostgREST table access
-- at all: everything goes through the `public.market_*` RPCs below, which are
-- service_role only.

create schema if not exists market;

revoke all on schema market from public, anon, authenticated;
grant usage on schema market to service_role;

comment on schema market is
  'Durable market reference data and delayed quotes. Deliberately outside the PostgREST schema list — reachable only through the public.market_* RPCs, which are granted to service_role alone.';

-- ── The universe ────────────────────────────────────────────────────────────

create table if not exists market.symbols (
  symbol          text primary key,
  name            text not null default '',
  exchange        text not null default '',
  tradable        boolean not null default true,
  hot             boolean not null default false,
  priority        integer not null default 0 check (priority between 0 and 3),
  enrolled_at     timestamptz,
  last_visited_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- The gateway answers in upper case and the RPCs upper-case on the way in, so
  -- a lower-case row here means something bypassed them. Cheaper to refuse than
  -- to spend an afternoon on why AAPL and aapl are two instruments.
  constraint symbols_upper  check (symbol = upper(symbol)),
  constraint symbols_length check (char_length(symbol) <= 16)
);

comment on table market.symbols is
  'Every symbol the gateway lists, whether or not anything has been fetched for it. Enrolment is a separate fact: a row here is a name we know, a row with enrolled_at is a name the refresher works on.';
comment on column market.symbols.hot is
  'In the five-minute quote sweep. Recomputed after each hourly full sweep by market_set_hot; roughly 4,400 of the 13,797.';
comment on column market.symbols.priority is
  '3 covered / ETF / wire / calendar, 2 a symbol a reader has opened, 1 hot, 0 the rest. Sorts the refresh queue and picks the cadence. Only ever raised, never lowered — a name that earned attention keeps it.';
comment on column market.symbols.enrolled_at is
  'When the refresher took this symbol on. Null means known but never fetched; market_claim_due ignores those entirely.';
comment on column market.symbols.last_visited_at is
  'Stamped by market_touch_visit on every instrument page render. The pull-through signal: a symbol nobody reads should not cost a daily fetch.';

create index if not exists symbols_hot_idx on market.symbols (symbol) where hot;

drop trigger if exists symbols_updated_at on market.symbols;
create trigger symbols_updated_at
  before update on market.symbols
  for each row execute function public.set_updated_at();

-- ── Quotes ──────────────────────────────────────────────────────────────────

create table if not exists market.quotes (
  symbol     text primary key references market.symbols (symbol) on delete cascade,
  px         numeric not null check (px > 0),
  chg        numeric not null,
  chg_known  boolean not null,
  vol        numeric not null default 0,
  avg_vol    numeric not null default 0,
  dollar_vol numeric not null default 0,
  rel_vol    numeric not null default 0,
  mcap       numeric,
  pe         numeric,
  ex         text not null default '',
  as_of      timestamptz,
  delayed    boolean not null default true,
  raw        jsonb not null,
  swept_at   timestamptz not null default now()
);

comment on table market.quotes is
  'One row per symbol, the SweepRow of lib/api/sweep.ts. These feed the rankings and the slow panel fields; the price a reader watches move comes from the live stream, not from here.';
comment on column market.quotes.chg_known is
  'Whether chg is a reading or a stand-in. The gateway prices plenty of names it sends no change for, and 0 is indistinguishable from a name that closed exactly flat. Anything ranking by direction must consult this first.';
comment on column market.quotes.raw is
  'The RawEquityQuote verbatim. toCompanyProfile and the index/sector strips read fields the SweepRow columns drop, and re-deriving them here would mean this table knowing what the normalisers want.';
comment on column market.quotes.as_of is
  'The quote''s own updateTime, not when we fetched it. Staleness is measured against this.';
comment on column market.quotes.swept_at is
  'When the sweep that produced this row ran. Only stamped when something actually changed, so an untouched row still reads as the last real reading.';

-- ── Sections: the refresh queue and the payloads it fills ───────────────────

create table if not exists market.sections (
  symbol            text not null references market.symbols (symbol) on delete cascade,
  section           text not null check (section in (
                      'profile', 'news_gateway', 'corporate_actions',
                      'financials_annual', 'history_daily', 'short_interest', 'analyst')),
  payload           jsonb,
  content_hash      text,
  version           integer not null default 0,
  fetched_at        timestamptz,
  checked_at        timestamptz,
  next_check_at     timestamptz not null default now(),
  source_updated_at timestamptz,
  unchanged_streak  integer not null default 0,
  attempts          integer not null default 0,
  claimed_at        timestamptz,
  last_error        text,

  primary key (symbol, section)
);

comment on table market.sections is
  'The work queue and the store in one table. A row is both "this symbol owes us a profile" and "here is the profile" — splitting them would mean a join on every claim and a second write on every completion, for no fact either half could state alone.';
comment on column market.sections.payload is
  'The stored document, shaped as the normalisers already take it. Null means enrolled but never successfully fetched — distinct from fetched and empty, which is a payload.';
comment on column market.sections.content_hash is
  'sha256 over the canonical JSON with volatile keys stripped. The worker compares against this and, on a match, writes nothing: that match is where the savings live.';
comment on column market.sections.version is
  'Bumped only when the payload actually changes. The read path''s cache tag turns on this, so an unchanged re-fetch regenerates no pages.';
comment on column market.sections.checked_at is
  'When we last asked. fetched_at is when the answer last differed. The gap between them is the hash compare earning its keep.';
comment on column market.sections.next_check_at is
  'When this section is due again. Written by market_complete from the cadence table; enrolment spreads it over twenty minutes so a bootstrap does not arrive as a thundering herd.';
comment on column market.sections.claimed_at is
  'The lease. A claim older than fifteen minutes is treated as abandoned and re-offered, so a worker that dies mid-fetch costs one stale row rather than a stuck queue.';
comment on column market.sections.unchanged_streak is
  'Consecutive hash matches. The cadence doubles the interval on this up to each section''s cap.';

create index if not exists sections_due_idx
  on market.sections (next_check_at) where claimed_at is null;

-- There is deliberately no second index on (symbol). The primary key
-- (symbol, section) already leads with it, so `where symbol = $1` — the only way
-- this table is ever read by symbol — is served by the key itself. A standalone
-- copy would be another index write on every completion of a table heading for
-- ~96,000 rows, bought with nothing.

-- ── The log ─────────────────────────────────────────────────────────────────

create table if not exists market.refresh_log (
  id      bigint generated always as identity primary key,
  symbol  text not null,
  section text not null,
  outcome text not null check (outcome in ('changed', 'unchanged', 'error', 'absent')),
  changed boolean not null default false,
  ms      integer,
  error   text,
  at      timestamptz not null default now()
);

comment on table market.refresh_log is
  'One row per completed job. The only way to answer "is the hash compare working" — a quiet hour should read unchanged far ahead of changed — and the only record of what a delisted symbol did before it went. Seven days, purged by private.purge_expired_records.';
comment on column market.refresh_log.symbol is
  'Deliberately not a foreign key. The log outlives the symbol: a name that stops being quoted is exactly the one whose last few fetches you want to read.';
comment on column market.refresh_log.outcome is
  '''absent'' is a stable 404/410/422 from the gateway — a real answer meaning there is nothing to fetch, not a failure to retry.';

create index if not exists refresh_log_at_idx on market.refresh_log (at);

-- RLS on with no policies at all, as everywhere else in this schema. Nothing
-- reaches these tables except the security definer functions below, and a table
-- without RLS in a schema that later gets exposed by accident is a data leak
-- waiting for a config change.
alter table market.symbols     enable row level security;
alter table market.quotes      enable row level security;
alter table market.sections    enable row level security;
alter table market.refresh_log enable row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- Write path
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.market_seed_symbols(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  -- The de-duplication is not decoration: ON CONFLICT DO UPDATE refuses to touch
  -- the same row twice in one statement, so one repeated ticker in a 2,000-row
  -- chunk would abort the chunk. Last mention wins.
  with named as (
    select distinct on (upper(t.item ->> 'symbol'))
           upper(t.item ->> 'symbol')                        as symbol,
           coalesce(t.item ->> 'name', '')                   as name,
           coalesce(t.item ->> 'exchange', '')               as exchange,
           coalesce((t.item ->> 'tradable')::boolean, true)  as tradable
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(item, ord)
     where nullif(t.item ->> 'symbol', '') is not null
     order by upper(t.item ->> 'symbol'), t.ord desc
  )
  insert into market.symbols as sym (symbol, name, exchange, tradable)
  select n.symbol, n.name, n.exchange, n.tradable from named n
  on conflict (symbol) do update
     set name     = excluded.name,
         exchange = excluded.exchange,
         tradable = excluded.tradable
   -- Guarded so a re-seed of an unchanged master touches nothing: without it
   -- every bootstrap would bump updated_at on all 13,797 rows and rewrite the
   -- table for no new fact.
   where (sym.name, sym.exchange, sym.tradable)
      is distinct from (excluded.name, excluded.exchange, excluded.tradable);

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.market_seed_symbols(jsonb) is
  'Bootstrap: upsert the tradable universe from symbol-master.json, 2,000 rows a call. Returns the number of rows actually written — a repeat seed returns 0, which is the point.';

create or replace function public.market_upsert_quotes(
  p_rows     jsonb,
  p_swept_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valid    integer := 0;
  v_upserted integer := 0;
begin
  -- Symbols first, in their own statement. The quotes upsert below carries a
  -- foreign key to this table and a sweep routinely returns names the seed has
  -- never heard of; doing both in one statement would make the FK check depend
  -- on data-modifying CTE ordering, which is not a thing to bet a sweep on.
  with named as (
    select distinct on (upper(t.item ->> 's'))
           upper(t.item ->> 's')                as symbol,
           coalesce(t.item ->> 'name', '')      as name,
           coalesce(t.item ->> 'ex', '')        as exchange
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(item, ord)
     where nullif(t.item ->> 's', '') is not null
       and coalesce((t.item ->> 'px')::numeric, 0) > 0
     order by upper(t.item ->> 's'), t.ord desc
  )
  insert into market.symbols as sym (symbol, name, exchange)
  select n.symbol, n.name, n.exchange from named n
  on conflict (symbol) do update
     set name     = coalesce(nullif(excluded.name, ''), sym.name),
         exchange = coalesce(nullif(excluded.exchange, ''), sym.exchange)
   -- Note what is absent: priority. A sweep must never lower a name the reader
   -- earned attention for, and the easiest way to guarantee that is to give the
   -- sweep no way to write the column at all.
   where (nullif(excluded.name, '') is not null and excluded.name is distinct from sym.name)
      or (nullif(excluded.exchange, '') is not null and excluded.exchange is distinct from sym.exchange);

  with parsed as (
    select distinct on (upper(t.item ->> 's'))
           upper(t.item ->> 's')                            as symbol,
           (t.item ->> 'px')::numeric                       as px,
           coalesce((t.item ->> 'chg')::numeric, 0)         as chg,
           coalesce((t.item ->> 'chgKnown')::boolean, false) as chg_known,
           coalesce((t.item ->> 'vol')::numeric, 0)         as vol,
           coalesce((t.item ->> 'avgVol')::numeric, 0)      as avg_vol,
           coalesce((t.item ->> 'dollarVol')::numeric, 0)   as dollar_vol,
           coalesce((t.item ->> 'relVol')::numeric, 0)      as rel_vol,
           (t.item ->> 'mcap')::numeric                     as mcap,
           (t.item ->> 'pe')::numeric                       as pe,
           coalesce(t.item ->> 'ex', '')                    as ex,
           case when (t.item ->> 'asOf') is null then null
                else to_timestamp((t.item ->> 'asOf')::numeric / 1000.0) end as as_of,
           coalesce((t.item ->> 'delayed')::boolean, true)  as delayed,
           coalesce(nullif(t.item -> 'raw', 'null'::jsonb), '{}'::jsonb) as raw
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(item, ord)
     -- A non-positive price is the gateway saying it has nothing, not a datum.
     -- Dropping the row keeps the other 1,999 in the chunk; failing the batch
     -- would let one unpriced name cost a whole sweep.
     where nullif(t.item ->> 's', '') is not null
       and coalesce((t.item ->> 'px')::numeric, 0) > 0
     order by upper(t.item ->> 's'), t.ord desc
  ),
  written as (
    insert into market.quotes as q (
      symbol, px, chg, chg_known, vol, avg_vol, dollar_vol, rel_vol,
      mcap, pe, ex, as_of, delayed, raw, swept_at
    )
    select p.symbol, p.px, p.chg, p.chg_known, p.vol, p.avg_vol, p.dollar_vol, p.rel_vol,
           p.mcap, p.pe, p.ex, p.as_of, p.delayed, p.raw, coalesce(p_swept_at, now())
      from parsed p
    on conflict (symbol) do update
       set px         = excluded.px,
           chg        = excluded.chg,
           chg_known  = excluded.chg_known,
           vol        = excluded.vol,
           avg_vol    = excluded.avg_vol,
           dollar_vol = excluded.dollar_vol,
           rel_vol    = excluded.rel_vol,
           mcap       = excluded.mcap,
           pe         = excluded.pe,
           ex         = excluded.ex,
           as_of      = excluded.as_of,
           delayed    = excluded.delayed,
           raw        = excluded.raw,
           swept_at   = excluded.swept_at
     -- The closed-market clause. Between 21:00 and 04:00 IST the gateway keeps
     -- answering with the same closing print, and without this every five-minute
     -- sweep would rewrite 4,400 rows, bump swept_at, and make the freshness
     -- check say "fresh" about data that had not moved since the bell.
     where (q.px, q.vol, q.chg, q.as_of)
        is distinct from (excluded.px, excluded.vol, excluded.chg, excluded.as_of)
    returning 1
  )
  select (select count(*) from parsed), (select count(*) from written)
    into v_valid, v_upserted;

  return jsonb_build_object(
    'upserted',  v_upserted,
    'unchanged', greatest(v_valid - v_upserted, 0)
  );
end;
$$;

comment on function public.market_upsert_quotes(jsonb, timestamptz) is
  'One call per sweep chunk. Upserts symbols then quotes, skipping rows the gateway priced at zero, and reports {upserted, unchanged} — unchanged counts rows whose price, volume, change and timestamp all matched, which is what a closed market looks like.';

create or replace function public.market_set_hot(p_symbols text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  -- Written as one pass over the whole table rather than "clear then set" so
  -- there is no instant where nothing is hot: the five-minute sweep reads this
  -- column and would otherwise occasionally sweep nothing.
  update market.symbols s
     set hot = (s.symbol = any(coalesce(p_symbols, '{}'::text[])))
   where s.hot is distinct from (s.symbol = any(coalesce(p_symbols, '{}'::text[])));

  select count(*) into n from market.symbols where hot;
  return n;
end;
$$;

comment on function public.market_set_hot(text[]) is
  'Recompute the hot set after a full sweep. Only rows whose flag actually flips are written, so the hourly call costs a few hundred updates rather than 13,797. Returns the size of the hot set.';

create or replace function public.market_enrol(
  p_symbols  text[],
  p_sections text[],
  p_priority integer default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n    integer;
  prio integer := least(greatest(coalesce(p_priority, 1), 0), 3);
begin
  update market.symbols s
     set enrolled_at = coalesce(s.enrolled_at, now()),
         priority    = greatest(s.priority, prio)
   where s.symbol = any(coalesce(p_symbols, '{}'::text[]));

  -- Selecting from market.symbols rather than from the array is what makes an
  -- unknown symbol a no-op instead of a foreign key violation: enrolment is
  -- called with whatever the wire and calendar lists happen to hold, and one
  -- retired ticker in them must not fail the bootstrap.
  insert into market.sections (symbol, section, next_check_at)
  select s.symbol,
         t.section,
         -- Spread rather than now(): a bootstrap enrols thousands of rows in
         -- one statement, and all of them due at the same instant is a stampede
         -- against a gateway with a rate ceiling.
         now() + (random() * interval '20 minutes')
    from market.symbols s
    cross join unnest(coalesce(p_sections, '{}'::text[])) as t(section)
   where s.symbol = any(coalesce(p_symbols, '{}'::text[]))
  on conflict (symbol, section) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.market_enrol(text[], text[], integer) is
  'Take symbols on, or raise the priority of symbols already on. Returns the number of section rows newly created — re-enrolling an existing name returns 0 and disturbs nothing it has already fetched.';

create or replace function public.market_touch_visit(p_symbol text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_symbol text := upper(nullif(trim(p_symbol), ''));
begin
  if v_symbol is null then
    return;
  end if;

  insert into market.symbols as sym (symbol, name, exchange, tradable, priority, last_visited_at)
  values (v_symbol, '', '', true, 2, now())
  on conflict (symbol) do update
     set last_visited_at = now(),
         priority        = greatest(sym.priority, 2);

  -- Pull-through. A reader who opens a symbol nobody has opened before pays the
  -- gateway fan-out once; this makes sure the second reader does not. Both the
  -- brand-new symbol and the long-known-but-never-enrolled one take the same
  -- branch, because from the queue's point of view they are the same state.
  --
  -- Every section but news_gateway: the three gateway articles are only read on
  -- the wire strip, and fetching them six-hourly for every symbol a reader
  -- glances at would be most of the refresher's budget spent on nothing.
  if not exists (select 1 from market.sections s where s.symbol = v_symbol) then
    perform public.market_enrol(
      array[v_symbol],
      array['profile', 'corporate_actions', 'financials_annual',
            'history_daily', 'short_interest', 'analyst'],
      2
    );
  end if;
end;
$$;

comment on function public.market_touch_visit(text) is
  'Called fire-and-forget from the instrument page. Stamps the visit, raises the symbol to visited priority, and enrols it on first sight so the next reader is served from the store rather than from thirty gateway calls.';

create or replace function public.market_claim_due(
  p_limit    integer default 50,
  p_sections text[] default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The outbox shape from claim_notifications in 0012: select the candidates
  -- with FOR UPDATE SKIP LOCKED, then update from that CTE. Two workers running
  -- at once take disjoint sets and neither waits for the other.
  return query
  with due as (
    select sec.symbol, sec.section
      from market.sections sec
      join market.symbols sym on sym.symbol = sec.symbol
     where sym.enrolled_at is not null
       and sec.next_check_at <= now()
       -- A lease, not a flag. A worker that dies between claim and complete
       -- leaves claimed_at set forever; after fifteen minutes the row is
       -- offered again rather than sitting due and unreachable.
       and (sec.claimed_at is null or sec.claimed_at < now() - interval '15 minutes')
       and (p_sections is null or sec.section = any(p_sections))
     order by sym.priority desc, sec.next_check_at asc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update of sec skip locked
  ),
  claimed as (
    update market.sections s
       set claimed_at = now(),
           attempts   = s.attempts + 1
      from due d
     where s.symbol = d.symbol
       and s.section = d.section
    returning s.symbol, s.section, s.version, s.content_hash, s.attempts
  )
  select jsonb_build_object(
           'symbol',      c.symbol,
           'section',     c.section,
           'version',     c.version,
           'contentHash', c.content_hash,
           'priority',    sym.priority,
           'attempts',    c.attempts,
           -- History and annual financials are read against the split and
           -- dividend record — returnsAgainst(raw, splitRecord(actions)). Handing
           -- the stored corporate_actions over with the job saves the worker a
           -- round trip per job and, more to the point, makes it impossible for
           -- it to derive a return from a split record it never read.
           'context',     case
                            when c.section in ('history_daily', 'financials_annual')
                            then (select ca.payload
                                    from market.sections ca
                                   where ca.symbol = c.symbol
                                     and ca.section = 'corporate_actions')
                            else null
                          end
         )
    from claimed c
    join market.symbols sym on sym.symbol = c.symbol
   -- The CTE's ORDER BY decides which rows get claimed under the limit; this one
   -- decides the order they are handed back in. Without it the batch comes out
   -- in whatever order the update produced, and a worker that gives up partway
   -- through a batch would drop the highest-priority names as readily as the
   -- lowest.
   order by sym.priority desc, c.symbol, c.section;
end;
$$;

comment on function public.market_claim_due(integer, text[]) is
  'Lease the next batch of due sections, highest priority first, and stamp an attempt on each. Race-safe: concurrent workers claim disjoint rows. Capped at 200 a call.';

create or replace function public.market_complete(
  p_symbol            text,
  p_section           text,
  p_payload           jsonb,
  p_hash              text,
  p_changed           boolean,
  p_error             text,
  p_next_check_at     timestamptz,
  p_ms                integer default null,
  p_source_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_symbol  text := upper(nullif(trim(p_symbol), ''));
  v_absent  boolean;
  v_version integer;
  v_outcome text;
begin
  v_absent := coalesce(p_payload ->> 'absent', '') = 'true';

  perform 1 from market.sections s
   where s.symbol = v_symbol and s.section = p_section
     for update;

  if not found then
    raise exception 'market_complete: % / % is not an enrolled section', v_symbol, p_section
      using errcode = 'no_data_found';
  end if;

  -- A null p_next_check_at on either of the two branches below hits the NOT NULL
  -- on next_check_at and aborts the whole call. That is on purpose, and it is why
  -- only the error branch below carries a fallback: an error is the one case
  -- where the worker may not have got far enough to know the cadence, whereas a
  -- worker that fetched a section and cannot say when to ask again has lost the
  -- cadence, and a next check invented here would park the row at a time nobody
  -- chose. Note what the abort costs: it rolls back the refresh_log insert at the
  -- foot of this function too, so the failure leaves no trace in the log it would
  -- otherwise be diagnosed from — it surfaces only as the error the worker gets
  -- back, which is where to look for it.
  if p_error is not null then
    update market.sections s
       set last_error    = left(p_error, 2000),
           -- Five minutes, trebling to a little under seven hours.
           next_check_at = coalesce(
                             p_next_check_at,
                             now() + interval '5 minutes'
                                     * power(3, least(greatest(s.attempts - 1, 0), 4))),
           claimed_at    = null
     where s.symbol = v_symbol and s.section = p_section
    returning s.version into v_version;

    v_outcome := 'error';

  elsif p_changed then
    update market.sections s
       set payload           = p_payload,
           content_hash      = p_hash,
           version           = s.version + 1,
           fetched_at        = now(),
           checked_at        = now(),
           source_updated_at = p_source_updated_at,
           unchanged_streak  = 0,
           attempts          = 0,
           last_error        = null,
           next_check_at     = p_next_check_at,
           claimed_at        = null
     where s.symbol = v_symbol and s.section = p_section
    returning s.version into v_version;

    v_outcome := case when v_absent then 'absent' else 'changed' end;

    -- A new split or dividend invalidates every measurement taken against the
    -- old record. Netflix once published a −93.3% trailing year off a ten-for-one
    -- split nobody had applied; the series and the annuals are re-derived now
    -- rather than whenever their own cadence next comes round.
    if p_section = 'corporate_actions' then
      update market.sections s
         set next_check_at = now()
       where s.symbol = v_symbol
         and s.section in ('history_daily', 'financials_annual');
    end if;

  else
    update market.sections s
       set checked_at       = now(),
           unchanged_streak = s.unchanged_streak + 1,
           attempts         = 0,
           last_error       = null,
           next_check_at    = p_next_check_at,
           -- The payload is deliberately untouched: an unchanged result is the
           -- worker saying the stored one is still right, and rewriting it would
           -- churn the table for no new fact. The hash is only filled in when
           -- there wasn't one — the first compare after a backfill.
           content_hash     = coalesce(s.content_hash, p_hash),
           claimed_at       = null
     where s.symbol = v_symbol and s.section = p_section
    returning s.version into v_version;

    v_outcome := case when v_absent then 'absent' else 'unchanged' end;
  end if;

  insert into market.refresh_log (symbol, section, outcome, changed, ms, error)
  values (
    v_symbol,
    p_section,
    v_outcome,
    coalesce(p_changed, false) and p_error is null,
    p_ms,
    left(p_error, 2000)
  );

  return jsonb_build_object('version', v_version);
end;
$$;

comment on function public.market_complete(text, text, jsonb, text, boolean, text, timestamptz, integer, timestamptz) is
  'Report a finished job: writes the payload only when it changed, always clears the lease, always logs. A changed corporate_actions makes that symbol''s history and annuals due immediately. Returns the section''s version, which the read path''s cache tag turns on.';

-- ════════════════════════════════════════════════════════════════════════════
-- Read path — one call per page regeneration
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.market_instrument(p_symbol text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_symbol   text := upper(nullif(trim(p_symbol), ''));
  v_enrolled boolean;
  v_quote    jsonb;
  v_row      jsonb;
  v_sections jsonb := '{}'::jsonb;
  v_meta     jsonb := '{}'::jsonb;
  v_peers    jsonb := '[]'::jsonb;
  v_related  jsonb;
begin
  if v_symbol is not null then
    select sym.enrolled_at is not null
      into v_enrolled
      from market.symbols sym
     where sym.symbol = v_symbol;

    select q.raw,
           jsonb_build_object(
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
             'delayed',   q.delayed)
      into v_quote, v_row
      from market.quotes q
      join market.symbols sym on sym.symbol = q.symbol
     where q.symbol = v_symbol;

    select coalesce(jsonb_object_agg(s.section, s.payload)
                      filter (where s.payload is not null), '{}'::jsonb),
           coalesce(jsonb_object_agg(s.section, jsonb_build_object(
                      'fetchedAt', case when s.fetched_at is null then null
                                        else (extract(epoch from s.fetched_at) * 1000)::bigint end,
                      'version',   s.version)), '{}'::jsonb)
      into v_sections, v_meta
      from market.sections s
     where s.symbol = v_symbol;

    v_related := v_sections -> 'profile' -> 'related_companies';

    if jsonb_typeof(v_related) = 'array' then
      -- `ticker` is what the gateway sends; `symbol` is read as a fallback
      -- because related_companies is undocumented and has no contract to hold
      -- it to. First mention wins, the subject is excluded, eight is what the
      -- peers table renders.
      with listed as (
        select upper(nullif(coalesce(e.item ->> 'ticker', e.item ->> 'symbol'), '')) as peer,
               e.ord
          from jsonb_array_elements(v_related) with ordinality as e(item, ord)
      ),
      deduped as (
        select distinct on (peer) peer, ord
          from listed
         where peer is not null and peer <> v_symbol
         order by peer, ord
      ),
      top8 as (
        select peer, ord from deduped order by ord limit 8
      )
      select coalesce(jsonb_agg(jsonb_build_object(
               's',     t.peer,
               'name',  sym.name,
               'px',    q.px,
               'chg',   q.chg,
               'mcap',  q.mcap,
               'pe',    q.pe,
               -- Stored at derive time by the history job, so the peers table
               -- costs no per-peer work at read. A peer with no history simply
               -- has no one-year figure; it does not lose its row.
               'ret1y', (h.payload -> 'derived' ->> 'ret1y')::numeric)
               order by t.ord), '[]'::jsonb)
        into v_peers
        from top8 t
        -- Inner join on quotes: a peer we cannot price is a name with nothing to
        -- show in any column of that table, so it is omitted rather than rendered
        -- as a row of dashes.
        join market.quotes q   on q.symbol = t.peer
        join market.symbols sym on sym.symbol = t.peer
        left join market.sections h
          on h.symbol = t.peer and h.section = 'history_daily';
    end if;
  end if;

  return jsonb_build_object(
    'enrolled', coalesce(v_enrolled, false),
    'quote',    v_quote,
    'row',      v_row,
    'sections', v_sections,
    'meta',     v_meta,
    -- The benchmark rides along on every instrument read. The relative-strength
    -- panel needs SPY's series for any symbol, and a second round trip to Mumbai
    -- for a payload that is the same on every page is a round trip wasted.
    'market',   jsonb_build_object(
                  'symbol', 'SPY',
                  'history_daily', (select h.payload
                                      from market.sections h
                                     where h.symbol = 'SPY'
                                       and h.section = 'history_daily')),
    'peers',    v_peers
  );
end;
$$;

comment on function public.market_instrument(text) is
  'Everything one instrument page renders, in one call: quote, SweepRow, every stored section with its freshness, the SPY benchmark series and the priced peers. `enrolled` false means the store has nothing and the caller should fall back to the gateway.';

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
  v_swept    bigint;
  v_rows     jsonb;
  v_strip    jsonb;
  v_week     jsonb;
  v_wire     jsonb;
  v_calendar jsonb;
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

  -- Order preserved from the caller's array. The index strip reads left to right
  -- in a fixed order the page decides, and re-sorting it here would silently
  -- rearrange the ribbon.
  select coalesce(jsonb_agg(q.raw order by t.ord), '[]'::jsonb)
    into v_strip
    from unnest(coalesce(p_strip, '{}'::text[])) with ordinality as t(symbol, ord)
    join market.quotes q on q.symbol = t.symbol;

  -- history_daily is stored columnar — {date:[], price:[], …} — because that is
  -- how the gateway sends five years of bars and rewriting it into objects would
  -- triple the stored bytes for data nothing reads row-wise. The sparkline wants
  -- the last ten sessions, so the slice happens here, by index.
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
    'sweptAt',  v_swept,
    'rows',     v_rows,
    'strip',    v_strip,
    'weekBars', v_week,
    'wire',     v_wire,
    'calendar', v_calendar
  );
end;
$$;

comment on function public.market_home(text[], text[], text[]) is
  'Everything the terminal landing page renders, in one call. `rows` is the hot set the boards rank from; strip, weekBars, wire and calendar are the named tickers the page asks for, in the order it asks. Entries with nothing stored are omitted rather than returned empty.';

create or replace function public.market_sections(p_symbols text[], p_section text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'symbol',    s.symbol,
           'payload',   s.payload,
           'fetchedAt', case when s.fetched_at is null then null
                             else (extract(epoch from s.fetched_at) * 1000)::bigint end,
           'version',   s.version) order by s.symbol), '[]'::jsonb)
    from market.sections s
   where s.section = p_section
     and s.symbol = any(coalesce(p_symbols, '{}'::text[]))
     and s.payload is not null;
$$;

comment on function public.market_sections(text[], text) is
  'Batch read of one section across many symbols — the sector pages and the feeds. Symbols with nothing stored are absent from the result rather than present and null.';

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
  select (extract(epoch from max(swept_at)) * 1000)::bigint, count(*)
    into v_swept, v_quotes
    from market.quotes;

  select count(*) filter (where hot),
         count(*) filter (where enrolled_at is not null)
    into v_hot, v_enrolled
    from market.symbols;

  -- `due` and `claimed` use the same lease arithmetic market_claim_due does. If
  -- they drifted apart, the health read would say the queue was keeping up while
  -- the worker found nothing to claim, which is the one lie this call must not
  -- be able to tell.
  select count(*) filter (where s.next_check_at <= now()
                            and (s.claimed_at is null
                                 or s.claimed_at < now() - interval '15 minutes')),
         count(*) filter (where s.claimed_at is not null
                            and s.claimed_at >= now() - interval '15 minutes'),
         count(*) filter (where s.attempts >= 3)
    into v_due, v_claimed, v_erroring
    from market.sections s
    join market.symbols sym on sym.symbol = s.symbol
   where sym.enrolled_at is not null;

  select (extract(epoch from max(at)) * 1000)::bigint
    into v_last
    from market.refresh_log;

  -- The hour's shape is the real health signal. unchanged far ahead of changed
  -- means the hash compare is doing its job; the two converging means something
  -- volatile has crept into the canonical form and every fetch is writing.
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
  'Health read behind /api/sweep and the probe. Every timestamp is epoch milliseconds, matching the rest of the market_* surface. `erroring` counts sections that have failed three times or more.';

-- ── Retention ───────────────────────────────────────────────────────────────

-- Re-created from its 0027 body with the log added, rather than given a cron job
-- of its own. One nightly purge that knows about every table is auditable; two
-- jobs deleting on different schedules is how a retention rule quietly stops
-- running and nobody notices for a year.
create or replace function private.purge_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone_complaints integer := 0;
  gone_tickets    integer := 0;
  gone_enquiries  integer := 0;
  gone_consent    integer := 0;
  gone_ratelimit  integer := 0;
  gone_refreshlog integer := 0;
begin
  perform set_config('platizio.retention_purge', 'on', true);

  delete from public.complaints c
   where c.legal_hold = false
     and c.retention_expires_at < now()
     and not exists (
       select 1 from public.tickets t
       where t.id = c.ticket_id and t.legal_hold
     );
  get diagnostics gone_complaints = row_count;

  delete from public.tickets t
   where t.legal_hold = false
     and t.retention_expires_at < now()
     and not exists (select 1 from public.complaints c where c.ticket_id = t.id);
  get diagnostics gone_tickets = row_count;

  delete from public.contact_enquiries e
   where e.legal_hold = false
     and e.retention_expires_at < now();
  get diagnostics gone_enquiries = row_count;

  delete from public.consent_records
   where ticket_id is null
     and enquiry_id is null
     and retention_expires_at < now();
  get diagnostics gone_consent = row_count;

  delete from private.rate_limit_hits
   where window_start < now() - interval '2 days';
  get diagnostics gone_ratelimit = row_count;

  -- Seven days. The log answers "is the hash compare working" and "what did this
  -- symbol do before it delisted", and both questions are asked about the recent
  -- past; a year of it would be tens of millions of rows nobody reads.
  delete from market.refresh_log
   where at < now() - interval '7 days';
  get diagnostics gone_refreshlog = row_count;

  perform set_config('platizio.retention_purge', 'off', true);

  return jsonb_build_object(
    'complaints', gone_complaints,
    'tickets', gone_tickets,
    'enquiries', gone_enquiries,
    'consentRecords', gone_consent,
    'rateLimitRows', gone_ratelimit,
    'marketRefreshLog', gone_refreshlog
  );
end;
$$;

-- 0011, 0013 and 0027 each re-created this function without ever commenting it,
-- and `create or replace` cannot restore a comment that was never set — so the
-- one function this file borrows from another migration would be the only one in
-- it without a description. Stated here, since the body is being rewritten anyway.
comment on function private.purge_expired_records() is
  'The nightly retention sweep, called by the platizio-retention-purge cron job. Deletes complaints, tickets, contact enquiries and standalone consent records past their retention date (honouring legal holds and a ticket''s hold over its complaint), rate-limit hits older than two days, and market refresh-log rows older than seven. Returns a count per table.';

-- `from public` and not `from anon, authenticated`. Postgres grants EXECUTE to
-- PUBLIC on every new function by default, so revoking from the two named roles
-- leaves the default grant untouched and the function reachable by both.
revoke all on function
  public.market_seed_symbols(jsonb),
  public.market_upsert_quotes(jsonb, timestamptz),
  public.market_set_hot(text[]),
  public.market_enrol(text[], text[], integer),
  public.market_touch_visit(text),
  public.market_claim_due(integer, text[]),
  public.market_complete(text, text, jsonb, text, boolean, text, timestamptz, integer, timestamptz),
  public.market_instrument(text),
  public.market_home(text[], text[], text[]),
  public.market_sections(text[], text),
  public.market_status()
from public, anon, authenticated;

grant execute on function
  public.market_seed_symbols(jsonb),
  public.market_upsert_quotes(jsonb, timestamptz),
  public.market_set_hot(text[]),
  public.market_enrol(text[], text[], integer),
  public.market_touch_visit(text),
  public.market_claim_due(integer, text[]),
  public.market_complete(text, text, jsonb, text, boolean, text, timestamptz, integer, timestamptz),
  public.market_instrument(text),
  public.market_home(text[], text[], text[]),
  public.market_sections(text[], text),
  public.market_status()
to service_role;
