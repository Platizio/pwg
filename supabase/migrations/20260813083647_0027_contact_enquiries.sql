-- 0027_contact_enquiries.sql — the enquiry form gets a table of its own.
--
-- The decision at src/components/ContactModal.tsx:1-9 was that it must not move
-- into `tickets`: an enquiry is not a support request, and putting it there
-- would start the published "24 hours on business days" clock against a promise
-- the site never made for sales enquiries, and corrupt the SLA figures the
-- ticketing system exists to make provable.
--
-- Its own table, own status set, own retention, own timing — and that timing is
-- explicitly internal and must never be published.

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'enquiry_status') then
    create type public.enquiry_status as enum (
      'NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'CLOSED', 'SPAM'
    );
  end if;
end $$;

-- A lookup table rather than a CHECK constraint, matching ticket_categories:
-- adding an option next quarter should be an INSERT, not a migration.
create table if not exists public.enquiry_interests (
  id        text primary key,
  label     text not null,
  position  integer not null default 0,
  is_active boolean not null default true,

  constraint enquiry_interests_id_slug check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint enquiry_interests_label_len check (char_length(label) between 2 and 80)
);

insert into public.enquiry_interests (id, label, position) values
  ('us-stocks',        'US Stocks',        1),
  ('us-etfs',          'US ETFs',          2),
  ('account-opening',  'Account Opening',  3),
  ('platform-support', 'Platform Support', 4),
  ('general-query',    'General Query',    5)
on conflict (id) do update set label = excluded.label, position = excluded.position;

create sequence if not exists public.enquiry_ref_seq;

create or replace function public.set_enquiry_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.enquiry_ref is null then
    new.enquiry_ref := 'PG-ENQ-'
      || to_char(now() at time zone 'Asia/Kolkata', 'YYYY')
      || '-' || lpad(nextval('public.enquiry_ref_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create table if not exists public.contact_enquiries (
  id          uuid primary key default gen_random_uuid(),
  enquiry_ref text not null unique,

  idempotency_key text unique,

  full_name    text not null,
  email        text not null,
  phone_raw    text not null,
  phone_digits text not null,

  interest_id text references public.enquiry_interests (id),
  message     text,

  status      public.enquiry_status not null default 'NEW',
  assigned_to uuid references public.staff_users (id) on delete set null,

  -- INTERNAL ONLY. A working target, not a promise. Must never appear in
  -- customer-facing copy, the published SLA, or any external report. Named at
  -- length precisely so nobody surfaces it by accident.
  internal_follow_up_target_at timestamptz,
  first_contacted_at           timestamptz,
  closed_at                    timestamptz,
  outcome_note                 text,

  source               text not null default 'web' check (source in ('web', 'phone', 'referral', 'staff')),
  submitted_ip         inet,
  submitted_user_agent text,
  captcha_verified     boolean not null default false,

  -- Three years, not the five Privacy Policy §9 sets for support records. A
  -- support ticket may be evidence in a dispute about a trade; a sales enquiry
  -- that went nowhere is a marketing record, and DPDP's storage limitation
  -- principle says keep it only as long as the purpose needs it.
  retention_expires_at timestamptz not null default (now() + interval '3 years'),
  legal_hold           boolean not null default false,
  legal_hold_reason    text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contact_enquiries_ref_format check (enquiry_ref ~ '^PG-ENQ-[0-9]{4}-[0-9]{6}$'),
  constraint contact_enquiries_name_len   check (char_length(full_name) between 2 and 120),
  constraint contact_enquiries_email_len  check (char_length(email) between 6 and 254),
  constraint contact_enquiries_email_lowercase check (email = lower(email)),
  constraint contact_enquiries_email_shape
    check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint contact_enquiries_phone_raw_len check (char_length(phone_raw) between 8 and 32),
  constraint contact_enquiries_phone_digits check (phone_digits ~ '^[0-9]{8,15}$'),
  constraint contact_enquiries_message_len  check (message is null or char_length(message) <= 5000),
  constraint contact_enquiries_closed_stamp
    check ((status in ('CONVERTED', 'CLOSED', 'SPAM')) = (closed_at is not null)),
  constraint contact_enquiries_hold_reason
    check ((not legal_hold) or legal_hold_reason is not null),
  constraint contact_enquiries_outcome_len
    check (outcome_note is null or char_length(outcome_note) between 3 and 2000)
);

comment on table public.contact_enquiries is
  'Sales enquiries from ContactModal. Deliberately separate from tickets: enquiries carry no published SLA and must never enter the support queue the SLA is measured on.';
comment on column public.contact_enquiries.internal_follow_up_target_at is
  'INTERNAL working target. Never publish this, never report it as an SLA, and never quote it to an enquirer.';

create index if not exists contact_enquiries_open_idx
  on public.contact_enquiries (internal_follow_up_target_at, created_at)
  where status in ('NEW', 'CONTACTED', 'QUALIFIED');
create index if not exists contact_enquiries_email_idx on public.contact_enquiries (email);
create index if not exists contact_enquiries_assigned_idx on public.contact_enquiries (assigned_to)
  where status in ('NEW', 'CONTACTED', 'QUALIFIED');

drop trigger if exists contact_enquiries_ref on public.contact_enquiries;
create trigger contact_enquiries_ref
  before insert on public.contact_enquiries
  for each row execute function public.set_enquiry_ref();

drop trigger if exists contact_enquiries_updated_at on public.contact_enquiries;
create trigger contact_enquiries_updated_at
  before update on public.contact_enquiries
  for each row execute function public.set_updated_at();

-- Computed once on insert and stored, same reasoning as the ticket SLA in 0009:
-- add_business_time() is STABLE because it reads a calendar table, so a holiday
-- loaded next month must not retroactively move a target already set.
--
-- 16 working hours — two business days, slacker than support's 8 on purpose. An
-- enquiry has no promise attached, and an aggressive internal target on
-- unpromised work is how internal targets start being treated as real deadlines
-- and then leak into customer-facing copy.
create or replace function public.set_enquiry_follow_up_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.internal_follow_up_target_at is null then
    new.internal_follow_up_target_at :=
      public.add_business_time(coalesce(new.created_at, now()), interval '16 hours');
  end if;
  return new;
end;
$$;

drop trigger if exists contact_enquiries_follow_up on public.contact_enquiries;
create trigger contact_enquiries_follow_up
  before insert on public.contact_enquiries
  for each row execute function public.set_enquiry_follow_up_target();

create or replace function public.stamp_enquiry_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'NEW' and old.status = 'NEW' then
    new.first_contacted_at := coalesce(new.first_contacted_at, now());
  end if;

  if new.status in ('CONVERTED', 'CLOSED', 'SPAM') then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;

  if new.closed_at is not null and old.closed_at is distinct from new.closed_at then
    new.retention_expires_at := new.closed_at + interval '3 years';
  end if;

  return new;
end;
$$;

drop trigger if exists contact_enquiries_stamp on public.contact_enquiries;
create trigger contact_enquiries_stamp
  before update on public.contact_enquiries
  for each row execute function public.stamp_enquiry_status();

-- Append-only, like ticket_messages. There is no customer-visible thread here:
-- the enquiry conversation happens on the phone or in a mail client and this is
-- only the record of it.
create table if not exists public.enquiry_notes (
  id           uuid primary key default gen_random_uuid(),
  enquiry_id   uuid not null references public.contact_enquiries (id) on delete cascade,
  author_id    uuid references public.staff_users (id) on delete set null,
  author_label text not null,
  body         text not null,
  created_at   timestamptz not null default now(),

  constraint enquiry_notes_body_len check (char_length(body) between 1 and 5000)
);

create index if not exists enquiry_notes_enquiry_idx on public.enquiry_notes (enquiry_id, created_at);

create or replace function public.reject_enquiry_note_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('platizio.retention_purge', true), '') = 'on'
     and tg_op = 'DELETE' then
    return old;
  end if;
  raise exception 'enquiry_notes is append-only; % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists enquiry_notes_no_update on public.enquiry_notes;
create trigger enquiry_notes_no_update
  before update on public.enquiry_notes
  for each row execute function public.reject_enquiry_note_mutation();

drop trigger if exists enquiry_notes_no_delete on public.enquiry_notes;
create trigger enquiry_notes_no_delete
  before delete on public.enquiry_notes
  for each row execute function public.reject_enquiry_note_mutation();

-- notifications.ticket_id was already nullable, so an enquiry email would have
-- inserted with no subject at all — nothing could then answer "did this enquiry
-- get its acknowledgement", and a purged enquiry would leave its mail behind.
alter table public.notifications
  add column if not exists enquiry_id uuid references public.contact_enquiries (id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_one_subject;
alter table public.notifications add constraint notifications_one_subject
  check (not (ticket_id is not null and enquiry_id is not null));

create index if not exists notifications_enquiry_idx
  on public.notifications (enquiry_id, created_at)
  where enquiry_id is not null;

alter table public.notifications drop constraint if exists notifications_template;
alter table public.notifications add constraint notifications_template check (
  template = any (array[
    'ticket_acknowledgement', 'ticket_reply', 'ticket_resolved',
    'sla_internal_alert', 'status_link',
    'complaint_acknowledgement', 'complaint_closure',
    'enquiry_acknowledgement', 'enquiry_internal_alert'
  ])
);

alter table public.contact_enquiries enable row level security;
alter table public.enquiry_notes     enable row level security;
alter table public.enquiry_interests enable row level security;

drop policy if exists "staff read enquiries" on public.contact_enquiries;
create policy "staff read enquiries"
  on public.contact_enquiries for select to authenticated
  using (public.is_staff());

drop policy if exists "staff read enquiry notes" on public.enquiry_notes;
create policy "staff read enquiry notes"
  on public.enquiry_notes for select to authenticated
  using (public.is_staff());

-- The only thing here a browser legitimately reads: the dropdown has to render.
-- Five product names, disclosing nothing about anybody.
drop policy if exists "anyone reads enquiry interests" on public.enquiry_interests;
create policy "anyone reads enquiry interests"
  on public.enquiry_interests for select to anon, authenticated
  using (is_active);

revoke all on public.contact_enquiries from anon, authenticated;
revoke all on public.enquiry_notes     from anon, authenticated;
revoke all on public.enquiry_interests from anon, authenticated;

grant select on public.contact_enquiries to authenticated;
grant select on public.enquiry_notes     to authenticated;
grant select on public.enquiry_interests to anon, authenticated;

-- consent_records gains a second key BEFORE the purge below reads it. Without
-- the column, an enquiry's consent row would carry a null ticket_id and be
-- caught by the orphan branch of that purge the moment its own three years
-- elapsed — deleting the evidence of consent while the enquiry was still live.
-- plpgsql resolves column names at first execution, so the function would have
-- created cleanly and failed on the first nightly run.
alter table public.consent_records
  add column if not exists enquiry_id uuid references public.contact_enquiries (id) on delete cascade;

alter table public.consent_records drop constraint if exists consent_records_one_subject;
alter table public.consent_records add constraint consent_records_one_subject
  check (not (ticket_id is not null and enquiry_id is not null));

create index if not exists consent_records_enquiry_idx
  on public.consent_records (enquiry_id)
  where enquiry_id is not null;

create or replace function private.purge_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone_complaints integer := 0;
  gone_tickets    integer := 0;
  gone_enquiries  integer := 0;
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

  delete from public.contact_enquiries e
   where e.legal_hold = false
     and e.retention_expires_at < now();
  get diagnostics gone_enquiries = row_count;

  delete from public.consent_records
   where ticket_id is null
     and enquiry_id is null
     and retention_expires_at < now();
  get diagnostics gone_consent = row_count;

  delete from private.rate_limit_hits
   where window_start < now() - interval '2 days';
  get diagnostics gone_ratelimit = row_count;

  perform set_config('platizio.retention_purge', 'off', true);

  return jsonb_build_object(
    'complaints', gone_complaints,
    'tickets', gone_tickets,
    'enquiries', gone_enquiries,
    'consentRecords', gone_consent,
    'rateLimitRows', gone_ratelimit
  );
end;
$$;
