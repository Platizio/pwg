create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.get_secret(secret_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
begin
  select decrypted_secret into v
  from vault.decrypted_secrets
  where name = secret_name;
  return v;
exception when others then
  return null;
end;
$$;

create or replace function private.invoke_edge_function(fn_name text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text := private.get_secret('project_url');
  key      text := private.get_secret('service_role_key');
begin
  if base_url is null or key is null then
    raise notice 'skipping % — Vault secrets project_url / service_role_key are not set', fn_name;
    return null;
  end if;

  return net.http_post(
    url     := base_url || '/functions/v1/' || fn_name,
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || key
    ),
    timeout_milliseconds := 20000
  );
end;
$$;

create table private.rate_limit_hits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);

alter table private.rate_limit_hits enable row level security;

create index rate_limit_hits_window_idx on private.rate_limit_hits (window_start);

create or replace function private.sweep_sla()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  alert_email text := private.get_secret('sla_alert_email');
  warned      integer := 0;
  fr_breached integer := 0;
  rs_breached integer := 0;
begin
  if alert_email is not null then
    with due as (
      select t.id, t.ticket_ref, t.subject, t.priority, t.first_response_due_at
      from public.tickets t
      where t.first_response_at is null
        and t.sla_warned_at is null
        and t.first_response_due_at <= now() + interval '2 hours'
        and t.status_internal not in ('CLOSED', 'SPAM')
      order by t.first_response_due_at
      limit 50
    ), queued as (
      insert into public.notifications
        (ticket_id, template, to_email, subject, body_text, dedupe_key)
      select
        d.id,
        'sla_internal_alert',
        alert_email,
        'SLA warning: ' || d.ticket_ref || ' is due for a first response',
        format(
          E'Ticket %s has had no first response and is due at %s IST.\n\n'
          || E'Priority: %s\nSubject:  %s\n\nThis is an internal alert. The customer has not been told.',
          d.ticket_ref,
          to_char(d.first_response_due_at at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI'),
          d.priority,
          d.subject
        ),
        'sla-warn:' || d.id::text
      from due d
      on conflict (dedupe_key) do nothing
      returning ticket_id
    )
    update public.tickets t
       set sla_warned_at = now()
      from queued q
     where t.id = q.ticket_id;

    get diagnostics warned = row_count;
  end if;

  update public.tickets
     set first_response_breached = true
   where first_response_at is null
     and first_response_breached = false
     and first_response_due_at < now()
     and status_internal not in ('CLOSED', 'SPAM');
  get diagnostics fr_breached = row_count;

  update public.tickets
     set resolution_breached = true
   where resolved_at is null
     and resolution_breached = false
     and resolution_due_at < now()
     and status_internal not in ('CLOSED', 'SPAM');
  get diagnostics rs_breached = row_count;

  return jsonb_build_object(
    'warned', warned,
    'firstResponseBreached', fr_breached,
    'resolutionBreached', rs_breached,
    'alertEmailConfigured', alert_email is not null
  );
end;
$$;

create or replace function private.requeue_stuck_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.notifications
     set status          = 'PENDING',
         next_attempt_at = now(),
         last_error      = coalesce(last_error, 'worker did not report back; requeued')
   where status = 'SENDING'
     and updated_at < now() - interval '10 minutes'
     and attempts < max_attempts;
  get diagnostics n = row_count;

  update public.notifications
     set status     = 'FAILED',
         last_error = coalesce(last_error, 'worker did not report back and no attempts remain')
   where status = 'SENDING'
     and updated_at < now() - interval '10 minutes'
     and attempts >= max_attempts;

  return n;
end;
$$;

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

  delete from public.complaints
   where legal_hold = false
     and retention_expires_at < now();
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

select cron.schedule(
  'platizio-outbox-drain',
  '* * * * *',
  $job$ select private.invoke_edge_function('drain-outbox'); $job$
);

select cron.schedule(
  'platizio-sla-sweep',
  '*/15 * * * *',
  $job$ select private.sweep_sla(), private.requeue_stuck_notifications(); $job$
);

select cron.schedule(
  'platizio-storage-sweep',
  '17 * * * *',
  $job$ select private.invoke_edge_function('sweep-storage'); $job$
);

select cron.schedule(
  'platizio-retention-purge',
  '0 21 * * *',
  $job$ select private.purge_expired_records(); $job$
);
