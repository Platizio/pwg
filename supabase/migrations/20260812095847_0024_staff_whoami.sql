-- 0024_staff_whoami.sql — who is asking, and what may they do.
--
-- Every other staff function raises when the caller is not staff. A console
-- has to render something on boot, so this one answers rather than refuses.
--
-- The `can` map is advisory and says so. Every capability listed is separately
-- enforced by require_staff() inside the function that performs it.
--
-- It also doubles as the authorisation probe for the admin-staff Edge
-- Function, which must know the caller is a live ADMIN before it asks the Auth
-- Admin API to create a user. has_staff_role() alone would not do: that reads
-- the JWT's app_metadata, and a deactivated admin's token stays valid for the
-- rest of its hour. isActive here comes from the table.

create or replace function public.staff_whoami()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_staff  public.staff_users;
  v_roles  jsonb := '[]'::jsonb;
  v_active boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object(
      'signedIn', false,
      'isStaff',  false,
      'roles',    '[]'::jsonb,
      'can',      '{}'::jsonb
    );
  end if;

  select * into v_staff from public.staff_users where id = v_uid;

  if found then
    v_active := v_staff.is_active;
    select coalesce(jsonb_agg(ur.role::text order by ur.role::text), '[]'::jsonb)
      into v_roles
      from public.user_roles ur
     where ur.user_id = v_uid;
  end if;

  return jsonb_build_object(
    'signedIn', true,
    'userId',   v_uid,
    'email',    v_staff.email,
    'fullName', v_staff.full_name,
    'isActive', v_active,
    -- Roles come from the table, not from the token. When they disagree it is
    -- because someone's roles changed during the life of their current JWT,
    -- and the table is the one that is right.
    'roles',    v_roles,
    'isStaff',  v_active and jsonb_array_length(v_roles) > 0,
    'can', case when not v_active then '{}'::jsonb else jsonb_build_object(
      'viewQueue',        jsonb_array_length(v_roles) > 0,
      'assign',           jsonb_array_length(v_roles) > 0,
      'reply',            jsonb_array_length(v_roles) > 0,
      'setStatus',        jsonb_array_length(v_roles) > 0,
      'openAttachments',  jsonb_array_length(v_roles) > 0,
      'raiseComplaint',   jsonb_array_length(v_roles) > 0,
      'closeComplaint',   v_roles ? 'GRIEVANCE_OFFICER',
      'viewAccessLog',    v_roles ?| array['SUPERVISOR','GRIEVANCE_OFFICER','ADMIN'],
      'administerStaff',  v_roles ? 'ADMIN',
      'editCalendar',     v_roles ? 'ADMIN'
    ) end,
    -- Tokens live an hour and roles are read from app_metadata at issue time,
    -- so a long-open console may be showing capabilities the token no longer
    -- carries. Comparing this against the JWT is how it knows to prompt for a
    -- refresh rather than let an action fail confusingly.
    'tokenRoles', public.staff_roles()
  );
end;
$$;

revoke all on function public.staff_whoami() from public, anon;
grant execute on function public.staff_whoami() to authenticated, service_role;
