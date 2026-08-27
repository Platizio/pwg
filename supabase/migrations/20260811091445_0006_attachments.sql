insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  5242880,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.ticket_attachments (
  id        uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  bucket_id    text not null default 'ticket-attachments',
  storage_path text not null unique,
  original_filename text not null,
  declared_mime  text not null,
  verified_mime  text,
  declared_bytes bigint not null,
  verified_bytes bigint,
  verification_state text not null default 'PENDING'
    check (verification_state in ('PENDING', 'VERIFIED', 'REJECTED', 'MISSING')),
  rejection_reason text,
  created_at  timestamptz not null default now(),
  uploaded_at timestamptz,
  constraint ticket_attachments_filename_len
    check (char_length(original_filename) between 1 and 255),
  constraint ticket_attachments_declared_mime
    check (declared_mime in ('application/pdf', 'image/png', 'image/jpeg')),
  constraint ticket_attachments_size
    check (declared_bytes > 0 and declared_bytes <= 5242880),
  constraint ticket_attachments_verified_size
    check (verified_bytes is null or (verified_bytes > 0 and verified_bytes <= 5242880)),
  constraint ticket_attachments_verified_stamp
    check ((verification_state = 'VERIFIED') = (uploaded_at is not null)),
  constraint ticket_attachments_rejection_reason
    check ((verification_state in ('REJECTED', 'MISSING')) = (rejection_reason is not null)),
  constraint ticket_attachments_path_under_ticket
    check (storage_path like ticket_id::text || '/%')
);

comment on table public.ticket_attachments is
  'One row per file offered at intake. verified_mime is read from the bytes in Storage, not from the browser.';

create index ticket_attachments_ticket_idx  on public.ticket_attachments (ticket_id);
create index ticket_attachments_pending_idx on public.ticket_attachments (created_at)
  where verification_state = 'PENDING';

create or replace function public.enforce_attachment_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing integer;
begin
  select count(*) into existing
  from public.ticket_attachments
  where ticket_id = new.ticket_id;

  if existing >= 3 then
    raise exception 'a ticket may carry at most 3 attachments'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger ticket_attachments_limit
  before insert on public.ticket_attachments
  for each row execute function public.enforce_attachment_limit();
