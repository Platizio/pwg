-- 0025_admin_guard_allows_direct_sql.sql — 0021 broke the bootstrap.
--
-- 0021 put private.require_admin() in front of provision_staff_user(). The
-- guard accepts a service_role JWT or an active ADMIN. Neither describes the
-- Supabase SQL editor: a direct database session connects as `postgres` and
-- sets no request.jwt.claims, so it fell through to require_staff() and got
-- "This action requires a signed-in staff account" — which broke the one path
-- that has to work before any other: creating the very first admin.
--
-- An empty request.jwt.claims means the call did not arrive through PostgREST;
-- every API request has claims, including anonymous ones, which carry
-- role = anon. So no claims means a direct connection, and a direct connection
-- already required the database password. Somebody holding that can drop this
-- function.
--
-- Returns null rather than a uuid, so the audit trail records the session
-- honestly as 'sql:postgres' instead of attributing the change to a person.

create or replace function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;

  -- No claims: a direct database session, which already holds more authority
  -- than this guard could withhold.
  if v_claims is null then
    return null;
  end if;

  -- The service key, over HTTP. This is how invite-staff bootstraps the first
  -- admin and how a break-glass script gets in.
  if v_claims ->> 'role' = 'service_role' then
    return null;
  end if;

  -- Anything else arrived as a person, and has to be an active admin.
  return private.require_staff(array['ADMIN']::public.staff_role[]);
end;
$$;
