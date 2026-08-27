alter table public.complaints
  add column acknowledgement_breached boolean not null default false,
  add column resolution_breached      boolean not null default false,
  add column sla_warned_at            timestamptz;

create index complaints_ack_due_idx on public.complaints (acknowledgement_due_at)
  where acknowledged_at is null;

alter table public.notifications drop constraint notifications_template;
alter table public.notifications add constraint notifications_template
  check (template in (
    'ticket_acknowledgement',
    'ticket_reply',
    'sla_internal_alert',
    'status_link',
    'complaint_acknowledgement'
  ));

create or replace function private.render_complaint_acknowledgement(p_complaint_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c         record;
  body_text text;
  body_html text;
begin
  select cp.complaint_ref,
         tk.ticket_ref,
         tk.requester_name,
         tk.requester_email,
         tk.subject as ticket_subject,
         cp.created_at
    into c
  from public.complaints cp
  join public.tickets tk on tk.id = cp.ticket_id
  where cp.id = p_complaint_id;

  if not found then
    raise exception 'no such complaint: %', p_complaint_id;
  end if;

  body_text := format(
    E'Hi %s,\n\n'
    || E'We have registered your grievance and it is now with our Grievance Officer.\n\n'
    || E'  Grievance reference   %s\n'
    || E'  Original request      %s\n'
    || E'  Subject               %s\n'
    || E'  Registered            %s IST\n\n'
    || E'WHAT HAPPENS NEXT\n'
    || E'Grievances are acknowledged within 24 hours and addressed within 15 working\n'
    || E'days, subject to Applicable Law and the nature of the issue. This email is\n'
    || E'that acknowledgement.\n\n'
    || E'If the matter is still unresolved thirty days after being raised with the\n'
    || E'Grievance Officer, it may be referred to arbitration under the Arbitration\n'
    || E'and Conciliation Act, 1996. The full escalation ladder is published at\n'
    || E'https://platizioglobal.com/help/grievance\n\n'
    || E'Please quote the grievance reference above in any further correspondence.\n\n'
    || E'Platizio Global\n'
    || E'grievances@platizio.com\n',
    split_part(trim(c.requester_name), ' ', 1),
    c.complaint_ref,
    c.ticket_ref,
    c.ticket_subject,
    to_char(c.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI')
  );

  body_html := format(
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
    || 'font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">'
    || '<p>Hi %s,</p>'
    || '<p>We have registered your grievance and it is now with our Grievance Officer.</p>'
    || '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0">'
    || '<tr><td style="padding:4px 16px 4px 0;color:#666">Grievance reference</td>'
    || '<td style="padding:4px 0"><strong>%s</strong></td></tr>'
    || '<tr><td style="padding:4px 16px 4px 0;color:#666">Original request</td><td style="padding:4px 0">%s</td></tr>'
    || '<tr><td style="padding:4px 16px 4px 0;color:#666">Subject</td><td style="padding:4px 0">%s</td></tr>'
    || '<tr><td style="padding:4px 16px 4px 0;color:#666">Registered</td><td style="padding:4px 0">%s IST</td></tr>'
    || '</table>'
    || '<p><strong>What happens next</strong><br>Grievances are acknowledged within 24 hours and '
    || 'addressed within 15 working days, subject to Applicable Law and the nature of the issue. '
    || 'This email is that acknowledgement.</p>'
    || '<p>If the matter is still unresolved thirty days after being raised with the Grievance '
    || 'Officer, it may be referred to arbitration under the Arbitration and Conciliation Act, 1996. '
    || 'The full escalation ladder is published at '
    || '<a href="https://platizioglobal.com/help/grievance">platizioglobal.com/help/grievance</a>.</p>'
    || '<p style="color:#666;font-size:13px">Please quote the grievance reference above in any '
    || 'further correspondence.</p>'
    || '<p style="color:#666;font-size:13px">Platizio Global<br>'
    || '<a href="mailto:grievances@platizio.com">grievances@platizio.com</a></p>'
    || '</div>',
    private.html_escape(split_part(trim(c.requester_name), ' ', 1)),
    private.html_escape(c.complaint_ref),
    private.html_escape(c.ticket_ref),
    private.html_escape(c.ticket_subject),
    private.html_escape(to_char(c.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI'))
  );

  return jsonb_build_object(
    'toEmail',  c.requester_email,
    'subject',  '[' || c.complaint_ref || '] We have registered your grievance',
    'bodyText', body_text,
    'bodyHtml', body_html
  );
end;
$$;

create or replace function public.staff_raise_complaint(
  p_ticket_id uuid,
  p_summary   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := private.require_staff();
  v_ticket public.tickets;
  v_id     uuid;
  v_ref    text;
  v_mail   jsonb;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id;
  if not found then
    raise exception 'no such ticket: %', p_ticket_id using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.complaints c where c.ticket_id = p_ticket_id) then
    raise exception 'That request already has a grievance against it'
      using errcode = 'unique_violation';
  end if;

  insert into public.complaints (ticket_id, stage, acknowledged_at)
  values (p_ticket_id, 'ACKNOWLEDGED', now())
  returning id, complaint_ref into v_id, v_ref;

  if v_ticket.status_internal in ('RESOLVED', 'CLOSED') then
    perform set_config('platizio.status_note',
      'reopened: grievance ' || v_ref || ' raised', true);
    update public.tickets set status_internal = 'IN_PROGRESS' where id = p_ticket_id;
    perform set_config('platizio.status_note', '', true);
  end if;

  if p_summary is not null and char_length(trim(p_summary)) > 0 then
    insert into public.ticket_messages (ticket_id, author_staff_id, author_kind, body, is_internal_note)
    values (p_ticket_id, v_actor, 'STAFF',
            'Grievance ' || v_ref || ' raised: ' || trim(p_summary), true);
  end if;

  v_mail := private.render_complaint_acknowledgement(v_id);

  insert into public.notifications
    (ticket_id, template, to_email, reply_to, subject, body_text, body_html, dedupe_key)
  values (
    p_ticket_id,
    'complaint_acknowledgement',
    v_mail ->> 'toEmail',
    'grievances@platizio.com',
    v_mail ->> 'subject',
    v_mail ->> 'bodyText',
    v_mail ->> 'bodyHtml',
    'grievance-ack:' || v_id::text
  )
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object(
    'complaintId',  v_id,
    'complaintRef', v_ref,
    'ticketRef',    v_ticket.ticket_ref,
    'stage',        'ACKNOWLEDGED'
  );
end;
$$;

create or replace function public.staff_set_complaint_stage(
  p_complaint_id uuid,
  p_stage        public.complaint_stage,
  p_note         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff();
  v_after record;
begin
  if p_stage = 'CLOSED' then
    raise exception 'Use staff_close_complaint to close a grievance — it needs a closing summary'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.complaints
     set stage          = p_stage,
         acknowledged_at = case
           when p_stage = 'ACKNOWLEDGED' then coalesce(acknowledged_at, now())
           else acknowledged_at end,
         resolved_at    = case
           when p_stage = 'RESOLVED' then coalesce(resolved_at, now())
           else resolved_at end
   where id = p_complaint_id
  returning complaint_ref, stage into v_after;

  if v_after is null then
    raise exception 'no such complaint: %', p_complaint_id using errcode = 'no_data_found';
  end if;

  if p_note is not null and char_length(trim(p_note)) > 0 then
    insert into public.ticket_messages (ticket_id, author_staff_id, author_kind, body, is_internal_note)
    select c.ticket_id, v_actor, 'STAFF',
           'Grievance ' || v_after.complaint_ref || ' → ' || p_stage::text || ': ' || trim(p_note),
           true
    from public.complaints c where c.id = p_complaint_id;
  end if;

  return jsonb_build_object('complaintRef', v_after.complaint_ref, 'stage', v_after.stage);
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
  v_actor uuid := private.require_staff(array['GRIEVANCE_OFFICER']::public.staff_role[]);
  v_after record;
begin
  if p_summary is null or char_length(trim(p_summary)) < 10 then
    raise exception 'Closing a grievance requires a summary of the outcome (at least 10 characters)'
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

  return jsonb_build_object('complaintRef', v_after.complaint_ref, 'stage', 'CLOSED');
end;
$$;

create or replace function private.sweep_sla()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  alert_email text := private.get_secret('sla_alert_email');
  warned      integer := 0;
  fr_breached integer := 0;
  rs_breached integer := 0;
  ack_breached integer := 0;
  grv_breached integer := 0;
begin
  if alert_email is not null then
    with due as (
      select t.id, t.ticket_ref, t.subject, t.priority, t.first_response_due_at
      from public.tickets t
      where t.first_response_at is null
        and t.sla_warned_at is null
        and t.first_response_due_at <= now() + interval '2 hours'
        and t.status_internal not in ('CLOSED', 'SPAM')
      order by t.first_response_due_at
      limit 50
    ), queued as (
      insert into public.notifications
        (ticket_id, template, to_email, subject, body_text, dedupe_key)
      select
        d.id,
        'sla_internal_alert',
        alert_email,
        'SLA warning: ' || d.ticket_ref || ' is due for a first response',
        format(
          E'Ticket %s has had no first response and is due at %s IST.\n\n'
          || E'Priority: %s\nSubject:  %s\n\nThis is an internal alert. The customer has not been told.',
          d.ticket_ref,
          to_char(d.first_response_due_at at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI'),
          d.priority,
          d.subject
        ),
        'sla-warn:' || d.id::text
      from due d
      on conflict (dedupe_key) do nothing
      returning ticket_id
    )
    update public.tickets t
       set sla_warned_at = now()
      from queued q
     where t.id = q.ticket_id;

    get diagnostics warned = row_count;
  end if;

  update public.tickets
     set first_response_breached = true
   where first_response_at is null
     and first_response_breached = false
     and first_response_due_at < now()
     and status_internal not in ('CLOSED', 'SPAM');
  get diagnostics fr_breached = row_count;

  update public.tickets
     set resolution_breached = true
   where resolved_at is null
     and resolution_breached = false
     and resolution_due_at < now()
     and status_internal not in ('CLOSED', 'SPAM');
  get diagnostics rs_breached = row_count;

  update public.complaints
     set acknowledgement_breached = true
   where acknowledged_at is null
     and acknowledgement_breached = false
     and acknowledgement_due_at < now()
     and stage <> 'CLOSED';
  get diagnostics ack_breached = row_count;

  update public.complaints
     set resolution_breached = true
   where resolved_at is null
     and resolution_breached = false
     and resolution_due_at < now()
     and stage <> 'CLOSED';
  get diagnostics grv_breached = row_count;

  return jsonb_build_object(
    'warned', warned,
    'firstResponseBreached', fr_breached,
    'resolutionBreached', rs_breached,
    'complaintAckBreached', ack_breached,
    'complaintResolutionBreached', grv_breached,
    'alertEmailConfigured', alert_email is not null
  );
end;
$$;

revoke all on function
  public.staff_raise_complaint(uuid, text),
  public.staff_set_complaint_stage(uuid, public.complaint_stage, text),
  public.staff_close_complaint(uuid, text)
from public, anon;

grant execute on function
  public.staff_raise_complaint(uuid, text),
  public.staff_set_complaint_stage(uuid, public.complaint_stage, text),
  public.staff_close_complaint(uuid, text)
to authenticated, service_role;
