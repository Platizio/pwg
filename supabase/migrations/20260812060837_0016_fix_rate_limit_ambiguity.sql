create or replace function public.rate_limit_consume(
  p_bucket text,
  p_limit  integer,
  p_window interval
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_seconds double precision := extract(epoch from p_window);
  v_window_start   timestamptz;
  v_hits           integer;
begin
  if p_bucket is null or p_limit is null or v_window_seconds is null or v_window_seconds <= 0 then
    raise exception 'rate_limit_consume requires a bucket, a limit and a positive window';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds
  );

  insert into private.rate_limit_hits as r (bucket, window_start, hits)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start)
    do update set hits = r.hits + 1
  returning r.hits into v_hits;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits',    v_hits,
    'limit',   p_limit,
    'resetAt', v_window_start + p_window
  );
end;
$$;

revoke all on function public.rate_limit_consume(text, integer, interval)
  from public, anon, authenticated;
grant execute on function public.rate_limit_consume(text, integer, interval)
  to service_role;
