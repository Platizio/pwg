alter table public.ticket_categories     enable row level security;
alter table public.ticket_subcategories  enable row level security;
alter table public.tickets               enable row level security;
alter table public.ticket_messages       enable row level security;
alter table public.ticket_status_history enable row level security;
alter table public.ticket_attachments    enable row level security;
alter table public.consent_records       enable row level security;
alter table public.complaints            enable row level security;
alter table public.notifications         enable row level security;
alter table public.staff_users           enable row level security;
alter table public.user_roles            enable row level security;
alter table public.business_hours        enable row level security;
alter table public.business_holidays     enable row level security;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from public;

grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant execute on functions to service_role;

grant select on
  public.ticket_categories,
  public.ticket_subcategories,
  public.tickets,
  public.ticket_messages,
  public.ticket_status_history,
  public.ticket_attachments,
  public.consent_records,
  public.complaints,
  public.notifications,
  public.staff_users,
  public.user_roles,
  public.business_hours,
  public.business_holidays
to authenticated;

grant insert, update on public.tickets     to authenticated;
grant insert          on public.ticket_messages to authenticated;
grant update          on public.complaints to authenticated;
grant insert, update, delete on
  public.ticket_categories,
  public.ticket_subcategories,
  public.business_hours,
  public.business_holidays,
  public.staff_users,
  public.user_roles
to authenticated;

grant execute on function public.staff_roles()                        to authenticated;
grant execute on function public.is_staff()                           to authenticated;
grant execute on function public.has_staff_role(public.staff_role)    to authenticated;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from anon, authenticated, public;

create policy "staff read categories" on public.ticket_categories
  for select to authenticated using ((select public.is_staff()));

create policy "admins write categories" on public.ticket_categories
  for all to authenticated
  using ((select public.has_staff_role('ADMIN')))
  with check ((select public.has_staff_role('ADMIN')));

create policy "staff read subcategories" on public.ticket_subcategories
  for select to authenticated using ((select public.is_staff()));

create policy "admins write subcategories" on public.ticket_subcategories
  for all to authenticated
  using ((select public.has_staff_role('ADMIN')))
  with check ((select public.has_staff_role('ADMIN')));

create policy "staff read business hours" on public.business_hours
  for select to authenticated using ((select public.is_staff()));

create policy "admins write business hours" on public.business_hours
  for all to authenticated
  using ((select public.has_staff_role('ADMIN')))
  with check ((select public.has_staff_role('ADMIN')));

create policy "staff read business holidays" on public.business_holidays
  for select to authenticated using ((select public.is_staff()));

create policy "admins write business holidays" on public.business_holidays
  for all to authenticated
  using ((select public.has_staff_role('ADMIN')))
  with check ((select public.has_staff_role('ADMIN')));

create policy "staff read tickets" on public.tickets
  for select to authenticated using ((select public.is_staff()));

create policy "staff create tickets" on public.tickets
  for insert to authenticated with check ((select public.is_staff()));

create policy "staff update tickets" on public.tickets
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "staff read messages" on public.ticket_messages
  for select to authenticated using ((select public.is_staff()));

create policy "staff post messages" on public.ticket_messages
  for insert to authenticated
  with check (
    (select public.is_staff())
    and author_kind = 'STAFF'
    and author_staff_id = (select auth.uid())
  );

create policy "staff read status history" on public.ticket_status_history
  for select to authenticated using ((select public.is_staff()));

create policy "staff read attachments" on public.ticket_attachments
  for select to authenticated using ((select public.is_staff()));

create policy "staff read consent" on public.consent_records
  for select to authenticated using ((select public.is_staff()));

create policy "staff read complaints" on public.complaints
  for select to authenticated using ((select public.is_staff()));

create policy "staff update complaints" on public.complaints
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "supervisors read notifications" on public.notifications
  for select to authenticated
  using (
    (select public.has_staff_role('SUPERVISOR'))
    or (select public.has_staff_role('ADMIN'))
  );

create policy "staff read colleagues" on public.staff_users
  for select to authenticated using ((select public.is_staff()));

create policy "admins manage staff" on public.staff_users
  for all to authenticated
  using ((select public.has_staff_role('ADMIN')))
  with check ((select public.has_staff_role('ADMIN')));

create policy "staff read own roles" on public.user_roles
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "admins read all roles" on public.user_roles
  for select to authenticated using ((select public.has_staff_role('ADMIN')));

create policy "admins manage roles" on public.user_roles
  for all to authenticated
  using ((select public.has_staff_role('ADMIN')))
  with check ((select public.has_staff_role('ADMIN')));

create policy "auth admin reads user roles" on public.user_roles
  as permissive for select to supabase_auth_admin using (true);

create policy "auth admin reads staff users" on public.staff_users
  as permissive for select to supabase_auth_admin using (true);

create policy "staff read ticket attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'ticket-attachments' and (select public.is_staff()));

create policy "admins delete ticket attachments" on storage.objects
  for delete to authenticated
  using (bucket_id = 'ticket-attachments' and (select public.has_staff_role('ADMIN')));
