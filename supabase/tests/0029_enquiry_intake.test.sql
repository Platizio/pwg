-- Tests for 0029 — the contact enquiry intake path.
--
-- The invariant worth guarding here is not that the row lands. It is that the
-- row lands in contact_enquiries and *nowhere near* tickets. 0027 exists
-- because an enquiry in the support queue starts a published SLA clock the
-- site never promised for sales, and corrupts the SLA figures the ticketing
-- system exists to make provable. Test 5 is the one that would catch a future
-- refactor quietly merging the two paths.

begin;

select plan(8);

select isnt_empty(
  $$ select 1 from public.enquiry_interests where id = 'us-stocks' $$,
  'the enquiry_interests seed is present'
);

-- ── A plain enquiry ─────────────────────────────────────────────────────────

select lives_ok(
  $$ select public.create_contact_enquiry(jsonb_build_object(
       'idempotencyKey', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'fullName',       'Enquiry Tester',
       'email',          'enquiry@example.com',
       'phoneRaw',       '+91 98765 43210',
       'phoneDigits',    '919876543210',
       'interestId',     'us-stocks',
       'message',        'I would like to know more about opening an account.',
       'consent', jsonb_build_object(
         'text',    'I agree that Platizio Global may use the details above to contact me.',
         'version', '2026-08-14',
         'url',     'https://platizioglobal.com/privacy')
     )) $$,
  'create_contact_enquiry logs an enquiry'
);

select matches(
  (select enquiry_ref from public.contact_enquiries where email = 'enquiry@example.com'),
  '^PG-ENQ-[0-9]{4}-[0-9]{6}$',
  'and the trigger gives it a PG-ENQ reference'
);

select is(
  (select interest_id from public.contact_enquiries where email = 'enquiry@example.com'),
  'us-stocks',
  'and keeps the interest id it was given'
);

-- ── Consent is written, and linked to the enquiry rather than a ticket ──────

select is(
  (select count(*)::int from public.consent_records c
     join public.contact_enquiries e on e.id = c.enquiry_id
    where e.email = 'enquiry@example.com'
      and c.purpose = 'CONTACT_ENQUIRY'
      and c.ticket_id is null),
  1,
  'a CONTACT_ENQUIRY consent record is written against the enquiry'
);

-- ── The separation that 0027 exists to protect ─────────────────────────────

-- Scoped to this enquiry's address rather than asserting the whole table is
-- empty. A global count would pass or fail depending on what other test files
-- had done first, which makes it a test of the suite rather than of the code.
select is(
  (select count(*)::int from public.tickets where requester_email = 'enquiry@example.com'),
  0,
  'and no ticket is created — an enquiry never enters the SLA queue'
);

-- ── An unknown interest costs the hint, not the enquiry ─────────────────────

select lives_ok(
  $$ select public.create_contact_enquiry(jsonb_build_object(
       'idempotencyKey', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       'fullName',       'Stale Dropdown',
       'email',          'stale@example.com',
       'phoneRaw',       '+91 98765 43211',
       'phoneDigits',    '919876543211',
       'interestId',     'crypto-futures',
       'consent', jsonb_build_object(
         'text',    'I agree that Platizio Global may use the details above to contact me.',
         'version', '2026-08-14',
         'url',     'https://platizioglobal.com/privacy')
     )) $$,
  'an interest that no longer exists is dropped rather than losing the enquiry'
);

-- ── A double submit is one enquiry ─────────────────────────────────────────

select is(
  (select (public.create_contact_enquiry(jsonb_build_object(
       'idempotencyKey', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'fullName',       'Enquiry Tester',
       'email',          'enquiry@example.com',
       'phoneRaw',       '+91 98765 43210',
       'phoneDigits',    '919876543210',
       'consent', jsonb_build_object(
         'text',    'I agree that Platizio Global may use the details above to contact me.',
         'version', '2026-08-14',
         'url',     'https://platizioglobal.com/privacy')
     )) ->> 'deduplicated')::boolean),
  true,
  'resubmitting the same idempotency key returns the original rather than duplicating'
);

select * from finish();

rollback;
