-- Tests for 0030 — an enquiry has to tell somebody it arrived.
--
-- The defect these cover is the enquiry-side twin of B1: a row that commits
-- with nobody notified. 0027 built notifications.enquiry_id, the one-subject
-- constraint and both template names; 0029 added the write path and queued
-- nothing. Between them a contact enquiry landed silently — no customer
-- acknowledgement, no internal alert.
--
-- Test 6 is the one that matters most over time. contact_enquiries exists
-- separately from tickets *because* an enquiry carries no published SLA, and
-- 0027 states outright that internal_follow_up_target_at must never be quoted
-- to an enquirer. An acknowledgement that drifts into "we will reply within 24
-- hours" would recreate the promise the whole separation exists to avoid, and
-- it would do so invisibly — the email still sends, the tests still pass, and
-- nobody notices until somebody holds Platizio to a response time it never
-- published.
--
-- Every assertion writes a real row. A test shaped like `where false` reports
-- success whether or not the code was ever fixed.

begin;

select plan(12);

select isnt_empty(
  $$ select 1 from public.enquiry_interests where id = 'us-stocks' $$,
  'the enquiry_interests seed is present'
);

-- ── A plain enquiry, with no alert address configured ───────────────────────
-- Vault is empty in a fresh test database, so private.get_secret returns null
-- for both names and the internal alert is skipped. That is the guard under
-- test in item 7: a missing internal address must never cost the enquiry.

select lives_ok(
  $$ select public.create_contact_enquiry(jsonb_build_object(
       'idempotencyKey', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
       'fullName',       'Ack Tester',
       'email',          'ack@example.com',
       'phoneRaw',       '+91 98765 43220',
       'phoneDigits',    '919876543220',
       'interestId',     'us-stocks',
       'message',        'Please tell me more about opening an account.',
       'consent', jsonb_build_object(
         'text',    'I agree that Platizio Global may use the details above to contact me.',
         'version', '2026-08-14',
         'url',     'https://platizioglobal.com/privacy')
     )) $$,
  'create_contact_enquiry logs an enquiry'
);

-- ── The acknowledgement is queued, and hangs off the enquiry ────────────────

select is(
  (select count(*)::int
     from public.notifications n
     join public.contact_enquiries e on e.id = n.enquiry_id
    where e.email = 'ack@example.com'
      and n.template = 'enquiry_acknowledgement'
      and n.ticket_id is null),
  1,
  'an enquiry_acknowledgement is queued against the enquiry, not a ticket'
);

select is(
  (select n.to_email
     from public.notifications n
     join public.contact_enquiries e on e.id = n.enquiry_id
    where e.email = 'ack@example.com'
      and n.template = 'enquiry_acknowledgement'),
  'ack@example.com',
  'and it is addressed to the person who filled the form'
);

select matches(
  (select n.subject
     from public.notifications n
     join public.contact_enquiries e on e.id = n.enquiry_id
    where e.email = 'ack@example.com'
      and n.template = 'enquiry_acknowledgement'),
  '^\[PG-ENQ-[0-9]{4}-[0-9]{6}\] ',
  'and the subject leads with the PG-ENQ reference'
);

-- ── The invariant worth guarding: no response time is promised ──────────────

-- Lowercased here rather than relying on an inline (?i) flag, so the assertion
-- does not depend on which regex dialect options are available. `hour` matches
-- inside `hours` because the pattern is unanchored.
select doesnt_match(
  (select lower(n.body_text)
     from public.notifications n
     join public.contact_enquiries e on e.id = n.enquiry_id
    where e.email = 'ack@example.com'
      and n.template = 'enquiry_acknowledgement'),
  '(within|in) +[0-9]+ +(hour|business day|working day)',
  'the acknowledgement promises no response time — an enquiry has no published SLA'
);

-- ── A missing internal address costs the alert, never the enquiry ───────────

select is(
  (select count(*)::int
     from public.notifications n
     join public.contact_enquiries e on e.id = n.enquiry_id
    where e.email = 'ack@example.com'
      and n.template = 'enquiry_internal_alert'),
  0,
  'with no alert address in Vault the internal alert is skipped, and the enquiry still stands'
);

-- ── The internal alert renderer itself ──────────────────────────────────────
-- Called directly so this holds whether or not Vault is reachable.

select matches(
  (select private.render_enquiry_internal_alert(e.id) ->> 'bodyText'
     from public.contact_enquiries e where e.email = 'ack@example.com'),
  'ack@example\.com',
  'the internal alert carries the enquirer''s address so the team can reply'
);

-- ── With an address configured, the alert is queued ─────────────────────────
--
-- get_secret is stubbed rather than writing to Vault: the real function reads
-- vault.decrypted_secrets and swallows every exception, so a Vault that is
-- absent or empty in CI would make this test silently assert nothing. The
-- replacement is rolled back with the rest of the transaction.

create or replace function private.get_secret(secret_name text)
returns text
language sql
stable
as $$ select case when secret_name = 'sla_alert_email' then 'ops@platizioglobal.com' end $$;

select lives_ok(
  $$ select public.create_contact_enquiry(jsonb_build_object(
       'idempotencyKey', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
       'fullName',       'Alert Tester',
       'email',          'alert@example.com',
       'phoneRaw',       '+91 98765 43221',
       'phoneDigits',    '919876543221',
       'consent', jsonb_build_object(
         'text',    'I agree that Platizio Global may use the details above to contact me.',
         'version', '2026-08-14',
         'url',     'https://platizioglobal.com/privacy')
     )) $$,
  'an enquiry is logged with an alert address configured'
);

select is(
  (select n.to_email
     from public.notifications n
     join public.contact_enquiries e on e.id = n.enquiry_id
    where e.email = 'alert@example.com'
      and n.template = 'enquiry_internal_alert'),
  'ops@platizioglobal.com',
  'and the internal alert goes to the configured address'
);

-- ── A double submit acknowledges once ──────────────────────────────────────

-- Two assertions rather than one compound expression: combining the call and
-- the count in a single select-list leaves the evaluation order to the planner,
-- which is not something a test should be silently depending on.
select is(
  (select (public.create_contact_enquiry(jsonb_build_object(
       'idempotencyKey', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
       'fullName',       'Ack Tester',
       'email',          'ack@example.com',
       'phoneRaw',       '+91 98765 43220',
       'phoneDigits',    '919876543220',
       'consent', jsonb_build_object(
         'text',    'I agree that Platizio Global may use the details above to contact me.',
         'version', '2026-08-14',
         'url',     'https://platizioglobal.com/privacy')
     )) ->> 'deduplicated')::boolean),
  true,
  'resubmitting the same idempotency key returns the original enquiry'
);

select is(
  (select count(*)::int
     from public.notifications n
     join public.contact_enquiries e on e.id = n.enquiry_id
    where e.email = 'ack@example.com'
      and n.template = 'enquiry_acknowledgement'),
  1,
  'and queues no second acknowledgement'
);

select * from finish();

rollback;
