create table public.notifications (
  id        uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets (id) on delete cascade,
  channel  text not null default 'email' check (channel in ('email')),
  template text not null,
  to_email text not null,
  reply_to text,
  subject   text not null,
  body_text text not null,
  body_html text,
  status   public.notification_status not null default 'PENDING',
  attempts integer not null default 0,
  max_attempts    integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  provider            text,
  provider_message_id text,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at    timestamptz,
  constraint notifications_template
    check (template in ('ticket_acknowledgement', 'ticket_reply', 'sla_internal_alert')),
  constraint notifications_to_email_shape
    check (to_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint notifications_subject_len check (char_length(subject) between 3 and 300),
  constraint notifications_body_len    check (char_length(body_text) between 10 and 100000),
  constraint notifications_attempts    check (attempts >= 0 and attempts <= max_attempts),
  constraint notifications_sent_stamp  check ((status = 'SENT') = (sent_at is not null))
);

comment on table public.notifications is
  'Transactional email outbox. Written inside the intake transaction; drained by the drain-outbox worker.';
comment on column public.notifications.dedupe_key is
  'Unique. Makes enqueueing idempotent, so a retried finalize cannot send a second acknowledgement.';

create index notifications_due_idx on public.notifications (next_attempt_at)
  where status = 'PENDING';
create index notifications_ticket_idx on public.notifications (ticket_id, created_at);
create index notifications_stuck_idx on public.notifications (updated_at)
  where status = 'SENDING';

create trigger notifications_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();
