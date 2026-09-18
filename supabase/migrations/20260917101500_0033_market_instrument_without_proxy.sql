-- 0033_market_instrument_without_proxy.sql — stop shipping SPY with every symbol.
--
-- market_instrument has always returned a `market` block holding SPY's five
-- years of daily bars, on the reasoning stated in 0032: the relative-strength
-- panel needs the benchmark for any symbol, and a second round trip to Mumbai
-- for a payload that is identical on every page is a round trip wasted.
--
-- That trade was measured the wrong way round. The second round trip is not
-- paid per page — the read path caches and tags — so what the join actually
-- bought was 86KB of the same bytes inside all ~500 instrument answers: 86KB of
-- the 213KB each one returns, downloaded, parsed and then held in its own ISR
-- cache entry on a web instance with a tenth of a CPU and 512MB. Forty-three
-- megabytes of duplicate benchmark to draw one comparison line.
--
-- It cost more than memory. When every instrument entry went stale at the same
-- instant, all five hundred pages regenerated together and each one asked this
-- database — whose max_connections is 60 — for its own 213KB. Every read in
-- that log timed out at the client's ceiling, 8,165ms apiece, for a query that
-- measures 0.27-0.72s when it is the only one asking.
--
-- So the block goes, and the series is read the way any other shared payload is
-- read: `market_sections(array['SPY'], 'history_daily')`, which already exists
-- (0032) and which the read path already wraps and caches. One entry for the
-- whole site, tagged `market:SPY`, invalidated by the same per-symbol POST the
-- refresher already sends when SPY's history changes.
--
-- NOTHING ELSE CHANGES. The body below is 0032's line for line apart from the
-- one key removed from the returned object, so quote, row, sections, meta and
-- the peers join — including the `distinct on` dedupe and the inner join that
-- omits a peer nobody can price — behave exactly as they do today. The
-- assembled instrument snapshot is identical; the caller composes the same
-- `market` field from the shared read.
--
-- `create or replace`, so the function keeps its OID and its privileges and no
-- reader ever meets a moment where it does not exist. The revoke/grant pair at
-- the foot is restated anyway, for the reason 0032 gives: Postgres grants
-- EXECUTE to PUBLIC by default, and a migration that assumed otherwise is how
-- market data becomes anonymously readable under a licence that forbids it.

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

  -- No `market` key. The benchmark series is the same payload on every one of
  -- these answers, so it is read once by the caller through market_sections and
  -- joined outside the database, where one cached copy serves every page.
  return jsonb_build_object(
    'enrolled', coalesce(v_enrolled, false),
    'quote',    v_quote,
    'row',      v_row,
    'sections', v_sections,
    'meta',     v_meta,
    'peers',    v_peers
  );
end;
$$;

comment on function public.market_instrument(text) is
  'Everything one instrument page renders about THIS company, in one call: quote, SweepRow, every stored section with its freshness, and the priced peers. `enrolled` false means the store has nothing and the caller should fall back to the gateway. The SPY benchmark series is deliberately not here — it is identical on every page, so the read path fetches it once through market_sections and caches it for the whole site.';

-- `from public` and not `from anon, authenticated`. Postgres grants EXECUTE to
-- PUBLIC on every new function by default, so revoking from the two named roles
-- leaves the default grant untouched and the function reachable by both.
revoke all on function public.market_instrument(text) from public, anon, authenticated;

grant execute on function public.market_instrument(text) to service_role;
