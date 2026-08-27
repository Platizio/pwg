create or replace function public.rate_limit_consume(
  p_bucket text,
  p_limit  integer,
  p_window interval
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  window_seconds double precision := extract(epoch from p_window);
  window_start   timestamptz;
  current_hits   integer;
begin
  if p_bucket is null or p_limit is null or window_seconds is null or window_seconds <= 0 then
    raise exception 'rate_limit_consume requires a bucket, a limit and a positive window';
  end if;

  window_start := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);

  insert into private.rate_limit_hits (bucket, window_start, hits)
  values (p_bucket, window_start, 1)
  on conflict (bucket, window_start)
    do update set hits = private.rate_limit_hits.hits + 1
  returning hits into current_hits;

  return jsonb_build_object(
    'allowed', current_hits <= p_limit,
    'hits',    current_hits,
    'limit',   p_limit,
    'resetAt', window_start + p_window
  );
end;
$$;

create or replace function private.html_escape(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(replace(replace(
           coalesce(raw, ''),
           '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function private.render_ticket_acknowledgement(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t          record;
  raised_at  text;
  first_name text;
  subject    text;
  body_text  text;
  body_html  text;
begin
  select tk.ticket_ref,
         tk.requester_name,
         tk.requester_email,
         tk.subject as ticket_subject,
         tk.created_at,
         c.label  as category_label,
         s.label  as subcategory_label
    into t
  from public.tickets tk
  join public.ticket_categories    c on c.id = tk.category_id
  join public.ticket_subcategories s on s.id = tk.subcategory_id
  where tk.id = p_ticket_id;

  if not found then
    raise exception 'no such ticket: %', p_ticket_id;
  end if;

  raised_at  := to_char(t.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') || ' IST';
  first_name := split_part(trim(t.requester_name), ' ', 1);
  subject    := '[' || t.ticket_ref || '] We have your support request';

  body_text := format(
    E'Hi %s,\n\n'
    || E'Thanks for contacting Platizio Global. Your request has been logged and our\n'
    || E'support team will reply to this email address.\n\n'
    || E'  Reference   %s\n'
    || E'  Subject     %s\n'
    || E'  Category    %s / %s\n'
    || E'  Raised      %s\n\n'
    || E'Please quote the reference above if you write to us about this again.\n\n'
    || E'WHAT HAPPENS NEXT\n'
    || E'We reply within 24 hours on business days — Monday to Friday, 9:00 AM to\n'
    || E'5:00 PM IST. Most queries are resolved within 1 to 5 days. If your request\n'
    || E'involves funding, settlement or custody, we may need to check with our broker\n'
    || E'partner before we can answer.\n\n'
    || E'If you are not satisfied with how this is handled, you can escalate through\n'
    || E'our grievance process: https://platizioglobal.com/help/grievance\n\n'
    || E'SECURITY\n'
    || E'We will never ask you for your password, your OTP or your full card details,\n'
    || E'and neither will anyone else from Platizio. If someone does, it is not us.\n\n'
    || E'Platizio Global\n'
    || E'supportglobal@platizio.com  ·  +91 92898 37100\n',
    first_name,
    t.ticket_ref,
    t.ticket_subject,
    t.category_label,
    t.subcategory_label,
    raised_at
  );

  body_html := format(
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
    || 'font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">'
    || '<p>Hi %s,</p>'
    || '<p>Thanks for contacting Platizio Global. Your request has been logged and our '
    || 'support team will reply to this email address.</p>'
    || '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0">'
    || '<tr><td style="padding:4px 16px 4px 0;color:#666">Reference</td>'
    || '<td style="padding:4px 0"><strong>%s</strong></td></tr>'
    || '<tr><td style="padding:4px 16px 4px 0;color:#666">Subject</td><td style="padding:4px 0">%s</td></tr>'
    || '<tr><td style="padding:4px 16px 4px 0;color:#666">Category</td><td style="padding:4px 0">%s / %s</td></tr>'
    || '<tr><td style="padding:4px 16px 4px 0;color:#666">Raised</td><td style="padding:4px 0">%s</td></tr>'
    || '</table>'
    || '<p>Please quote the reference above if you write to us about this again.</p>'
    || '<p><strong>What happens next</strong><br>We reply within 24 hours on business days '
    || '— Monday to Friday, 9:00 AM to 5:00 PM IST. Most queries are resolved within 1 to 5 days. '
    || 'If your request involves funding, settlement or custody, we may need to check with our '
    || 'broker partner before we can answer.</p>'
    || '<p>If you are not satisfied with how this is handled, you can escalate through our '
    || '<a href="https://platizioglobal.com/help/grievance">grievance process</a>.</p>'
    || '<p style="background:#fff8e6;border-left:3px solid #d9a441;padding:10px 14px">'
    || '<strong>Security</strong><br>We will never ask you for your password, your OTP or your '
    || 'full card details, and neither will anyone else from Platizio. If someone does, it is not us.</p>'
    || '<p style="color:#666;font-size:13px">Platizio Global<br>'
    || '<a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a> · +91 92898 37100</p>'
    || '</div>',
    private.html_escape(first_name),
    private.html_escape(t.ticket_ref),
    private.html_escape(t.ticket_subject),
    private.html_escape(t.category_label),
    private.html_escape(t.subcategory_label),
    private.html_escape(raised_at)
  );

  return jsonb_build_object(
    'toEmail',  t.requester_email,
    'subject',  subject,
    'bodyText', body_text,
    'bodyHtml', body_html
  );
end;
$$;

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
      'web',
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

create or replace function public.finalize_support_ticket(
  p_ticket_id uuid,
  p_results   jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket   public.tickets;
  result   jsonb;
  ack      jsonb;
  queued   boolean := false;
  verified integer := 0;
  failed   integer := 0;
begin
  select * into ticket from public.tickets where id = p_ticket_id;
  if not found then
    raise exception 'no such ticket: %', p_ticket_id using errcode = 'no_data_found';
  end if;

  for result in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    update public.ticket_attachments a
       set verification_state = result ->> 'state',
           verified_mime      = nullif(result ->> 'verifiedMime', ''),
           verified_bytes     = (result ->> 'verifiedBytes')::bigint,
           rejection_reason   = nullif(result ->> 'reason', ''),
           uploaded_at        = case when (result ->> 'state') = 'VERIFIED' then now() else null end
     where a.id = (result ->> 'attachmentId')::uuid
       and a.ticket_id = p_ticket_id;

    if (result ->> 'state') = 'VERIFIED' then
      verified := verified + 1;
    else
      failed := failed + 1;
    end if;
  end loop;

  update public.tickets
     set finalized_at = coalesce(finalized_at, now())
   where id = p_ticket_id;

  ack := private.render_ticket_acknowledgement(p_ticket_id);

  insert into public.notifications (
    ticket_id, template, to_email, reply_to, subject, body_text, body_html, dedupe_key
  ) values (
    p_ticket_id,
    'ticket_acknowledgement',
    ack ->> 'toEmail',
    'supportglobal@platizio.com',
    ack ->> 'subject',
    ack ->> 'bodyText',
    ack ->> 'bodyHtml',
    'ack:' || p_ticket_id::text
  )
  on conflict (dedupe_key) do nothing;

  queued := found;

  return jsonb_build_object(
    'ticketRef',              ticket.ticket_ref,
    'acknowledgementQueued',  queued,
    'attachmentsVerified',    verified,
    'attachmentsFailed',      failed
  );
end;
$$;

create or replace function public.claim_notifications(p_limit integer default 10)
returns setof public.notifications
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select n.id
    from public.notifications n
    where n.status = 'PENDING'
      and n.next_attempt_at <= now()
      and n.attempts < n.max_attempts
    order by n.next_attempt_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.notifications n
     set status   = 'SENDING',
         attempts = n.attempts + 1
    from due
   where n.id = due.id
  returning n.*;
end;
$$;

create or replace function public.complete_notification(
  p_id         uuid,
  p_ok         boolean,
  p_provider   text default null,
  p_message_id text default null,
  p_error      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ok then
    update public.notifications
       set status              = 'SENT',
           sent_at             = now(),
           provider            = p_provider,
           provider_message_id = p_message_id,
           last_error          = null
     where id = p_id;
  else
    update public.notifications
       set status          = case when attempts >= max_attempts
                                  then 'FAILED'::public.notification_status
                                  else 'PENDING'::public.notification_status end,
           next_attempt_at = now() + (interval '1 minute' * power(3, greatest(attempts - 1, 0))),
           last_error      = left(coalesce(p_error, 'unknown error'), 2000),
           provider        = coalesce(p_provider, provider)
     where id = p_id;
  end if;
end;
$$;

create or replace function public.list_sweepable_attachments(p_limit integer default 100)
returns table (
  attachment_id uuid,
  storage_path  text,
  reason        text
)
language sql
security definer
set search_path = ''
as $$
  select a.id, a.storage_path, 'orphaned'::text
  from public.ticket_attachments a
  where a.verification_state = 'PENDING'
    and a.created_at < now() - interval '6 hours'

  union all

  select a.id, a.storage_path, 'retention_expired'::text
  from public.ticket_attachments a
  join public.tickets t on t.id = a.ticket_id
  where t.legal_hold = false
    and t.attachment_retention_expires_at < now()

  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.confirm_attachments_swept(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.ticket_attachments where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function
  public.rate_limit_consume(text, integer, interval),
  public.create_support_ticket(jsonb),
  public.finalize_support_ticket(uuid, jsonb),
  public.claim_notifications(integer),
  public.complete_notification(uuid, boolean, text, text, text),
  public.list_sweepable_attachments(integer),
  public.confirm_attachments_swept(uuid[])
from public, anon, authenticated;

grant execute on function
  public.rate_limit_consume(text, integer, interval),
  public.create_support_ticket(jsonb),
  public.finalize_support_ticket(uuid, jsonb),
  public.claim_notifications(integer),
  public.complete_notification(uuid, boolean, text, text, text),
  public.list_sweepable_attachments(integer),
  public.confirm_attachments_swept(uuid[])
to service_role;
