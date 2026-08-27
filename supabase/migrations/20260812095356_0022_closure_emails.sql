-- 0022_closure_emails.sql — the two endings nobody was told about.
--
--   staff_set_status(..., 'RESOLVED') resolved the ticket and sent nothing.
--   staff_close_complaint() wrote the closure summary into an *internal* note,
--   so the outcome of a formal grievance was recorded where the complainant
--   could not see it.

alter table public.notifications
  drop constraint if exists notifications_template;

alter table public.notifications
  add constraint notifications_template check (
    template = any (array[
      'ticket_acknowledgement',
      'ticket_reply',
      'ticket_resolved',
      'sla_internal_alert',
      'status_link',
      'complaint_acknowledgement',
      'complaint_closure'
    ])
  );

create or replace function private.render_ticket_resolved_email(
  p_ticket_id uuid,
  p_note      text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t         record;
  v_note    text := nullif(trim(p_note), '');
  subject   text;
  body_text text;
  body_html text;
begin
  select tk.ticket_ref, tk.requester_name, tk.requester_email, tk.subject as ticket_subject
    into t
  from public.tickets tk
  where tk.id = p_ticket_id;

  if not found then
    raise exception 'no such ticket: %', p_ticket_id;
  end if;

  subject := '[' || t.ticket_ref || '] Resolved — ' || t.ticket_subject;

  body_text := format(
    E'Hi %s,\n\n'
    || E'We have resolved your request %s.\n\n'
    || E'%s'
    || E'If this is not resolved to your satisfaction, reply to this email and it\n'
    || E'reopens — you do not need to raise anything new. If you would rather escalate,\n'
    || E'you can ask for the matter to be treated as a formal grievance, which goes to\n'
    || E'our Grievance Officer and carries its own timeline.\n\n'
    || E'---\n'
    || E'Reference: %s\n'
    || E'Your requests: https://platizioglobal.com/help/status\n\n'
    || E'We will never ask you for your password, your OTP or your full card details.\n\n'
    || E'Platizio Global\n'
    || E'supportglobal@platizio.com  ·  +91 92898 37100\n',
    split_part(trim(t.requester_name), ' ', 1),
    t.ticket_ref,
    case when v_note is null then '' else v_note || E'\n\n' end,
    t.ticket_ref
  );

  body_html := format(
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
    || 'font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">'
    || '<p>Hi %s,</p>'
    || '<p>We have resolved your request <strong>%s</strong>.</p>'
    || '%s'
    || '<p>If this is not resolved to your satisfaction, reply to this email and it '
    || 'reopens — you do not need to raise anything new. If you would rather escalate, '
    || 'you can ask for the matter to be treated as a formal grievance, which goes to '
    || 'our Grievance Officer and carries its own timeline.</p>'
    || '<hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0">'
    || '<p style="color:#666;font-size:13px">Reference <strong>%s</strong>. You can see '
    || 'all your requests at '
    || '<a href="https://platizioglobal.com/help/status">platizioglobal.com/help/status</a>.</p>'
    || '<p style="color:#666;font-size:13px">We will never ask you for your password, '
    || 'your OTP or your full card details.</p>'
    || '<p style="color:#666;font-size:13px">Platizio Global<br>'
    || '<a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a> · +91 92898 37100</p>'
    || '</div>',
    private.html_escape(split_part(trim(t.requester_name), ' ', 1)),
    private.html_escape(t.ticket_ref),
    case when v_note is null then ''
         else '<div>' || replace(private.html_escape(v_note), E'\n', '<br>') || '</div>' end,
    private.html_escape(t.ticket_ref)
  );

  return jsonb_build_object(
    'toEmail',  t.requester_email,
    'subject',  subject,
    'bodyText', body_text,
    'bodyHtml', body_html
  );
end;
$$;

create or replace function private.render_complaint_closure_email(
  p_complaint_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c         record;
  subject   text;
  body_text text;
  body_html text;
begin
  select cp.complaint_ref, cp.closure_summary, cp.created_at, cp.closed_at,
         tk.ticket_ref, tk.requester_name, tk.requester_email
    into c
  from public.complaints cp
  join public.tickets tk on tk.id = cp.ticket_id
  where cp.id = p_complaint_id;

  if not found then
    raise exception 'no such complaint: %', p_complaint_id;
  end if;

  subject := '[' || c.complaint_ref || '] Outcome of your grievance';

  body_text := format(
    E'Hi %s,\n\n'
    || E'We have completed our review of grievance %s, raised on %s against\n'
    || E'request %s.\n\n'
    || E'Our findings:\n\n%s\n\n'
    || E'If you are not satisfied with this outcome, you may escalate the matter to\n'
    || E'the relevant regulator or to arbitration. Reply to this email and we will\n'
    || E'send you the escalation details for your jurisdiction.\n\n'
    || E'---\n'
    || E'Grievance reference: %s\n'
    || E'Related request: %s\n\n'
    || E'Platizio Global\n'
    || E'supportglobal@platizio.com  ·  +91 92898 37100\n',
    split_part(trim(c.requester_name), ' ', 1),
    c.complaint_ref,
    to_char(c.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY'),
    c.ticket_ref,
    c.closure_summary,
    c.complaint_ref,
    c.ticket_ref
  );

  body_html := format(
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
    || 'font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">'
    || '<p>Hi %s,</p>'
    || '<p>We have completed our review of grievance <strong>%s</strong>, raised on %s '
    || 'against request <strong>%s</strong>.</p>'
    || '<p style="font-weight:600;margin-bottom:4px">Our findings</p>'
    || '<div style="padding:12px 16px;background:#F8FAFC;border-left:3px solid #CBD5E1">%s</div>'
    || '<p>If you are not satisfied with this outcome, you may escalate the matter to the '
    || 'relevant regulator or to arbitration. Reply to this email and we will send you the '
    || 'escalation details for your jurisdiction.</p>'
    || '<hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0">'
    || '<p style="color:#666;font-size:13px">Grievance <strong>%s</strong> · related request '
    || '<strong>%s</strong></p>'
    || '<p style="color:#666;font-size:13px">Platizio Global<br>'
    || '<a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a> · +91 92898 37100</p>'
    || '</div>',
    private.html_escape(split_part(trim(c.requester_name), ' ', 1)),
    private.html_escape(c.complaint_ref),
    to_char(c.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY'),
    private.html_escape(c.ticket_ref),
    replace(private.html_escape(c.closure_summary), E'\n', '<br>'),
    private.html_escape(c.complaint_ref),
    private.html_escape(c.ticket_ref)
  );

  return jsonb_build_object(
    'toEmail',  c.requester_email,
    'subject',  subject,
    'bodyText', body_text,
    'bodyHtml', body_html
  );
end;
$$;

-- The transition is captured explicitly rather than inferred from the row
-- afterwards, because derive_customer_status() keeps the *first* resolved_at
-- through a reopen-and-resolve cycle. Reading resolved_at back would say
-- "already resolved" on the second resolution and swallow the email.
create or replace function public.staff_set_status(
  p_ticket_id uuid,
  p_status    public.ticket_status_internal,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := private.require_staff();
  v_before   public.ticket_status_internal;
  v_after    record;
  v_history  bigint;
  v_mail     jsonb;
  v_queued   boolean := false;
begin
  select status_internal into v_before
    from public.tickets where id = p_ticket_id for update;

  if v_before is null then
    raise exception 'no such ticket: %', p_ticket_id using errcode = 'no_data_found';
  end if;

  perform set_config('platizio.status_note', coalesce(trim(p_note), ''), true);

  update public.tickets
     set status_internal = p_status
   where id = p_ticket_id
  returning ticket_ref, status_internal, status_customer into v_after;

  perform set_config('platizio.status_note', '', true);

  if p_status = 'RESOLVED' and v_before is distinct from 'RESOLVED' then
    select max(id) into v_history
      from public.ticket_status_history
     where ticket_id = p_ticket_id;

    v_mail := private.render_ticket_resolved_email(p_ticket_id, p_note);

    insert into public.notifications
      (ticket_id, template, to_email, reply_to, subject, body_text, body_html, dedupe_key)
    values (
      p_ticket_id,
      'ticket_resolved',
      v_mail ->> 'toEmail',
      'supportglobal@platizio.com',
      v_mail ->> 'subject',
      v_mail ->> 'bodyText',
      v_mail ->> 'bodyHtml',
      'resolved:' || coalesce(v_history::text, p_ticket_id::text)
    )
    on conflict (dedupe_key) do nothing;

    v_queued := found;
  end if;

  return jsonb_build_object(
    'ticketRef',      v_after.ticket_ref,
    'statusInternal', v_after.status_internal,
    'statusCustomer', v_after.status_customer,
    'emailQueued',    v_queued
  );
end;
$$;

create or replace function public.staff_close_complaint(
  p_complaint_id uuid,
  p_summary      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := private.require_staff(array['GRIEVANCE_OFFICER']::public.staff_role[]);
  v_after  record;
  v_mail   jsonb;
  v_queued boolean := false;
begin
  if p_summary is null or char_length(trim(p_summary)) < 10 then
    raise exception 'Closing a grievance requires a summary of the outcome (at least 10 characters). It is sent to the complainant.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.complaints
     set stage           = 'CLOSED',
         closed_at       = now(),
         closed_by       = v_actor,
         closure_summary = trim(p_summary),
         resolved_at     = coalesce(resolved_at, now())
   where id = p_complaint_id
  returning complaint_ref, ticket_id into v_after;

  if v_after is null then
    raise exception 'no such complaint: %', p_complaint_id using errcode = 'no_data_found';
  end if;

  insert into public.ticket_messages (ticket_id, author_staff_id, author_kind, body, is_internal_note)
  values (v_after.ticket_id, v_actor, 'STAFF',
          'Grievance ' || v_after.complaint_ref || ' closed: ' || trim(p_summary), true);

  v_mail := private.render_complaint_closure_email(p_complaint_id);

  insert into public.notifications
    (ticket_id, template, to_email, reply_to, subject, body_text, body_html, dedupe_key)
  values (
    v_after.ticket_id,
    'complaint_closure',
    v_mail ->> 'toEmail',
    'supportglobal@platizio.com',
    v_mail ->> 'subject',
    v_mail ->> 'bodyText',
    v_mail ->> 'bodyHtml',
    'complaint-closed:' || p_complaint_id::text
  )
  on conflict (dedupe_key) do nothing;

  v_queued := found;

  return jsonb_build_object(
    'complaintRef', v_after.complaint_ref,
    'stage',        'CLOSED',
    'emailQueued',  v_queued
  );
end;
$$;

revoke all on function public.staff_set_status(uuid, public.ticket_status_internal, text) from public, anon;
revoke all on function public.staff_close_complaint(uuid, text) from public, anon;

grant execute on function public.staff_set_status(uuid, public.ticket_status_internal, text)
  to authenticated, service_role;
grant execute on function public.staff_close_complaint(uuid, text)
  to authenticated, service_role;
