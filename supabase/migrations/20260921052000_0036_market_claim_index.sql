-- 0036_market_claim_index.sql — let the claim find its rows without
-- reading the whole queue.
--
-- THE FAILURE THIS FIXES, measured on the live database: the worker stopped
-- being able to claim work at all, logging `refresh claim error=TimeoutError`
-- every twenty seconds, and the health check went fatal with "the refresher
-- last finished a job 2d ago". EXPLAIN ANALYZE on market_claim_due's inner
-- query:
--
--     Limit (actual rows=60)
--       Sort  Sort Key: sym.priority DESC, sec.next_check_at
--         Hash Join (actual rows=12871)
--           Seq Scan on sections (actual rows=12871)
--             Filter: next_check_at <= now() AND (claimed_at IS NULL OR ...)
--     Execution Time: 6162.094 ms
--
-- Six seconds for the SELECT, before the `for update skip locked` and the
-- UPDATE that follow it, against a client that gives up at eight.
--
-- TWO THINGS DEFEATED THE INDEX, and fixing either alone leaves the other.
--
-- First, `sections_due_idx` is partial on `claimed_at is null`, but the query
-- asks `claimed_at is null OR claimed_at < now() - 15 min` — the second arm
-- reclaims a lease whose holder died. Postgres can only use a partial index
-- where it can prove the query implies the predicate, and an OR defeats that
-- proof, so the index was never touched.
--
-- Second, and the reason no index on `sections` alone could have helped: the
-- ordering is `sym.priority`, on the OTHER table. Every candidate row had to
-- be joined before any could be ranked, so the LIMIT could never stop early —
-- it sorted 12,871 rows to take fifty. That is why this is felt as a cliff rather
-- than a slope: the cost is set by the size of the BACKLOG, so the queue gets
-- slowest exactly when it is most behind, which is exactly when the worker has
-- been offline and most needs to catch up.
--
-- So priority moves onto the row being ordered. One index then answers the
-- whole query in its own order and stops at sixty, whatever the backlog.
--
-- Kept in sync by trigger rather than by editing market_enrol and
-- market_touch_visit: those are two call sites today and the next one to set a
-- priority would silently not propagate. A trigger cannot be forgotten.

-- ── The column ───────────────────────────────────────────────────────────────

alter table market.sections
  add column if not exists priority smallint not null default 0;

comment on column market.sections.priority is
  'A copy of market.symbols.priority, kept by trigger. Denormalised so the claim can order by it without joining: ordering by the symbol table forced every due row to be joined and sorted before the LIMIT could take its fifty, which is what made claiming cost six seconds on a backlog and time the worker out entirely.';

update market.sections sec
   set priority = sym.priority
  from market.symbols sym
 where sym.symbol = sec.symbol
   and sec.priority is distinct from sym.priority;

-- ── Keeping it true ──────────────────────────────────────────────────────────

create or replace function market.section_priority_from_symbol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A section is inserted by market_enrol, which has already set the symbol's
  -- priority. Reading it here means enrol does not have to know this column
  -- exists, and neither does whatever enrols next.
  select sym.priority into new.priority
    from market.symbols sym
   where sym.symbol = new.symbol;
  new.priority := coalesce(new.priority, 0);
  return new;
end;
$$;

drop trigger if exists sections_priority_on_insert on market.sections;
create trigger sections_priority_on_insert
  before insert on market.sections
  for each row execute function market.section_priority_from_symbol();

create or replace function market.sections_follow_symbol_priority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Six rows per symbol at most, and only when the priority actually moved —
  -- market_touch_visit runs on every page visit and must not rewrite the
  -- symbol's whole section set each time somebody opens a stock.
  update market.sections sec
     set priority = new.priority
   where sec.symbol = new.symbol
     and sec.priority is distinct from new.priority;
  return null;
end;
$$;

drop trigger if exists symbols_priority_to_sections on market.symbols;
create trigger symbols_priority_to_sections
  after update of priority on market.symbols
  for each row when (old.priority is distinct from new.priority)
  execute function market.sections_follow_symbol_priority();

-- ── The index the claim actually walks ───────────────────────────────────────

-- Column order is the query's ORDER BY, so the scan emerges already sorted and
-- the LIMIT stops at its limit instead of after the whole backlog.
-- `claimed_at` is INCLUDEd rather than made part of a partial predicate: the
-- lease test has that OR in it, so it has to be evaluated per row — but from
-- the index tuple, without visiting the heap, and nearly every row passes
-- because nearly every row is unclaimed.
create index if not exists sections_claim_idx
  on market.sections (priority desc, next_check_at)
  include (claimed_at);

-- sections_due_idx is deliberately KEPT. It cannot serve the claim — that is
-- this migration's whole subject — but market_status counts due rows without
-- the lease clause, and that count is on the health route's path. Dropping an
-- index to tidy up, and slowing the one query that says whether any of this is
-- working, would be a poor trade.

-- ── The claim, ordering by the row it is claiming ────────────────────────────

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
  return query
  with due as (
    select sec.symbol, sec.section
      from market.sections sec
      join market.symbols sym on sym.symbol = sec.symbol
     where sym.enrolled_at is not null
       and sec.next_check_at <= now()
       and (sec.claimed_at is null or sec.claimed_at < now() - interval '15 minutes')
       and (p_sections is null or sec.section = any(p_sections))
     -- THE ONE CHANGED LINE, and the whole point of this migration:
     -- sec.priority rather than sym.priority. The same number — a trigger
     -- keeps the copy true — but on the row being ordered, so
     -- sections_claim_idx can supply the order and this LIMIT can stop after
     -- fifty rows. Ordering by the symbol table forced every due row to be
     -- joined and sorted first: 12,871 rows sorted to take fifty, six seconds,
     -- against a client that gives up at eight.
     order by sec.priority desc, sec.next_check_at asc
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
   order by sym.priority desc, c.symbol, c.section;
end;
$$;

comment on function public.market_claim_due(integer, text[]) is
  'Lease up to p_limit due sections, highest priority and oldest due first. Orders by market.sections.priority — a trigger-maintained copy of the symbol''s — so sections_claim_idx supplies the order and the LIMIT stops at sixty rows; ordering by the symbol table instead forced every due row to be joined and sorted, which cost six seconds on a backlog and timed the worker out completely.';

revoke all on function public.market_claim_due(integer, text[]) from public, anon, authenticated;

grant execute on function public.market_claim_due(integer, text[]) to service_role;
