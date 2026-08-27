create or replace function private.purge_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone_complaints integer := 0;
  gone_tickets    integer := 0;
  gone_consent    integer := 0;
  gone_ratelimit  integer := 0;
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

  delete from public.consent_records
   where ticket_id is null
     and retention_expires_at < now();
  get diagnostics gone_consent = row_count;

  delete from private.rate_limit_hits
   where window_start < now() - interval '2 days';
  get diagnostics gone_ratelimit = row_count;

  perform set_config('platizio.retention_purge', 'off', true);

  return jsonb_build_object(
    'complaints', gone_complaints,
    'tickets', gone_tickets,
    'consentRecords', gone_consent,
    'rateLimitRows', gone_ratelimit
  );
end;
$$;
