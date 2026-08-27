-- 0028_ticket_source_chatbot.sql — let a ticket say where it actually came from.
--
-- The guided assistant at /help has been sending `source: 'chatbot'` since
-- a132fa7. Nothing has ever received it, because the value is dropped three
-- separate times on the way in:
--
--   1. `parseTicketIntent` in _shared/validation.ts never read `source`, so it
--      was discarded before the RPC was called at all.
--   2. `create_support_ticket` inserted the literal 'web' regardless.
--   3. The CHECK constraint would have rejected 'chatbot' anyway.
--
-- Fixing any one of them alone changes nothing, which is why all three move
-- together. Items 1 and 2 are what actually made every assistant-raised ticket
-- record as 'web'; item 3 is what would have broken once they were fixed.
--
-- On the constraint name: it is `tickets_source`, not `tickets_source_check`.
-- 0003 named it explicitly, so Postgres never appended the `_check` suffix it
-- adds to anonymous constraints. `drop constraint if exists
-- tickets_source_check` is therefore a silent no-op — it succeeds, drops
-- nothing, and leaves the original constraint in force. A test written against
-- that mistake passes vacuously, because a CHECK is never evaluated by a
-- statement that matches no rows.

alter table public.tickets drop constraint if exists tickets_source;

alter table public.tickets
  add constraint tickets_source
  check (source in ('web', 'email', 'phone', 'staff', 'chatbot'));

comment on column public.tickets.source is
  'How the request reached us. ''chatbot'' means the guided assistant at /help; '
  'the taxonomy on those rows came from the node the customer walked to, not '
  'from a dropdown they chose. Deflection reporting reads this column, so a '
  'wrong value here is a wrong number in a board pack.';

-- ─────────────────────────────────────────────────────────────────────────────
-- create_support_ticket, unchanged except that it now honours payload.source.
--
-- Whitelisted here as well as in the constraint on purpose. The constraint is
-- the backstop; this is the error surface, and it raises with a message and an
-- errcode the edge function already knows how to translate. Reaching the
-- constraint instead would surface a 500 to a customer.
--
-- `create or replace` on an unchanged signature preserves the ACL from 0012, so
-- the revoke-from-public / grant-to-service_role there still stands.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.create_support_ticket(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket     public.tickets;
  existing   public.tickets;
  idem       text := nullif(payload ->> 'idempotencyKey', '');
  email      text := lower(trim(payload ->> 'email'));
  src        text := lower(nullif(trim(payload ->> 'source'), ''));
  attachment jsonb;
  att_id     uuid;
  att_path   text;
  results    jsonb := '[]'::jsonb;
  consent    jsonb := payload -> 'consent';
begin
  if consent is null or (consent ->> 'text') is null or (consent ->> 'version') is null then
    raise exception 'a consent record is required to create a ticket'
      using errcode = 'null_value_not_allowed';
  end if;

  -- Absent means the caller did not say, which is the web form. An unrecognised
  -- value means the caller said something we do not accept, and that is an
  -- error rather than something to quietly coerce — a typo'd source would
  -- otherwise land in the deflection figures as a web ticket.
  if src is null then
    src := 'web';
  elsif src not in ('web', 'email', 'phone', 'staff', 'chatbot') then
    raise exception 'unrecognised ticket source: %', src
      using errcode = 'invalid_parameter_value';
  end if;

  if idem is not null then
    select * into existing from public.tickets where idempotency_key = idem;
    if found then
      if existing.requester_email is distinct from email then
        raise exception 'idempotency key does not match its original request'
          using errcode = 'invalid_parameter_value';
      end if;
      return jsonb_build_object(
        'ticketId',      existing.id,
        'ticketRef',     existing.ticket_ref,
        'deduplicated',  true,
        'attachments',   '[]'::jsonb
      );
    end if;
  end if;

  begin
    insert into public.tickets (
      idempotency_key, requester_name, requester_email,
      requester_mobile_raw, requester_mobile_digits,
      category_id, subcategory_id, priority, subject, description,
      source, submitted_ip, submitted_user_agent, captcha_verified
    ) values (
      idem,
      payload ->> 'fullName',
      email,
      payload ->> 'mobileRaw',
      payload ->> 'mobileDigits',
      payload ->> 'categoryId',
      payload ->> 'subcategoryId',
      coalesce((payload ->> 'priority')::public.ticket_priority, 'NORMAL'),
      payload ->> 'subject',
      payload ->> 'description',
      src,
      nullif(payload ->> 'ip', '')::inet,
      nullif(payload ->> 'userAgent', ''),
      coalesce((payload ->> 'captchaVerified')::boolean, false)
    )
    returning * into ticket;
  exception when unique_violation then
    select * into existing from public.tickets where idempotency_key = idem;
    if not found then
      raise;
    end if;
    return jsonb_build_object(
      'ticketId',     existing.id,
      'ticketRef',    existing.ticket_ref,
      'deduplicated', true,
      'attachments',  '[]'::jsonb
    );
  end;

  insert into public.consent_records (
    ticket_id, subject_email, purpose,
    consent_text, policy_version, policy_url,
    ip, user_agent
  ) values (
    ticket.id,
    email,
    'SUPPORT_REQUEST',
    consent ->> 'text',
    consent ->> 'version',
    coalesce(consent ->> 'url', 'https://platizioglobal.com/privacy'),
    nullif(payload ->> 'ip', '')::inet,
    nullif(payload ->> 'userAgent', '')
  );

  for attachment in
    select value from jsonb_array_elements(coalesce(payload -> 'attachments', '[]'::jsonb))
  loop
    att_id   := gen_random_uuid();
    att_path := ticket.id::text || '/' || att_id::text || '-' || (attachment ->> 'safeName');

    insert into public.ticket_attachments (
      id, ticket_id, storage_path, original_filename, declared_mime, declared_bytes
    ) values (
      att_id,
      ticket.id,
      att_path,
      attachment ->> 'filename',
      attachment ->> 'mime',
      (attachment ->> 'bytes')::bigint
    );

    results := results || jsonb_build_array(jsonb_build_object(
      'attachmentId', att_id,
      'path',         att_path,
      'filename',     attachment ->> 'filename'
    ));
  end loop;

  return jsonb_build_object(
    'ticketId',     ticket.id,
    'ticketRef',    ticket.ticket_ref,
    'deduplicated', false,
    'attachments',  results
  );
end;
$$;
