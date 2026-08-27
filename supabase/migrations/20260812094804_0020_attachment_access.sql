-- 0020_attachment_access.sql — someone looked at a customer's passport.
--
-- 0006 put attachments in a private bucket and 0010 gave staff a storage
-- SELECT policy over it. What it does not do is leave a record. An agent can
-- enumerate every object and download every address proof, bank statement and
-- government ID the firm has received, and nothing anywhere says they did.
--
-- The storage policy narrows to ADMIN break-glass; normal access goes through
-- staff_open_attachment(), which writes an append-only log row before it hands
-- back a path. Enforced by removing the alternative, not by asking callers to
-- behave.

create table if not exists public.attachment_access_log (
  id                  bigint generated always as identity primary key,
  attachment_id       uuid,
  ticket_id           uuid not null references public.tickets (id) on delete cascade,
  attachment_filename text not null,
  actor_id            uuid,
  actor_label         text not null,
  reason              text,
  client_ip           inet,
  user_agent          text,
  accessed_at         timestamptz not null default now(),

  constraint attachment_access_log_reason_len
    check (reason is null or (char_length(reason) between 3 and 500)),
  constraint attachment_access_log_ua_len
    check (user_agent is null or char_length(user_agent) <= 500)
);

create index if not exists attachment_access_log_ticket_idx
  on public.attachment_access_log (ticket_id, accessed_at desc);
create index if not exists attachment_access_log_actor_idx
  on public.attachment_access_log (actor_id, accessed_at desc);

comment on table public.attachment_access_log is
  'Append-only record of every staff read of a ticket attachment. Written by staff_open_attachment(); cannot be updated or deleted except by the retention purge.';

create or replace function public.reject_attachment_access_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('platizio.retention_purge', true), '') = 'on'
     and tg_op = 'DELETE' then
    return old;
  end if;

  raise exception
    'attachment_access_log is append-only; % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists attachment_access_log_no_update on public.attachment_access_log;
create trigger attachment_access_log_no_update
  before update on public.attachment_access_log
  for each row execute function public.reject_attachment_access_mutation();

drop trigger if exists attachment_access_log_no_delete on public.attachment_access_log;
create trigger attachment_access_log_no_delete
  before delete on public.attachment_access_log
  for each row execute function public.reject_attachment_access_mutation();

alter table public.attachment_access_log enable row level security;

drop policy if exists "supervisors read attachment access log" on public.attachment_access_log;
create policy "supervisors read attachment access log"
  on public.attachment_access_log
  for select
  to authenticated
  using (
    public.has_staff_role('SUPERVISOR')
    or public.has_staff_role('GRIEVANCE_OFFICER')
    or public.has_staff_role('ADMIN')
  );

drop policy if exists "staff read ticket attachments" on storage.objects;

drop policy if exists "admins read ticket attachments" on storage.objects;
create policy "admins read ticket attachments"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and public.has_staff_role('ADMIN')
  );

create or replace function public.staff_open_attachment(
  p_attachment_id uuid,
  p_reason        text default null,
  p_client_ip     text default null,
  p_user_agent    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff();
  v_row   public.ticket_attachments;
  v_ip    inet;
begin
  select * into v_row
    from public.ticket_attachments
   where id = p_attachment_id;

  if not found then
    raise exception 'no such attachment: %', p_attachment_id
      using errcode = 'no_data_found';
  end if;

  if v_row.verification_state <> 'VERIFIED' then
    raise exception 'attachment % is %, not VERIFIED; there is nothing safe to open',
      p_attachment_id, v_row.verification_state
      using errcode = 'invalid_parameter_value';
  end if;

  begin
    v_ip := nullif(trim(p_client_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.attachment_access_log
    (attachment_id, ticket_id, attachment_filename, actor_id, actor_label,
     reason, client_ip, user_agent)
  values (
    v_row.id,
    v_row.ticket_id,
    v_row.original_filename,
    v_actor,
    public.current_actor_label(),
    nullif(trim(p_reason), ''),
    v_ip,
    left(nullif(trim(p_user_agent), ''), 500)
  );

  return jsonb_build_object(
    'attachmentId', v_row.id,
    'ticketId',     v_row.ticket_id,
    'bucketId',     v_row.bucket_id,
    'storagePath',  v_row.storage_path,
    'filename',     v_row.original_filename,
    'mime',         coalesce(v_row.verified_mime, v_row.declared_mime),
    'bytes',        coalesce(v_row.verified_bytes, v_row.declared_bytes)
  );
end;
$$;

create or replace function public.staff_attachment_access_history(
  p_ticket_id uuid,
  p_limit     integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff(
    array['SUPERVISOR','GRIEVANCE_OFFICER','ADMIN']::public.staff_role[]
  );
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',         l.id,
             'filename',   l.attachment_filename,
             'actorLabel', l.actor_label,
             'actorName',  su.full_name,
             'reason',     l.reason,
             'clientIp',   host(l.client_ip),
             'accessedAt', l.accessed_at
           ) order by l.accessed_at desc, l.id desc)
    from (
      select * from public.attachment_access_log
       where ticket_id = p_ticket_id
       order by accessed_at desc, id desc
       limit v_limit
    ) l
    left join public.staff_users su on su.id = l.actor_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_open_attachment(uuid, text, text, text) from public, anon;
revoke all on function public.staff_attachment_access_history(uuid, integer) from public, anon;

grant execute on function public.staff_open_attachment(uuid, text, text, text)
  to authenticated, service_role;
grant execute on function public.staff_attachment_access_history(uuid, integer)
  to authenticated, service_role;

revoke insert, update, delete on public.attachment_access_log from anon, authenticated;
grant select on public.attachment_access_log to authenticated;
