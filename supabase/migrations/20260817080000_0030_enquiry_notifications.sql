-- 0030_enquiry_notifications.sql — make an enquiry tell somebody it arrived.
--
-- 0027 built all the scaffolding for this and stopped short of using it. It
-- added notifications.enquiry_id, the notifications_one_subject constraint that
-- keeps a notification attached to an enquiry *or* a ticket but never both, a
-- partial index on (enquiry_id, created_at), and the two template names
-- 'enquiry_acknowledgement' and 'enquiry_internal_alert'. Nothing has ever
-- inserted either one. 0029 then added the write path and queued nothing.
--
-- So the state before this migration is: a contact enquiry lands in the
-- database silently. The person who filled the form gets a reference number on
-- screen and no email; nobody at Platizio is told a lead came in. Web3Forms is
-- currently masking that, because ContactModal still posts there as a fallback
-- — the moment that fallback is retired, enquiries go into a table nobody is
-- watching.
--
-- This is the same defect as B1 on the ticket path, in a different place: a row
-- that commits without anyone being notified. It is fixed the same way, by
-- queueing inside the intake transaction rather than bolting a send on
-- afterwards.
--
-- What this migration will NOT do is promise a response time. contact_enquiries
-- carries internal_follow_up_target_at, commented in 0027 as "INTERNAL working
-- target. Never publish this, never report it as an SLA, and never quote it to
-- an enquirer." The whole reason enquiries are kept out of the ticket queue is
-- that they carry no published SLA. An acknowledgement that says "we will reply
-- within 24 hours" would invent one in customer-facing copy and undo that
-- separation. The copy below states when the team works, which is a fact about
-- office hours, and commits to nothing.

-- ── Customer acknowledgement ────────────────────────────────────────────────

create or replace function private.render_enquiry_acknowledgement(p_enquiry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e            record;
  sent_at      text;
  first_name   text;
  interest_line text;
  message_block text;
  subject      text;
  body_text    text;
begin
  select en.enquiry_ref,
         en.full_name,
         en.email,
         en.message,
         en.created_at,
         i.label as interest_label
    into e
  from public.contact_enquiries en
  -- Left join: interest_id is nullable by design. 0029 drops an unrecognised
  -- interest rather than losing the enquiry, so this join must tolerate null.
  left join public.enquiry_interests i on i.id = en.interest_id
  where en.id = p_enquiry_id;

  if not found then
    raise exception 'no such enquiry: %', p_enquiry_id;
  end if;

  sent_at    := to_char(e.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') || ' IST';
  first_name := split_part(trim(e.full_name), ' ', 1);
  subject    := '[' || e.enquiry_ref || '] We have your enquiry';

  interest_line := case
    when e.interest_label is null then ''
    else format(E'  Interest    %s\n', e.interest_label)
  end;

  -- Echoed back so the person has a record of what they actually sent. It is
  -- their own text returning to their own address, and the 5,000-character cap
  -- on contact_enquiries.message keeps it well inside the body length limit.
  message_block := case
    when e.message is null then ''
    else format(E'\nWHAT YOU SENT US\n%s\n', e.message)
  end;

  body_text := format(
    E'Hi %s,\n\n'
    || E'Thanks for getting in touch with Platizio Global. Your enquiry has reached\n'
    || E'our team and someone will come back to you at this email address.\n\n'
    || E'  Reference   %s\n'
    || E'%s'
    || E'  Received    %s\n'
    || E'%s\n'
    || E'Our team works Monday to Friday, 9:00 AM to 5:00 PM IST.\n\n'
    || E'ALREADY HAVE AN ACCOUNT AND NEED HELP?\n'
    || E'This is a sales enquiry, so it is not tracked as a support request. If you\n'
    || E'have a problem with an existing account — funding, KYC, a trade, or\n'
    || E'anything time-sensitive — please raise it at\n'
    || E'https://platizioglobal.com/help so it enters our support queue and is\n'
    || E'tracked against our published response times.\n\n'
    || E'SECURITY\n'
    || E'We will never ask you for your password, your OTP or your full card details,\n'
    || E'and neither will anyone else from Platizio. If someone does, it is not us.\n\n'
    || E'Platizio Global\n'
    || E'supportglobal@platizio.com  ·  +91 92898 37100\n',
    first_name,
    e.enquiry_ref,
    interest_line,
    sent_at,
    message_block
  );

  return jsonb_build_object(
    'toEmail',  e.email,
    'subject',  subject,
    'bodyText', body_text
  );
end;
$$;

comment on function private.render_enquiry_acknowledgement(uuid) is
  'Customer-facing enquiry acknowledgement. Deliberately states office hours and '
  'no response time: an enquiry carries no published SLA, and quoting '
  'internal_follow_up_target_at to an enquirer is forbidden by 0027.';

-- ── Internal alert ──────────────────────────────────────────────────────────

create or replace function private.render_enquiry_internal_alert(p_enquiry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e         record;
  sent_at   text;
  subject   text;
  body_text text;
begin
  select en.enquiry_ref,
         en.full_name,
         en.email,
         en.phone_raw,
         en.message,
         en.captcha_verified,
         en.created_at,
         i.label as interest_label
    into e
  from public.contact_enquiries en
  left join public.enquiry_interests i on i.id = en.interest_id
  where en.id = p_enquiry_id;

  if not found then
    raise exception 'no such enquiry: %', p_enquiry_id;
  end if;

  sent_at := to_char(e.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') || ' IST';
  subject := 'New enquiry: ' || e.enquiry_ref
             || coalesce(' — ' || e.interest_label, '');

  body_text := format(
    E'A new enquiry came in through the website contact form.\n\n'
    || E'  Reference   %s\n'
    || E'  Name        %s\n'
    || E'  Email       %s\n'
    || E'  Phone       %s\n'
    || E'  Interest    %s\n'
    || E'  Received    %s\n'
    || E'  Captcha     %s\n\n'
    || E'MESSAGE\n%s\n\n'
    || E'This is an internal alert. The enquirer has been sent an acknowledgement\n'
    || E'that promises no response time, so there is no published clock on this —\n'
    || E'but there is also nothing chasing it. It will not appear in the support\n'
    || E'queue and no SLA sweep will surface it.\n',
    e.enquiry_ref,
    e.full_name,
    e.email,
    e.phone_raw,
    coalesce(e.interest_label, 'not specified'),
    sent_at,
    case when e.captcha_verified then 'verified' else 'NOT VERIFIED' end,
    coalesce(e.message, '(no message)')
  );

  return jsonb_build_object(
    'subject',  subject,
    'bodyText', body_text
  );
end;
$$;

comment on function private.render_enquiry_internal_alert(uuid) is
  'Team-facing new-enquiry alert. Nothing else surfaces an enquiry — it never '
  'enters the support queue and no SLA sweep looks at it.';

-- ── Intake, now queueing both ───────────────────────────────────────────────
--
-- Rewritten rather than patched so the whole function reads in one piece. The
-- only change from 0029 is the block at the end.

create or replace function public.create_contact_enquiry(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  enquiry  public.contact_enquiries;
  existing public.contact_enquiries;
  idem     text := nullif(payload ->> 'idempotencyKey', '');
  email    text := lower(trim(payload ->> 'email'));
  interest text := nullif(trim(payload ->> 'interestId'), '');
  msg      text := nullif(trim(payload ->> 'message'), '');
  consent  jsonb := payload -> 'consent';
  ack      jsonb;
  alert    jsonb;
  alert_to text;
begin
  if consent is null or (consent ->> 'text') is null or (consent ->> 'version') is null then
    raise exception 'a consent record is required to log an enquiry'
      using errcode = 'null_value_not_allowed';
  end if;

  -- An unknown interest is dropped rather than raising. The dropdown is
  -- optional and cosmetic — it routes the enquiry to the right person, it is
  -- not the enquiry. Losing a stale value is a far better outcome for the
  -- customer than losing the enquiry, which is what a foreign key violation
  -- here would cost them.
  if interest is not null
     and not exists (select 1 from public.enquiry_interests where id = interest) then
    raise notice 'dropping unrecognised interest %', interest;
    interest := null;
  end if;

  if idem is not null then
    select * into existing from public.contact_enquiries where idempotency_key = idem;
    if found then
      if existing.email is distinct from email then
        raise exception 'idempotency key does not match its original enquiry'
          using errcode = 'invalid_parameter_value';
      end if;
      -- Returns before the queueing block below, so a resubmitted form does not
      -- send a second acknowledgement. The dedupe keys would catch it anyway;
      -- this makes it true by control flow as well.
      return jsonb_build_object(
        'enquiryId',    existing.id,
        'enquiryRef',   existing.enquiry_ref,
        'deduplicated', true
      );
    end if;
  end if;

  begin
    insert into public.contact_enquiries (
      idempotency_key, full_name, email, phone_raw, phone_digits,
      interest_id, message, source,
      submitted_ip, submitted_user_agent, captcha_verified
    ) values (
      idem,
      payload ->> 'fullName',
      email,
      payload ->> 'phoneRaw',
      payload ->> 'phoneDigits',
      interest,
      msg,
      'web',
      nullif(payload ->> 'ip', '')::inet,
      nullif(payload ->> 'userAgent', ''),
      coalesce((payload ->> 'captchaVerified')::boolean, false)
    )
    returning * into enquiry;
  exception when unique_violation then
    -- Two submissions of the same form racing each other. The loser reads back
    -- the winner's row instead of failing, which is what create_support_ticket
    -- does and for the same reason: a double-click is not an error.
    select * into existing from public.contact_enquiries where idempotency_key = idem;
    if not found then
      raise;
    end if;
    return jsonb_build_object(
      'enquiryId',    existing.id,
      'enquiryRef',   existing.enquiry_ref,
      'deduplicated', true
    );
  end;

  insert into public.consent_records (
    enquiry_id, subject_email, purpose,
    consent_text, policy_version, policy_url,
    ip, user_agent,
    -- Matched to the enquiry's own three years rather than left at the
    -- five-year default meant for support records. Consent evidence that
    -- outlives the thing it was given for is data kept without a purpose.
    retention_expires_at
  ) values (
    enquiry.id,
    email,
    'CONTACT_ENQUIRY',
    consent ->> 'text',
    consent ->> 'version',
    coalesce(consent ->> 'url', 'https://platizioglobal.com/privacy'),
    nullif(payload ->> 'ip', '')::inet,
    nullif(payload ->> 'userAgent', ''),
    enquiry.retention_expires_at
  );

  -- ── Queue the mail, in this transaction ───────────────────────────────────
  --
  -- Rows only. Nothing is sent here; drain-outbox does that on the minute. That
  -- is the point of the outbox — a slow or unreachable Resend can never fail a
  -- customer's submission.

  ack := private.render_enquiry_acknowledgement(enquiry.id);

  -- Cannot fail on shape: contact_enquiries_email_shape enforces exactly the
  -- same regex as notifications_to_email_shape, so an address that reached this
  -- row will satisfy the outbox too.
  insert into public.notifications (
    enquiry_id, template, to_email, reply_to, subject, body_text, dedupe_key
  ) values (
    enquiry.id,
    'enquiry_acknowledgement',
    ack ->> 'toEmail',
    'supportglobal@platizio.com',
    ack ->> 'subject',
    ack ->> 'bodyText',
    'enquiry-ack:' || enquiry.id::text
  )
  on conflict (dedupe_key) do nothing;

  -- A dedicated address if one is set, else the SLA alert address, which is the
  -- one an operator already has to configure. Falling back means this works
  -- with the Vault secrets that already exist rather than adding a fourth that
  -- silently has to be discovered.
  alert_to := coalesce(
    private.get_secret('enquiry_alert_email'),
    private.get_secret('sla_alert_email')
  );

  -- Guarded on shape, and skipped rather than raised. The alert address comes
  -- from Vault and nothing validates it there; a typo would fail
  -- notifications_to_email_shape, abort this transaction, and lose the
  -- customer's enquiry to protect an internal convenience. That trade is the
  -- wrong way round.
  if alert_to is not null
     and alert_to ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    alert := private.render_enquiry_internal_alert(enquiry.id);

    insert into public.notifications (
      enquiry_id, template, to_email, reply_to, subject, body_text, dedupe_key
    ) values (
      enquiry.id,
      'enquiry_internal_alert',
      alert_to,
      enquiry.email,
      alert ->> 'subject',
      alert ->> 'bodyText',
      'enquiry-alert:' || enquiry.id::text
    )
    on conflict (dedupe_key) do nothing;
  else
    raise notice
      'no usable enquiry alert address in Vault (enquiry_alert_email / sla_alert_email) — % logged with no internal alert',
      enquiry.enquiry_ref;
  end if;

  return jsonb_build_object(
    'enquiryId',        enquiry.id,
    'enquiryRef',       enquiry.enquiry_ref,
    'deduplicated',     false,
    'acknowledgementQueued', true,
    'internalAlertQueued',   alert_to is not null
  );
end;
$$;

comment on function public.create_contact_enquiry(jsonb) is
  'Sales enquiry intake. Writes the enquiry, its consent record and both outbox '
  'rows in one transaction. Never writes to tickets: an enquiry carries no '
  'published SLA and must not enter the queue the SLA is measured on.';

-- Re-stated because CREATE OR REPLACE FUNCTION leaves existing grants alone but
-- a future DROP-and-recreate would restore the default PUBLIC grant. `from
-- public` and not `from anon, authenticated`: Postgres grants EXECUTE to PUBLIC
-- on every new function, so revoking from the two named roles leaves the
-- default grant untouched and the function reachable by both.
revoke all on function public.create_contact_enquiry(jsonb) from public, anon, authenticated;

grant execute on function public.create_contact_enquiry(jsonb) to service_role;
