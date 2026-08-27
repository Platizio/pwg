-- 0029_enquiry_intake_api.sql — give contact_enquiries a way in.
--
-- 0027 built the table, the status enum, the reference generator, the notes
-- table, the three-year retention and the five seeded interests. It granted
-- `select` and nothing else, so there has never been a way to write a row. The
-- enquiry form has continued posting to Web3Forms, which emails the team and
-- persists nothing.
--
-- This is the missing half. It deliberately mirrors create_support_ticket
-- rather than inventing a second shape: same jsonb-payload signature, same
-- consent-first ordering, same idempotency behaviour, same
-- service_role-only grant. An enquiry is not a ticket, but the intake
-- *mechanics* are the same problem and should not be solved twice.
--
-- Consent is required here for the same reason it is on a ticket. The form
-- collects a name, an email address and a phone number, and DPDP does not
-- care that the purpose is commercial rather than support. 0027 already
-- anticipated this: consent_records.purpose accepts 'CONTACT_ENQUIRY' and
-- 0027 added consent_records.enquiry_id specifically so an enquiry's consent
-- row has a parent and is not swept as an orphan.

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

  return jsonb_build_object(
    'enquiryId',    enquiry.id,
    'enquiryRef',   enquiry.enquiry_ref,
    'deduplicated', false
  );
end;
$$;

comment on function public.create_contact_enquiry(jsonb) is
  'Sales enquiry intake. Writes the enquiry and its consent record in one '
  'transaction. Never writes to tickets: an enquiry carries no published SLA '
  'and must not enter the queue the SLA is measured on.';

-- `from public` and not `from anon, authenticated`. Postgres grants EXECUTE to
-- PUBLIC on every new function by default, so revoking from the two named roles
-- leaves the default grant untouched and the function reachable by both.
revoke all on function public.create_contact_enquiry(jsonb) from public, anon, authenticated;

grant execute on function public.create_contact_enquiry(jsonb) to service_role;
