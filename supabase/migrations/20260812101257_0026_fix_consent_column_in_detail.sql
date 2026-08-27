-- 0026_fix_consent_column_in_detail.sql — staff_ticket_detail named a column
-- that does not exist.
--
-- The consent block in 0019 read cr.granted_at. 0005 called it given_at — it
-- records the moment the customer agreed, not a moment when the firm granted
-- anything. plpgsql does not resolve column names until the statement first
-- runs, so the function created cleanly and would have raised 42703 the first
-- time anyone opened a ticket that had a consent record. Which is to say: on
-- the first real ticket.
--
-- 0019's file in the repository is corrected too, so a fresh deployment gets
-- this right first time and this migration is a harmless re-creation there.
-- It exists because this project has already recorded 0019 as applied and will
-- not run it again.
--
-- policy_url is added while here. It was in the table from 0005 and simply not
-- projected, and an audit of what somebody consented to is thin without the
-- address of the document they consented to.

create or replace function public.staff_ticket_detail(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff();
  v_out   jsonb;
begin
  select jsonb_build_object(
    'ticket', jsonb_build_object(
      'id',                 t.id,
      'ticketRef',          t.ticket_ref,
      'subject',            t.subject,
      'description',        t.description,
      'requesterName',      t.requester_name,
      'requesterEmail',     t.requester_email,
      'requesterMobile',    t.requester_mobile_raw,
      'categoryId',         t.category_id,
      'categoryLabel',      cat.label,
      'subcategoryId',      t.subcategory_id,
      'subcategoryLabel',   sub.label,
      'priority',           t.priority,
      'statusInternal',     t.status_internal,
      'statusCustomer',     t.status_customer,
      'assignedAgentId',    t.assigned_agent_id,
      'assignedAgentName',  sa.full_name,
      'source',             t.source,
      'captchaVerified',    t.captcha_verified,
      'createdAt',          t.created_at,
      'firstResponseDueAt', t.first_response_due_at,
      'firstResponseAt',    t.first_response_at,
      'resolutionDueAt',    t.resolution_due_at,
      'resolvedAt',         t.resolved_at,
      'closedAt',           t.closed_at,
      'firstResponseState', private.sla_state(t.first_response_due_at, t.first_response_at),
      'resolutionState',    private.sla_state(t.resolution_due_at, t.resolved_at),
      'legalHold',          t.legal_hold,
      'legalHoldReason',    t.legal_hold_reason,
      'retentionExpiresAt', t.retention_expires_at,
      'attachmentRetentionExpiresAt', t.attachment_retention_expires_at
    ),

    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',         m.id,
               'authorKind', m.author_kind,
               'authorName', coalesce(ms.full_name, t.requester_name),
               'body',       m.body,
               'isInternal', m.is_internal_note,
               'createdAt',  m.created_at
             ) order by m.created_at, m.id)
        from public.ticket_messages m
        left join public.staff_users ms on ms.id = m.author_staff_id
       where m.ticket_id = t.id
    ), '[]'::jsonb),

    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           a.id,
               'filename',     a.original_filename,
               'declaredMime', a.declared_mime,
               'verifiedMime', a.verified_mime,
               'bytes',        coalesce(a.verified_bytes, a.declared_bytes),
               'state',        a.verification_state,
               'rejection',    a.rejection_reason,
               'uploadedAt',   a.uploaded_at
             ) order by a.created_at, a.id)
        from public.ticket_attachments a
       where a.ticket_id = t.id
    ), '[]'::jsonb),

    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           h.id,
               'fromInternal', h.from_internal,
               'toInternal',   h.to_internal,
               'fromCustomer', h.from_customer,
               'toCustomer',   h.to_customer,
               'actorLabel',   h.actor_label,
               'note',         h.note,
               'changedAt',    h.changed_at
             ) order by h.changed_at, h.id)
        from public.ticket_status_history h
       where h.ticket_id = t.id
    ), '[]'::jsonb),

    'consent', (
      select jsonb_build_object(
               'purpose',       cr.purpose,
               'consentText',   cr.consent_text,
               'policyVersion', cr.policy_version,
               'policyUrl',     cr.policy_url,
               'grantedAt',     cr.given_at,
               'withdrawnAt',   cr.withdrawn_at
             )
        from public.consent_records cr
       where cr.ticket_id = t.id
       order by cr.given_at desc
       limit 1
    ),

    'complaint', (
      select jsonb_build_object(
               'id',                    c.id,
               'complaintRef',          c.complaint_ref,
               'stage',                 c.stage,
               'acknowledgementDueAt',  c.acknowledgement_due_at,
               'acknowledgedAt',        c.acknowledged_at,
               'resolutionDueAt',       c.resolution_due_at,
               'resolvedAt',            c.resolved_at,
               'closedAt',              c.closed_at,
               'closureSummary',        c.closure_summary,
               'closedByName',          cb.full_name,
               'acknowledgementState',  private.sla_state(c.acknowledgement_due_at, c.acknowledged_at),
               'resolutionState',       private.sla_state(c.resolution_due_at, c.resolved_at)
             )
        from public.complaints c
        left join public.staff_users cb on cb.id = c.closed_by
       where c.ticket_id = t.id
    ),

    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'template',  n.template,
               'toEmail',   n.to_email,
               'subject',   n.subject,
               'status',    n.status,
               'attempts',  n.attempts,
               'lastError', n.last_error,
               'sentAt',    n.sent_at,
               'createdAt', n.created_at
             ) order by n.created_at, n.id)
        from public.notifications n
       where n.ticket_id = t.id
    ), '[]'::jsonb)
  )
  into v_out
  from public.tickets t
  left join public.ticket_categories    cat on cat.id = t.category_id
  left join public.ticket_subcategories sub on sub.id = t.subcategory_id and sub.category_id = t.category_id
  left join public.staff_users          sa  on sa.id  = t.assigned_agent_id
  where t.id = p_ticket_id;

  if v_out is null then
    raise exception 'no such ticket: %', p_ticket_id using errcode = 'no_data_found';
  end if;

  return v_out;
end;
$$;
