create sequence public.ticket_ref_seq;

create or replace function public.set_ticket_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ticket_ref is null then
    new.ticket_ref := 'PG-'
      || to_char(now() at time zone 'Asia/Kolkata', 'YYYY')
      || '-' || lpad(nextval('public.ticket_ref_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create table public.tickets (
  id                uuid primary key default gen_random_uuid(),
  ticket_ref        text not null unique,
  idempotency_key   text unique,
  requester_name         text not null,
  requester_email        text not null,
  requester_mobile_raw   text not null,
  requester_mobile_digits text not null,
  category_id    text not null references public.ticket_categories (id) on update cascade,
  subcategory_id text not null,
  priority       public.ticket_priority not null default 'NORMAL',
  subject     text not null,
  description text not null,
  status_internal public.ticket_status_internal not null default 'NEW',
  status_customer public.ticket_status_customer not null default 'RECEIVED',
  assigned_agent_id uuid,
  first_response_due_at timestamptz,
  resolution_due_at     timestamptz,
  first_response_at     timestamptz,
  resolved_at           timestamptz,
  closed_at             timestamptz,
  first_response_breached boolean not null default false,
  resolution_breached     boolean not null default false,
  sla_warned_at         timestamptz,
  source            text not null default 'web',
  submitted_ip      inet,
  submitted_user_agent text,
  captcha_verified  boolean not null default false,
  finalized_at      timestamptz,
  legal_hold        boolean not null default false,
  legal_hold_reason text,
  retention_expires_at timestamptz not null default (now() + interval '5 years'),
  attachment_retention_expires_at timestamptz not null default (now() + interval '5 years'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_subcategory_fk
    foreign key (category_id, subcategory_id)
    references public.ticket_subcategories (category_id, id) on update cascade,
  constraint tickets_ref_format      check (ticket_ref ~ '^PG-[0-9]{4}-[0-9]{6}$'),
  constraint tickets_name_len        check (char_length(requester_name) between 2 and 120),
  constraint tickets_email_len       check (char_length(requester_email) between 6 and 254),
  constraint tickets_email_shape     check (requester_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint tickets_email_lowercase check (requester_email = lower(requester_email)),
  constraint tickets_mobile_digits   check (requester_mobile_digits ~ '^[0-9]{8,15}$'),
  constraint tickets_mobile_raw_len  check (char_length(requester_mobile_raw) between 8 and 32),
  constraint tickets_subject_len     check (char_length(subject) between 4 and 200),
  constraint tickets_description_len check (char_length(description) between 20 and 5000),
  constraint tickets_source          check (source in ('web', 'email', 'phone', 'staff')),
  constraint tickets_hold_reason     check (not legal_hold or legal_hold_reason is not null),
  constraint tickets_closed_stamp
    check ((status_internal = 'CLOSED') = (closed_at is not null))
);

comment on table public.tickets is
  'Support requests raised through /help/raise. Personal data; see Privacy Policy §9 for retention.';
comment on column public.tickets.idempotency_key is
  'Per-form-session UUID from the browser. Unique, so a double submit returns the first ticket.';
comment on column public.tickets.attachment_retention_expires_at is
  'Open compliance decision: 12 months vs the full 5 years. Separate column so the two can diverge.';

create index tickets_requester_email_idx on public.tickets (lower(requester_email));
create index tickets_created_at_idx      on public.tickets (created_at desc);
create index tickets_queue_idx           on public.tickets (status_internal, priority, created_at)
  where status_internal not in ('CLOSED', 'SPAM');
create index tickets_first_response_due_idx on public.tickets (first_response_due_at)
  where first_response_at is null;
create index tickets_retention_idx       on public.tickets (retention_expires_at)
  where legal_hold = false;
create index tickets_unfinalized_idx     on public.tickets (created_at)
  where finalized_at is null;

create trigger tickets_set_ref
  before insert on public.tickets
  for each row execute function public.set_ticket_ref();

create trigger tickets_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

create or replace function public.reanchor_ticket_retention()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.closed_at is not null and old.closed_at is distinct from new.closed_at then
    new.retention_expires_at := new.closed_at + interval '5 years';
    if new.attachment_retention_expires_at > new.closed_at + interval '5 years' then
      new.attachment_retention_expires_at := new.closed_at + interval '5 years';
    end if;
  end if;
  return new;
end;
$$;

create trigger tickets_reanchor_retention
  before update on public.tickets
  for each row execute function public.reanchor_ticket_retention();

create table public.ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets (id) on delete cascade,
  author_staff_id uuid,
  author_kind text not null check (author_kind in ('CUSTOMER', 'STAFF', 'SYSTEM')),
  body text not null,
  is_internal_note boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ticket_messages_body_len check (char_length(body) between 1 and 20000),
  constraint ticket_messages_author
    check ((author_kind = 'STAFF') = (author_staff_id is not null)),
  constraint ticket_messages_note_is_staff
    check (not is_internal_note or author_kind <> 'CUSTOMER')
);

create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

create sequence public.complaint_ref_seq;

create table public.complaints (
  id            uuid primary key default gen_random_uuid(),
  complaint_ref text not null unique,
  ticket_id     uuid not null unique references public.tickets (id) on delete restrict,
  stage public.complaint_stage not null default 'RAISED',
  acknowledgement_due_at timestamptz,
  resolution_due_at      timestamptz,
  acknowledged_at        timestamptz,
  resolved_at            timestamptz,
  closed_at              timestamptz,
  closed_by              uuid,
  closure_summary        text,
  legal_hold           boolean not null default false,
  retention_expires_at timestamptz not null default (now() + interval '5 years'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complaints_ref_format check (complaint_ref ~ '^PG-GRV-[0-9]{4}-[0-9]{6}$'),
  constraint complaints_closed_stamp
    check ((stage = 'CLOSED') = (closed_at is not null)),
  constraint complaints_closure_attributed
    check (closed_at is null or (closed_by is not null and closure_summary is not null))
);

create or replace function public.set_complaint_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.complaint_ref is null then
    new.complaint_ref := 'PG-GRV-'
      || to_char(now() at time zone 'Asia/Kolkata', 'YYYY')
      || '-' || lpad(nextval('public.complaint_ref_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger complaints_set_ref
  before insert on public.complaints
  for each row execute function public.set_complaint_ref();

create trigger complaints_updated_at
  before update on public.complaints
  for each row execute function public.set_updated_at();

create index complaints_stage_idx     on public.complaints (stage, created_at);
create index complaints_retention_idx on public.complaints (retention_expires_at)
  where legal_hold = false;
