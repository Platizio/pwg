create table public.business_hours (
  weekday    smallint primary key check (weekday between 1 and 7),
  opens_at   time not null,
  closes_at  time not null,
  is_working boolean not null default true,
  constraint business_hours_window check (closes_at > opens_at)
);

create table public.business_holidays (
  holiday_date date primary key,
  label        text not null,
  constraint business_holidays_label_len check (char_length(label) between 2 and 120)
);

comment on table public.business_hours is
  'Weekly working window in Asia/Kolkata. Read by add_business_time() when computing SLA deadlines.';
comment on table public.business_holidays is
  'Dated closures on top of the weekly window. Deliberately incomplete — see the seed note in the migration.';

insert into public.business_hours (weekday, opens_at, closes_at, is_working) values
  (1, '09:00', '17:00', true),
  (2, '09:00', '17:00', true),
  (3, '09:00', '17:00', true),
  (4, '09:00', '17:00', true),
  (5, '09:00', '17:00', true),
  (6, '09:00', '17:00', false),
  (7, '09:00', '17:00', false)
on conflict (weekday) do update set
  opens_at   = excluded.opens_at,
  closes_at  = excluded.closes_at,
  is_working = excluded.is_working;

insert into public.business_holidays (holiday_date, label) values
  ('2026-08-15', 'Independence Day'),
  ('2026-10-02', 'Gandhi Jayanti'),
  ('2027-01-26', 'Republic Day'),
  ('2027-08-15', 'Independence Day'),
  ('2027-10-02', 'Gandhi Jayanti')
on conflict (holiday_date) do nothing;

create or replace function public.add_business_time(from_ts timestamptz, work_interval interval)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  tz constant text := 'Asia/Kolkata';
  cursor_local timestamp;
  remaining    interval := work_interval;
  day_date     date;
  win          record;
  day_open     timestamp;
  day_close    timestamp;
  available    interval;
  guard        integer := 0;
begin
  if work_interval is null or work_interval < interval '0' then
    raise exception 'add_business_time requires a non-negative interval, got %', work_interval;
  end if;

  cursor_local := from_ts at time zone tz;

  loop
    guard := guard + 1;
    if guard > 400 then
      raise exception 'add_business_time did not converge after 400 days; business_hours has no working day';
    end if;

    day_date := cursor_local::date;

    select bh.opens_at, bh.closes_at, bh.is_working
      into win
    from public.business_hours bh
    where bh.weekday = extract(isodow from day_date)::smallint;

    if not found
       or not win.is_working
       or exists (select 1 from public.business_holidays h where h.holiday_date = day_date) then
      cursor_local := (day_date + 1)::timestamp;
      continue;
    end if;

    day_open  := day_date + win.opens_at;
    day_close := day_date + win.closes_at;

    if cursor_local < day_open then
      cursor_local := day_open;
    end if;

    if cursor_local >= day_close then
      cursor_local := (day_date + 1)::timestamp;
      continue;
    end if;

    available := day_close - cursor_local;

    if remaining <= available then
      return (cursor_local + remaining) at time zone tz;
    end if;

    remaining    := remaining - available;
    cursor_local := (day_date + 1)::timestamp;
  end loop;
end;
$$;

comment on function public.add_business_time is
  'Adds working time to a timestamp, walking business_hours and business_holidays in Asia/Kolkata.';

create or replace function public.set_ticket_due_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.first_response_due_at is null then
    new.first_response_due_at := public.add_business_time(new.created_at, interval '8 hours');
  end if;

  if new.resolution_due_at is null then
    new.resolution_due_at := public.add_business_time(new.created_at, interval '40 hours');
  end if;

  return new;
end;
$$;

create trigger tickets_set_due_dates
  before insert on public.tickets
  for each row execute function public.set_ticket_due_dates();

create or replace function public.set_complaint_due_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.acknowledgement_due_at is null then
    new.acknowledgement_due_at := public.add_business_time(new.created_at, interval '8 hours');
  end if;

  if new.resolution_due_at is null then
    new.resolution_due_at := public.add_business_time(new.created_at, interval '120 hours');
  end if;

  return new;
end;
$$;

create trigger complaints_set_due_dates
  before insert on public.complaints
  for each row execute function public.set_complaint_due_dates();

alter table public.tickets
  alter column first_response_due_at set not null,
  alter column resolution_due_at     set not null;

alter table public.complaints
  alter column acknowledgement_due_at set not null,
  alter column resolution_due_at      set not null;
