create table public.ticket_access_tokens (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,
  subject_email text not null,
  expires_at    timestamptz not null,
  first_used_at timestamptz,
  last_used_at  timestamptz,
  use_count     integer not null default 0,
  created_ip inet,
  created_at timestamptz not null default now(),
  constraint ticket_access_tokens_hash_shape
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint ticket_access_tokens_email_shape
    check (subject_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint ticket_access_tokens_email_lower
    check (subject_email = lower(subject_email)),
  constraint ticket_access_tokens_window
    check (expires_at > created_at)
);

comment on table public.ticket_access_tokens is
  'Short-lived magic-link tokens for the customer status page. Stores the SHA-256 of the token, never the token.';

create index ticket_access_tokens_expiry_idx on public.ticket_access_tokens (expires_at);
create index ticket_access_tokens_email_idx  on public.ticket_access_tokens (subject_email, created_at desc);

alter table public.ticket_access_tokens enable row level security;

revoke all on public.ticket_access_tokens from anon, authenticated;
grant select on public.ticket_access_tokens to authenticated;

create policy "admins read access tokens" on public.ticket_access_tokens
  for select to authenticated
  using ((select public.has_staff_role('ADMIN')));

alter table public.notifications drop constraint notifications_template;
alter table public.notifications add constraint notifications_template
  check (template in ('ticket_acknowledgement', 'ticket_reply', 'sla_internal_alert', 'status_link'));

create or replace function private.render_status_link_email(p_email text, p_url text, p_ticket_count integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  body_text text;
  body_html text;
begin
  body_text := format(
    E'Hello,\n\n'
    || E'Here is the secure link you asked for. It shows the status of the %s support\n'
    || E'%s raised from this email address.\n\n'
    || E'  %s\n\n'
    || E'The link works for the next 30 minutes and then stops working. If it expires,\n'
    || E'request another one at https://platizioglobal.com/help/status\n\n'
    || E'IF YOU DID NOT ASK FOR THIS\n'
    || E'You can ignore this email. Someone entered this address on our website, and\n'
    || E'nothing has been shown to them — the link came only to you.\n\n'
    || E'SECURITY\n'
    || E'We will never ask you for your password, your OTP or your full card details,\n'
    || E'and neither will anyone else from Platizio. If someone does, it is not us.\n\n'
    || E'Platizio Global\n'
    || E'supportglobal@platizio.com  ·  +91 92898 37100\n',
    p_ticket_count,
    case when p_ticket_count = 1 then 'request' else 'requests' end,
    p_url
  );

  body_html := format(
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
    || 'font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">'
    || '<p>Hello,</p>'
    || '<p>Here is the secure link you asked for. It shows the status of the %s support '
    || '%s raised from this email address.</p>'
    || '<p style="margin:24px 0"><a href="%s" '
    || 'style="background:#B94B12;color:#fff;text-decoration:none;padding:12px 22px;'
    || 'border-radius:8px;display:inline-block">View my requests</a></p>'
    || '<p style="color:#666;font-size:13px">The link works for the next 30 minutes and then '
    || 'stops working. If it expires, request another at '
    || '<a href="https://platizioglobal.com/help/status">platizioglobal.com/help/status</a>.</p>'
    || '<p><strong>If you did not ask for this</strong><br>You can ignore this email. Someone '
    || 'entered this address on our website, and nothing has been shown to them — the link '
    || 'came only to you.</p>'
    || '<p style="background:#fff8e6;border-left:3px solid #d9a441;padding:10px 14px">'
    || '<strong>Security</strong><br>We will never ask you for your password, your OTP or your '
    || 'full card details, and neither will anyone else from Platizio.</p>'
    || '<p style="color:#666;font-size:13px">Platizio Global<br>'
    || '<a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a> · +91 92898 37100</p>'
    || '</div>',
    p_ticket_count,
    case when p_ticket_count = 1 then 'request' else 'requests' end,
    private.html_escape(p_url)
  );

  return jsonb_build_object(
    'toEmail',  p_email,
    'subject',  'Your Platizio Global support requests',
    'bodyText', body_text,
    'bodyHtml', body_html
  );
end;
$$;

create or replace function public.request_status_link(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email   text := lower(trim(payload ->> 'email'));
  v_hash    text := payload ->> 'tokenHash';
  v_url     text := payload ->> 'linkUrl';
  v_ttl     integer := coalesce((payload ->> 'ttlMinutes')::integer, 30);
  v_count   integer;
  v_mail    jsonb;
begin
  if v_email is null or v_hash is null or v_url is null then
    raise exception 'request_status_link requires email, tokenHash and linkUrl'
      using errcode = 'null_value_not_allowed';
  end if;

  select count(*) into v_count
  from public.tickets t
  where lower(t.requester_email) = v_email
    and t.status_internal <> 'SPAM';

  if v_count = 0 then
    return jsonb_build_object('queued', false, 'ticketCount', 0);
  end if;

  insert into public.ticket_access_tokens (token_hash, subject_email, expires_at, created_ip)
  values (
    v_hash,
    v_email,
    now() + make_interval(mins => v_ttl),
    nullif(payload ->> 'ip', '')::inet
  );

  v_mail := private.render_status_link_email(v_email, v_url, v_count);

  insert into public.notifications
    (template, to_email, reply_to, subject, body_text, body_html)
  values (
    'status_link',
    v_mail ->> 'toEmail',
    'supportglobal@platizio.com',
    v_mail ->> 'subject',
    v_mail ->> 'bodyText',
    v_mail ->> 'bodyHtml'
  );

  return jsonb_build_object('queued', true, 'ticketCount', v_count);
end;
$$;

create or replace function public.lookup_tickets_by_token(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.ticket_access_tokens;
  v_tickets jsonb;
begin
  select * into v_token
  from public.ticket_access_tokens
  where token_hash = p_token_hash;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'unknown');
  end if;

  if v_token.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  update public.ticket_access_tokens
     set first_used_at = coalesce(first_used_at, now()),
         last_used_at  = now(),
         use_count     = use_count + 1
   where id = v_token.id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'ticketRef',        tk.ticket_ref,
               'subject',          tk.subject,
               'categoryLabel',    c.label,
               'subcategoryLabel', s.label,
               'status',           tk.status_customer::text,
               'raisedAt',         tk.created_at,
               'updatedAt',        tk.updated_at,
               'attachments', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'filename', a.original_filename,
                          'received', a.verification_state = 'VERIFIED'
                        ) order by a.created_at), '[]'::jsonb)
                 from public.ticket_attachments a
                 where a.ticket_id = tk.id
               )
             )
             order by tk.created_at desc
           ),
           '[]'::jsonb
         )
    into v_tickets
  from public.tickets tk
  join public.ticket_categories    c on c.id = tk.category_id
  join public.ticket_subcategories s on s.id = tk.subcategory_id
  where lower(tk.requester_email) = v_token.subject_email
    and tk.status_internal <> 'SPAM';

  return jsonb_build_object(
    'valid', true,
    'email', v_token.subject_email,
    'tickets', v_tickets
  );
end;
$$;

create or replace function private.purge_expired_access_tokens()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.ticket_access_tokens
   where expires_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end;
$$;

select cron.schedule(
  'platizio-retention-purge',
  '0 21 * * *',
  $job$ select private.purge_expired_records(), private.purge_expired_access_tokens(); $job$
);

revoke all on function
  public.request_status_link(jsonb),
  public.lookup_tickets_by_token(text)
from public, anon, authenticated;

grant execute on function
  public.request_status_link(jsonb),
  public.lookup_tickets_by_token(text)
to service_role;
