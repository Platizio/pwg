create or replace function public.current_actor_label()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    claims := null;
  end;

  if claims ? 'email' then
    return claims ->> 'email';
  end if;
  if claims ? 'role' then
    return 'api:' || (claims ->> 'role');
  end if;

  return 'sql:' || current_user;
end;
$$;

create table public.ticket_status_history (
  id            bigint generated always as identity primary key,
  ticket_id     uuid not null references public.tickets (id) on delete cascade,
  from_internal public.ticket_status_internal,
  to_internal   public.ticket_status_internal not null,
  from_customer public.ticket_status_customer,
  to_customer   public.ticket_status_customer not null,
  actor_id      uuid,
  actor_label   text not null,
  note          text,
  changed_at    timestamptz not null default now()
);

comment on table public.ticket_status_history is
  'Append-only. Written by trigger on every status change, including hand edits made as service_role.';

create index ticket_status_history_ticket_idx
  on public.ticket_status_history (ticket_id, changed_at);

create or replace function public.log_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.status_internal is distinct from old.status_internal
     or new.status_customer is distinct from old.status_customer then
    insert into public.ticket_status_history
      (ticket_id, from_internal, to_internal, from_customer, to_customer, actor_id, actor_label)
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status_internal end,
      new.status_internal,
      case when tg_op = 'INSERT' then null else old.status_customer end,
      new.status_customer,
      auth.uid(),
      public.current_actor_label()
    );
  end if;
  return new;
end;
$$;

create trigger tickets_log_status_change
  after insert or update on public.tickets
  for each row execute function public.log_status_change();

create or replace function public.reject_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('platizio.retention_purge', true), 'off') = 'on' then
    return old;
  end if;

  raise exception 'ticket_status_history is append-only (attempted %)', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger history_immutable
  before update or delete on public.ticket_status_history
  for each row execute function public.reject_history_mutation();

create or replace function public.reject_message_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('platizio.retention_purge', true), 'off') = 'on' then
    return old;
  end if;

  raise exception 'ticket_messages is append-only (attempted %)', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger ticket_messages_immutable
  before update or delete on public.ticket_messages
  for each row execute function public.reject_message_mutation();
