-- 0019_staff_read_api.sql — the read side of the desk.
--
-- 0017 and 0018 gave staff everything they need to *change* a ticket and
-- nothing they need to *find* one. RLS lets a signed-in agent select from the
-- tables directly, so this is not a permissions gap — it is a shape gap.
--
-- Four read RPCs, each one round trip. SECURITY DEFINER for a consistent
-- projection, not to widen access — every one opens with require_staff().
--
-- On SLA state: the stored breach flags are set by the hourly sweep, so
-- between sweeps they lag reality. These functions derive state live.

create or replace function private.sla_state(
  p_due  timestamptz,
  p_done timestamptz
)
returns text
language sql
-- STABLE, not IMMUTABLE. It reads now(), so labelling it immutable would let
-- the planner fold it to a constant and a queue would freeze its own sense of
-- "late" at plan time.
stable
set search_path = ''
as $$
  select case
    when p_due is null                      then 'N/A'
    when p_done is not null and p_done <= p_due then 'MET'
    when p_done is not null                 then 'LATE'
    when now() > p_due                      then 'BREACHED'
    else 'DUE'
  end;
$$;

create or replace function public.staff_ticket_queue(payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := private.require_staff();
  v_status     public.ticket_status_internal[];
  v_assignee   text := nullif(trim(payload ->> 'assignee'), '');
  v_assignee_id uuid;
  v_unassigned boolean := false;
  v_category   text := nullif(trim(payload ->> 'categoryId'), '');
  v_priority   public.ticket_priority[];
  v_sla_only   boolean := coalesce((payload ->> 'slaOnly')::boolean, false);
  v_q          text := nullif(trim(payload ->> 'q'), '');
  v_like       text;
  v_limit      int := least(greatest(coalesce((payload ->> 'limit')::int, 25), 1), 100);
  v_offset     int := greatest(coalesce((payload ->> 'offset')::int, 0), 0);
  v_sort       text := coalesce(nullif(trim(payload ->> 'sort'), ''), 'due');
  v_total      bigint;
  v_rows       jsonb;
begin
  if jsonb_typeof(payload -> 'status') = 'array' then
    select array_agg(value::public.ticket_status_internal)
      into v_status
      from jsonb_array_elements_text(payload -> 'status');
  else
    v_status := array['NEW','TRIAGED','IN_PROGRESS','WAITING_ON_CUSTOMER',
                      'WAITING_ON_BROKER','RESOLVED']::public.ticket_status_internal[];
  end if;

  if jsonb_typeof(payload -> 'priority') = 'array' then
    select array_agg(value::public.ticket_priority)
      into v_priority
      from jsonb_array_elements_text(payload -> 'priority');
  end if;

  if v_assignee = 'me' then
    v_assignee_id := v_actor;
  elsif v_assignee = 'unassigned' then
    v_unassigned := true;
  elsif v_assignee is not null then
    begin
      v_assignee_id := v_assignee::uuid;
    exception when others then
      raise exception 'assignee must be a uuid, ''me'' or ''unassigned''';
    end;
  end if;

  -- Escape the LIKE metacharacters so a subject containing a percent sign
  -- cannot turn a search into a scan that matches everything.
  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with filtered as (
    select t.*
      from public.tickets t
     where t.status_internal = any (v_status)
       and (v_priority is null or t.priority = any (v_priority))
       and (v_category is null or t.category_id = v_category)
       and (v_assignee_id is null or t.assigned_agent_id = v_assignee_id)
       and (not v_unassigned or t.assigned_agent_id is null)
       and (
         not v_sla_only
         or (t.first_response_at is null and t.first_response_due_at is not null
             and now() > t.first_response_due_at)
         or (t.resolved_at is null and t.resolution_due_at is not null
             and now() > t.resolution_due_at)
       )
       and (
         v_like is null
         or t.ticket_ref       ilike v_like escape '\'
         or t.subject          ilike v_like escape '\'
         or t.requester_name   ilike v_like escape '\'
         or t.requester_email  ilike v_like escape '\'
       )
  )
  select
    (select count(*) from filtered),
    coalesce((
      -- `ord` exists only to carry the sort through jsonb_agg; strip it so a
      -- page's objects do not differ from a detail fetch by one stray field.
      select jsonb_agg((row_to_json(page)::jsonb - 'ord') order by page.ord)
      from (
        select
          row_number() over (
            order by
              case when v_sort = 'newest' then f.created_at end desc,
              case when v_sort = 'oldest' then f.created_at end asc,
              case when v_sort = 'due'    then coalesce(f.first_response_due_at, f.resolution_due_at) end asc nulls last,
              f.created_at asc
          ) as ord,
          f.id,
          f.ticket_ref                        as "ticketRef",
          f.subject,
          f.requester_name                    as "requesterName",
          f.requester_email                   as "requesterEmail",
          f.category_id                       as "categoryId",
          f.subcategory_id                    as "subcategoryId",
          f.priority,
          f.status_internal                   as "statusInternal",
          f.status_customer                   as "statusCustomer",
          f.assigned_agent_id                 as "assignedAgentId",
          sa.full_name                        as "assignedAgentName",
          f.created_at                        as "createdAt",
          f.first_response_due_at             as "firstResponseDueAt",
          f.first_response_at                 as "firstResponseAt",
          f.resolution_due_at                 as "resolutionDueAt",
          f.resolved_at                       as "resolvedAt",
          private.sla_state(f.first_response_due_at, f.first_response_at) as "firstResponseState",
          private.sla_state(f.resolution_due_at, f.resolved_at)           as "resolutionState",
          (c.id is not null)                  as "hasComplaint",
          c.complaint_ref                     as "complaintRef",
          f.legal_hold                        as "legalHold",
          (select count(*) from public.ticket_attachments a
            where a.ticket_id = f.id and a.verification_state = 'VERIFIED') as "attachmentCount"
        from filtered f
        left join public.staff_users sa on sa.id = f.assigned_agent_id
        left join public.complaints  c  on c.ticket_id = f.id
        order by ord
        limit v_limit offset v_offset
      ) page
    ), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'rows',   v_rows,
    'total',  v_total,
    'limit',  v_limit,
    'offset', v_offset
  );
end;
$$;

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
               'grantedAt',     cr.granted_at,
               'withdrawnAt',   cr.withdrawn_at
             )
        from public.consent_records cr
       where cr.ticket_id = t.id
       order by cr.granted_at desc
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

create or replace function public.staff_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff();
begin
  return jsonb_build_object(
    'open', (
      select count(*) from public.tickets
       where status_internal not in ('CLOSED', 'SPAM')
    ),
    'unassigned', (
      select count(*) from public.tickets
       where status_internal not in ('CLOSED', 'SPAM') and assigned_agent_id is null
    ),
    'mine', (
      select count(*) from public.tickets
       where status_internal not in ('CLOSED', 'SPAM') and assigned_agent_id = v_actor
    ),
    'awaitingFirstResponse', (
      select count(*) from public.tickets
       where first_response_at is null and status_internal not in ('CLOSED', 'SPAM')
    ),
    'firstResponseBreached', (
      select count(*) from public.tickets
       where first_response_at is null
         and first_response_due_at is not null
         and now() > first_response_due_at
         and status_internal not in ('CLOSED', 'SPAM')
    ),
    'resolutionBreached', (
      select count(*) from public.tickets
       where resolved_at is null
         and resolution_due_at is not null
         and now() > resolution_due_at
         and status_internal not in ('CLOSED', 'SPAM')
    ),
    'byStatus', coalesce((
      select jsonb_object_agg(status_internal, n)
        from (select status_internal, count(*) as n
                from public.tickets group by status_internal) s
    ), '{}'::jsonb),
    'openComplaints', (
      select count(*) from public.complaints where stage <> 'CLOSED'
    ),
    'complaintsBreached', (
      select count(*) from public.complaints
       where stage <> 'CLOSED'
         and resolution_due_at is not null
         and now() > resolution_due_at
         and resolved_at is null
    ),
    'outboxPending', (
      select count(*) from public.notifications where status in ('PENDING', 'SENDING')
    ),
    'outboxFailed', (
      select count(*) from public.notifications where status = 'FAILED'
    ),
    'generatedAt', now()
  );
end;
$$;

create or replace function public.staff_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',       su.id,
             'fullName', su.full_name,
             'email',    su.email,
             'isSelf',   su.id = v_actor,
             'roles',    (select coalesce(jsonb_agg(ur.role::text order by ur.role::text), '[]'::jsonb)
                            from public.user_roles ur where ur.user_id = su.id)
           ) order by su.full_name)
      from public.staff_users su
     where su.is_active
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_ticket_queue(jsonb)  from public, anon;
revoke all on function public.staff_ticket_detail(uuid)  from public, anon;
revoke all on function public.staff_dashboard()          from public, anon;
revoke all on function public.staff_directory()          from public, anon;

grant execute on function public.staff_ticket_queue(jsonb)  to authenticated, service_role;
grant execute on function public.staff_ticket_detail(uuid)  to authenticated, service_role;
grant execute on function public.staff_dashboard()          to authenticated, service_role;
grant execute on function public.staff_directory()          to authenticated, service_role;

create index if not exists tickets_queue_open_idx
  on public.tickets (first_response_due_at, created_at)
  where status_internal not in ('CLOSED', 'SPAM');

create index if not exists tickets_assigned_open_idx
  on public.tickets (assigned_agent_id)
  where status_internal not in ('CLOSED', 'SPAM');
