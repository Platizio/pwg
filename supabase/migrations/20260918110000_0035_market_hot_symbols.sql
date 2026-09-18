-- 0035_market_hot_symbols.sql — let a worker read the hot set back.
--
-- market_set_hot writes the set; nothing could read it. That asymmetry looks
-- harmless until the worker is asked to REFUSE a bad write, which is what it
-- now does when a full sweep came back with failed chunks: a sweep that only
-- saw two thirds of the universe would otherwise demote every name it missed,
-- and the landing page's boards — which rank strictly from `hot` (0034's
-- market_build_home selects `where sym.hot`) — would quietly lose them for an
-- hour.
--
-- "Refuse and keep the previous set" needs a previous set, and a freshly
-- started worker has none: `hot` is null in memory until the first full sweep
-- fills it. Without this function the refusal would trade a truncated board for
-- triple the gateway spend, because a null hot list makes every five-minute
-- sweep a full 276-chunk one.
--
-- Deliberately not part of market_status. That function is a handful of counts
-- read by a health route on every request; this returns up to ~4,400 strings
-- and is read once, at startup.

create or replace function public.market_hot_symbols()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- jsonb rather than text[]: every other function here speaks jsonb over
  -- PostgREST, and the client's rpc<T> already parses exactly that. Sorted so
  -- two reads of an unchanged set are byte-identical, which makes a diff in a
  -- log mean something.
  select coalesce(jsonb_agg(s.symbol order by s.symbol), '[]'::jsonb)
    from market.symbols s
   where s.hot;
$$;

comment on function public.market_hot_symbols() is
  'The symbols market_set_hot last marked hot, sorted. Read once by the refresh worker at startup so that refusing to write a hot list drawn from an incomplete sweep still leaves it with a usable set — without one, a null hot list turns every five-minute sweep into a full-universe sweep.';

-- Postgres grants EXECUTE to PUBLIC on every new function, so revoking from the
-- two named roles alone would leave this reachable with the anon key.
revoke all on function public.market_hot_symbols() from public, anon, authenticated;

grant execute on function public.market_hot_symbols() to service_role;
