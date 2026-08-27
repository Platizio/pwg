-- Regression tests for 0028 — the ticket source defect.
--
-- Every assertion here writes or updates a real row, and that is the point. A
-- CHECK constraint is only evaluated against rows a statement actually touches,
-- so a test shaped like `update ... where false` reports success whether or not
-- the constraint was ever fixed. The superseded plan shipped exactly that test
-- and it passed against the broken code.
--
-- The defect had three parts and needed all three fixed together: the
-- constraint omitted 'chatbot', create_support_ticket inserted the literal
-- 'web', and parseTicketIntent never read `source` at all. Tests 2 and 3 below
-- are what catch the second one, which is the part that would otherwise survive
-- silently — the ticket is created, it just lies about where it came from.

begin;

select plan(8);

-- ── Fixture ─────────────────────────────────────────────────────────────────
-- Named rather than looked up, so a failure here reads as "the seed changed"
-- rather than as a confusing cascade through the tests that depend on it.

select isnt_empty(
  $$ select 1 from public.ticket_subcategories
      where id = 'account-opening' and category_id = 'account-kyc' $$,
  'the account-kyc / account-opening taxonomy pair is seeded'
);

-- ── A chatbot ticket can be raised, and is stored as a chatbot ticket ───────

select lives_ok(
  $$ select public.create_support_ticket(jsonb_build_object(
       'idempotencyKey', '11111111-1111-4111-8111-111111111111',
       'fullName',       'Chatbot Tester',
       'email',          'chatbot-source@example.com',
       'mobileRaw',      '+91 98765 43210',
       'mobileDigits',   '919876543210',
       'categoryId',     'account-kyc',
       'subcategoryId',  'account-opening',
       'priority',       'NORMAL',
       'source',         'chatbot',
       'subject',        'Raised from the guided assistant',
       'description',    'This description is comfortably over the twenty character minimum.',
       'consent', jsonb_build_object(
         'text',    'I agree that Platizio Global may use these details to respond.',
         'version', '2026-08-13',
         'url',     'https://platizioglobal.com/privacy')
     )) $$,
  'create_support_ticket accepts source = chatbot'
);

select is(
  (select source from public.tickets where requester_email = 'chatbot-source@example.com'),
  'chatbot',
  'and stores it as chatbot rather than rewriting it to web'
);

-- ── Omitting source still means the plain web form ──────────────────────────

select lives_ok(
  $$ select public.create_support_ticket(jsonb_build_object(
       'idempotencyKey', '22222222-2222-4222-8222-222222222222',
       'fullName',       'Web Tester',
       'email',          'web-source@example.com',
       'mobileRaw',      '+91 98765 43211',
       'mobileDigits',   '919876543211',
       'categoryId',     'account-kyc',
       'subcategoryId',  'account-opening',
       'priority',       'NORMAL',
       'subject',        'Raised from the plain form',
       'description',    'This description is comfortably over the twenty character minimum.',
       'consent', jsonb_build_object(
         'text',    'I agree that Platizio Global may use these details to respond.',
         'version', '2026-08-13',
         'url',     'https://platizioglobal.com/privacy')
     )) $$,
  'create_support_ticket still works with no source at all'
);

select is(
  (select source from public.tickets where requester_email = 'web-source@example.com'),
  'web',
  'and defaults it to web'
);

-- ── An unrecognised source is refused, not coerced ──────────────────────────
-- Coercing it to 'web' is what hid the original bug; a bad value should be
-- loud.

select throws_ok(
  $$ select public.create_support_ticket(jsonb_build_object(
       'idempotencyKey', '33333333-3333-4333-8333-333333333333',
       'fullName',       'Bad Source',
       'email',          'bad-source@example.com',
       'mobileRaw',      '+91 98765 43212',
       'mobileDigits',   '919876543212',
       'categoryId',     'account-kyc',
       'subcategoryId',  'account-opening',
       'priority',       'NORMAL',
       'source',         'carrier-pigeon',
       'subject',        'Raised by bird',
       'description',    'This description is comfortably over the twenty character minimum.',
       'consent', jsonb_build_object(
         'text',    'I agree that Platizio Global may use these details to respond.',
         'version', '2026-08-13',
         'url',     'https://platizioglobal.com/privacy')
     )) $$,
  '22023',
  null,
  'an unrecognised source raises invalid_parameter_value rather than defaulting'
);

-- ── The constraint itself is live ───────────────────────────────────────────
-- These run against a row that exists, so the CHECK is genuinely evaluated.
-- Without that, both would pass against the un-migrated database.

select throws_ok(
  $$ update public.tickets set source = 'postal'
      where requester_email = 'chatbot-source@example.com' $$,
  '23514',
  null,
  'tickets_source rejects a value outside the allowed set'
);

select lives_ok(
  $$ update public.tickets set source = 'staff'
      where requester_email = 'chatbot-source@example.com' $$,
  'and still allows staff, which the agent-raised path depends on'
);

select * from finish();

rollback;
