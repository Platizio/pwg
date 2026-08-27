-- 0021_staff_admin_api.sql — who gets to be staff, and who says so.
--
-- The two locks:
--   1. An admin cannot strip their own ADMIN role or deactivate themselves.
--   2. The last active ADMIN cannot be removed by any route.

create table if not exists public.staff_role_audit (
  id           bigint generated always as identity primary key,
  target_id    uuid not null,
  target_email text not null,
  actor_id     uuid,
  actor_label  text not null,
  action       text not null,
  role         public.staff_role,
  note         text,
  changed_at   timestamptz not null default now(),

  constraint staff_role_audit_action
    check (action in ('PROVISION', 'GRANT', 'REVOKE', 'ACTIVATE', 'DEACTIVATE')),
  -- GRANT and REVOKE are statements about a role and are meaningless without
  -- one; the lifecycle actions are statements about an account and must not
  -- carry one, or the trail starts implying role changes that never happened.
  constraint staff_role_audit_role_present
    check ((action in ('GRANT', 'REVOKE')) = (role is not null))
);

create index if not exists staff_role_audit_target_idx
  on public.staff_role_audit (target_id, changed_at desc);

comment on table public.staff_role_audit is
  'Append-only record of every staff account and role change. Written by the staff admin RPCs; cannot be updated or deleted at any key.';

create or replace function public.reject_staff_role_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'staff_role_audit is append-only; % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists staff_role_audit_no_update on public.staff_role_audit;
create trigger staff_role_audit_no_update
  before update on public.staff_role_audit
  for each row execute function public.reject_staff_role_audit_mutation();

-- No retention-purge exception, unlike the ticket trail. Ticket audit rows are
-- about a customer and must expire with their data; these are about employees
-- and firm governance.
drop trigger if exists staff_role_audit_no_delete on public.staff_role_audit;
create trigger staff_role_audit_no_delete
  before delete on public.staff_role_audit
  for each row execute function public.reject_staff_role_audit_mutation();

alter table public.staff_role_audit enable row level security;

drop policy if exists "admins read staff role audit" on public.staff_role_audit;
create policy "admins read staff role audit"
  on public.staff_role_audit
  for select
  to authenticated
  using (public.has_staff_role('ADMIN'));

revoke insert, update, delete on public.staff_role_audit from anon, authenticated;
grant select on public.staff_role_audit to authenticated;

-- private.require_admin — ADMIN staff, or the service key.
-- The service key is allowed because somebody has to create the first admin,
-- and at that moment there is by definition no admin to authorise it.
create or replace function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  begin
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    v_role := null;
  end;

  if v_role = 'service_role' then
    return null;
  end if;

  return private.require_staff(array['ADMIN']::public.staff_role[]);
end;
$$;

-- Called after any change that could reduce the admin population. Counting
-- after the fact rather than predicting beforehand means it cannot be fooled
-- by a route somebody adds later that forgets to ask.
create or replace function private.assert_an_admin_remains()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.user_roles ur
      join public.staff_users su on su.id = ur.user_id
     where ur.role = 'ADMIN' and su.is_active
  ) then
    raise exception
      'That would leave the system with no active ADMIN, and no way back in except the service key. Grant ADMIN to someone else first.'
      using errcode = 'integrity_constraint_violation';
  end if;
end;
$$;

create or replace function public.provision_staff_user(
  p_user_id   uuid,
  p_full_name text,
  p_email     text,
  p_roles     public.staff_role[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin();
  v_email text := lower(trim(p_email));
begin
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'No auth user with id %. Invite them first.', p_user_id
      using errcode = 'foreign_key_violation';
  end if;

  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'A staff user with no roles cannot do anything; pass at least one role';
  end if;

  insert into public.staff_users (id, full_name, email)
  values (p_user_id, trim(p_full_name), v_email)
  on conflict (id) do update
    set full_name = excluded.full_name,
        email     = excluded.email,
        is_active = true;

  insert into public.user_roles (user_id, role, granted_by)
  select p_user_id, r, v_actor
  from unnest(p_roles) as r
  on conflict (user_id, role) do nothing;

  insert into public.staff_role_audit (target_id, target_email, actor_id, actor_label, action)
  values (p_user_id, v_email, v_actor, public.current_actor_label(), 'PROVISION');

  insert into public.staff_role_audit (target_id, target_email, actor_id, actor_label, action, role)
  select p_user_id, v_email, v_actor, public.current_actor_label(), 'GRANT', r
  from unnest(p_roles) as r;

  return jsonb_build_object(
    'userId', p_user_id,
    'email',  v_email,
    'roles',  (select coalesce(jsonb_agg(ur.role::text order by ur.role::text), '[]'::jsonb)
               from public.user_roles ur where ur.user_id = p_user_id)
  );
end;
$$;

create or replace function public.staff_set_roles(
  p_user_id uuid,
  p_roles   public.staff_role[],
  p_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := private.require_admin();
  v_email   text;
  v_label   text := public.current_actor_label();
  v_added   public.staff_role[];
  v_removed public.staff_role[];
begin
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'A staff user with no roles cannot do anything. Deactivate them instead.'
      using errcode = 'invalid_parameter_value';
  end if;

  select email into v_email from public.staff_users where id = p_user_id;
  if v_email is null then
    raise exception 'no such staff user: %', p_user_id using errcode = 'no_data_found';
  end if;

  if v_actor is not null and p_user_id = v_actor
     and not ('ADMIN' = any (p_roles)) then
    raise exception 'You cannot remove your own ADMIN role. Ask another admin to do it.'
      using errcode = 'insufficient_privilege';
  end if;

  select array_agg(r) into v_added
    from unnest(p_roles) as r
   where not exists (select 1 from public.user_roles ur
                      where ur.user_id = p_user_id and ur.role = r);

  select array_agg(ur.role) into v_removed
    from public.user_roles ur
   where ur.user_id = p_user_id and not (ur.role = any (p_roles));

  delete from public.user_roles
   where user_id = p_user_id and not (role = any (p_roles));

  insert into public.user_roles (user_id, role, granted_by)
  select p_user_id, r, v_actor
  from unnest(p_roles) as r
  on conflict (user_id, role) do nothing;

  insert into public.staff_role_audit (target_id, target_email, actor_id, actor_label, action, role, note)
  select p_user_id, v_email, v_actor, v_label, 'GRANT', r, nullif(trim(p_note), '')
  from unnest(coalesce(v_added, array[]::public.staff_role[])) as r;

  insert into public.staff_role_audit (target_id, target_email, actor_id, actor_label, action, role, note)
  select p_user_id, v_email, v_actor, v_label, 'REVOKE', r, nullif(trim(p_note), '')
  from unnest(coalesce(v_removed, array[]::public.staff_role[])) as r;

  perform private.assert_an_admin_remains();

  return jsonb_build_object(
    'userId',  p_user_id,
    'email',   v_email,
    'granted', to_jsonb(coalesce(v_added,   array[]::public.staff_role[])),
    'revoked', to_jsonb(coalesce(v_removed, array[]::public.staff_role[])),
    'roles',   (select coalesce(jsonb_agg(ur.role::text order by ur.role::text), '[]'::jsonb)
                  from public.user_roles ur where ur.user_id = p_user_id)
  );
end;
$$;

-- Deactivation, not deletion. staff_users.id is referenced by every message an
-- agent wrote and every status change they made.
--
-- Note this does not revoke an existing JWT. Tokens live an hour, so a
-- deactivated account keeps working until its current token expires. For a
-- genuine emergency, deactivate here *and* sign the user out in the dashboard.
create or replace function public.staff_set_active(
  p_user_id uuid,
  p_active  boolean,
  p_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin();
  v_email text;
begin
  if p_active is null then
    raise exception 'p_active must be true or false';
  end if;

  if v_actor is not null and p_user_id = v_actor and not p_active then
    raise exception 'You cannot deactivate your own account.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.staff_users
     set is_active = p_active
   where id = p_user_id
  returning email into v_email;

  if v_email is null then
    raise exception 'no such staff user: %', p_user_id using errcode = 'no_data_found';
  end if;

  insert into public.staff_role_audit (target_id, target_email, actor_id, actor_label, action, note)
  values (p_user_id, v_email, v_actor, public.current_actor_label(),
          case when p_active then 'ACTIVATE' else 'DEACTIVATE' end,
          nullif(trim(p_note), ''));

  perform private.assert_an_admin_remains();

  return jsonb_build_object('userId', p_user_id, 'email', v_email, 'isActive', p_active);
end;
$$;

create or replace function public.staff_list_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',           su.id,
             'fullName',     su.full_name,
             'email',        su.email,
             'isActive',     su.is_active,
             'createdAt',    su.created_at,
             'roles',        (select coalesce(jsonb_agg(ur.role::text order by ur.role::text), '[]'::jsonb)
                                from public.user_roles ur where ur.user_id = su.id),
             'openTickets',  (select count(*) from public.tickets t
                                where t.assigned_agent_id = su.id
                                  and t.status_internal not in ('CLOSED', 'SPAM')),
             'lastActionAt', (select max(h.changed_at) from public.ticket_status_history h
                                where h.actor_id = su.id)
           ) order by su.is_active desc, su.full_name)
      from public.staff_users su
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.provision_staff_user(uuid, text, text, public.staff_role[]) from public, anon;
revoke all on function public.staff_set_roles(uuid, public.staff_role[], text) from public, anon;
revoke all on function public.staff_set_active(uuid, boolean, text) from public, anon;
revoke all on function public.staff_list_accounts() from public, anon;

grant execute on function public.provision_staff_user(uuid, text, text, public.staff_role[])
  to authenticated, service_role;
grant execute on function public.staff_set_roles(uuid, public.staff_role[], text)
  to authenticated, service_role;
grant execute on function public.staff_set_active(uuid, boolean, text)
  to authenticated, service_role;
grant execute on function public.staff_list_accounts()
  to authenticated, service_role;
