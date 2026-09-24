-- 0039_market_write_lock_timeout.sql — a stuck write must release its locks.
--
-- THE INCIDENT, 24 Sep 2026. The refresh worker's quote upserts began timing
-- out (a 97s VACUUM ANALYZE of market.quotes was the first trigger), then kept
-- timing out with nothing else running, until the database stopped accepting
-- connections at all. Stopping the worker was enough for it to recover within
-- a minute.
--
-- The mechanism is a lock chain. The worker aborts a write it has waited too
-- long for — but PostgREST's transaction runs on until the statement ends,
-- still holding the row locks it took. The next upsert touches the same quote
-- rows, WAITS on those locks with no limit, overruns its own client timeout and
-- is abandoned in turn, holding locks of its own. Each round adds a stuck
-- backend, until none are left.
--
-- lock_timeout breaks the chain at the database: a write that cannot get its
-- locks within five seconds fails and rolls back, releasing everything, instead
-- of waiting for ever behind an abandoned one. Set on the functions, where a
-- function-level SET does take effect for lock waits inside them; no role-wide
-- setting is changed, so nothing else using this project is affected.
--
-- Five seconds is far above what these take when healthy and far below the
-- worker's 30s budget, so the failure is reported as the lock it is rather
-- than as a client timeout.

alter function public.market_upsert_quotes(p_rows jsonb, p_swept_at timestamp with time zone)
  set lock_timeout = '5s';

alter function public.market_set_hot(p_symbols text[])
  set lock_timeout = '5s';

alter function public.market_build_home(p_strip text[])
  set lock_timeout = '5s';

alter function public.market_complete(
  p_symbol text, p_section text, p_payload jsonb, p_hash text, p_changed boolean,
  p_error text, p_next_check_at timestamp with time zone, p_ms integer,
  p_source_updated_at timestamp with time zone
) set lock_timeout = '5s';
