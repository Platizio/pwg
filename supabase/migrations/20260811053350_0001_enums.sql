create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

create type public.ticket_status_internal as enum (
  'NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'WAITING_ON_BROKER',
  'RESOLVED', 'CLOSED', 'SPAM'
);

create type public.ticket_status_customer as enum (
  'RECEIVED', 'IN_PROGRESS', 'WAITING_ON_YOU', 'RESOLVED', 'CLOSED'
);

create type public.ticket_priority as enum ('LOW', 'NORMAL', 'URGENT');

create type public.complaint_stage as enum (
  'RAISED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED', 'ESCALATED_ARBITRATION'
);

create type public.staff_role as enum ('AGENT', 'SUPERVISOR', 'GRIEVANCE_OFFICER', 'ADMIN');

create type public.notification_status as enum (
  'PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Generic updated_at stamp. Attached BEFORE UPDATE on every table carrying that column.';
