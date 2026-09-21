-- 0037_market_intraday_section.sql — let the store hold intraday bars.
--
-- WHY THE STORE HAS TO HOLD THEM. The gateway answers one-minute bars for the
-- CURRENT session and keeps nothing afterwards. There is no endpoint that will
-- answer for a past day: the vendor catalog advertises `range=1d` and
-- `range=5d` on /quotes/equity/historical and the API rejects both with
-- "Invalid range format. Use [num][y/m]", and every quote and aggregation
-- route was listed looking for another. Minute history for a past session
-- exists nowhere upstream.
--
-- That is what made the 1W chart five daily closes — a straight line across a
-- week — and what makes 1D empty whenever the market is shut. Neither can be
-- fixed by asking better. They can only be fixed by keeping what the gateway
-- shows us while it is showing it, which is what this section is: a rolling
-- five sessions of ten-minute buckets, written once a day.
--
-- Ten-minute rather than one-minute is a storage decision made against a
-- measurement, not a preference. A real full session is ~49KB per symbol at
-- one minute and ~5KB at ten, and this database is at 288MB of a 500MB
-- ceiling. Across the hot set for five sessions that is ~1GB against ~110MB:
-- one does not fit and the other does. Across a week on a chart a few hundred
-- pixels wide the difference is not visible anyway, and the minute detail is
-- kept where it IS visible — the day — by serving that range live.
--
-- ONLY THE CHECK CHANGES. market_complete (write) and market_sections (read)
-- are already generic over the section name, so the write path, the read path,
-- the claim queue and the refresh log all carry this section without another
-- line of SQL. The five-session pruning belongs to the writer in
-- lib/market/refresh/, because it is a rule about what a chart needs rather
-- than a constraint about what is storable.

alter table market.sections
  drop constraint if exists sections_section_check;

alter table market.sections
  add constraint sections_section_check check (section in (
    'profile', 'news_gateway', 'corporate_actions',
    'financials_annual', 'history_daily', 'short_interest', 'analyst',
    'history_intraday'));

comment on column market.sections.section is
  'Which document this row holds. history_intraday is a rolling five sessions of ten-minute buckets, written once a day by the refresh worker — and the only record of intraday prices that exists anywhere, because the gateway discards a session''s minute bars when it ends.';

-- ── The claim hands this section its own payload ─────────────────────────────
--
-- Every other section is WHOLE when it arrives: the gateway's answer replaces
-- what was stored. This one accumulates — one session in, five kept — so the
-- writer has to see what is already there, and `context` is the channel that
-- already exists for handing a job something beyond its own document.
--
-- Restated in full rather than patched, because `create or replace` needs the
-- whole body and a reader comparing this against 0036 should see exactly one
-- difference: the `history_intraday` branch, and the `s.payload` in the
-- RETURNING that feeds it.

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
    returning s.symbol, s.section, s.version, s.content_hash, s.attempts, s.payload
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
                            when c.section = 'history_intraday'
                            then c.payload
                            else null
                          end
         )
    from claimed c
    join market.symbols sym on sym.symbol = c.symbol
   order by sym.priority desc, c.symbol, c.section;
end;
$$;

comment on function public.market_claim_due(integer, text[]) is
  'Lease up to p_limit due sections, highest priority and oldest due first. Orders by market.sections.priority — a trigger-maintained copy of the symbol''s — so sections_claim_idx supplies the order and the LIMIT stops at its fifty. `context` carries the corporate-actions document for the two sections derived against it, and for history_intraday carries the section''s OWN payload: that section accumulates, because the gateway hands over one session and the store keeps five.';

revoke all on function public.market_claim_due(integer, text[]) from public, anon, authenticated;

grant execute on function public.market_claim_due(integer, text[]) to service_role;
