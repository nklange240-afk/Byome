-- =========================================================
-- Byome: counting the Byome Shop's hanging signs (the Google ads and
-- Byome's own cards), ready for sponsor signs later.
--
-- What's counted, per sign, per day (Central time):
--   views    times it was actually seen: at least half of it on screen for
--            a second (the usual standard). Up to 20 a day per member.
--   people   how many different members saw it that day
--   taps     taps on it (cards with a link), up to 5 a day per member
--   tappers  how many different members tapped it that day
-- Only daily totals are kept. To count each member once a day, the
-- database notes that they've seen a sign for two days, then deletes it;
-- nobody can see those notes, not even the owner.
--
-- The numbers are on the "Shop signs" page (shop-signs.html), for people
-- given access. Moderators don't get it automatically. Give access in the
-- SQL Editor (the founder gets it when this file runs):
--   select public.grant_permission('username', 'sign_stats');
--   select public.revoke_permission('username', 'sign_stats');
--
-- The signs' names live in shop_signs. To add one (for example a sponsor):
--   insert into public.shop_signs (key, name, kind, sponsor, starts_on, ends_on)
--   values ('sponsor-brand-jan', 'Brand, January', 'sponsor', 'Brand', '2027-01-01', '2027-01-31');
--
-- Run in the Supabase SQL Editor BEFORE publishing the site update that
-- came with it. Safe to run again. Paste the whole file with nothing
-- highlighted.
-- =========================================================

-- ---------- Permissions (separate from moderating) ----------
create table if not exists public.staff_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (permission in ('sign_stats')),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission)
);
alter table public.staff_permissions enable row level security;
-- (no policies: only the functions below read it, and only the SQL Editor changes it)

create or replace function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path to public as $$
  select exists (select 1 from staff_permissions where user_id = auth.uid() and permission = p_permission)
$$;
grant execute on function public.has_permission(text) to authenticated;

-- The signed-in member's permissions (the menu uses this)
create or replace function public.my_permissions() returns text[]
language sql stable security definer set search_path to public as $$
  select coalesce(array_agg(permission order by permission), '{}') from staff_permissions where user_id = auth.uid()
$$;
grant execute on function public.my_permissions() to authenticated;

create or replace function public.grant_permission(p_username text, p_permission text) returns text
language plpgsql security definer set search_path to public as $$
declare uid uuid;
begin
  select id into uid from profiles where lower(username) = lower(trim(p_username)) and deleted_at is null;
  if uid is null then return 'No member called "' || p_username || '". Check the spelling.'; end if;
  insert into staff_permissions (user_id, permission) values (uid, p_permission) on conflict do nothing;
  return 'Done: ' || p_username || ' has ' || p_permission || '.';
end $$;
revoke execute on function public.grant_permission(text, text) from public, anon, authenticated;

create or replace function public.revoke_permission(p_username text, p_permission text) returns text
language plpgsql security definer set search_path to public as $$
begin
  delete from staff_permissions s using profiles p
  where s.user_id = p.id and lower(p.username) = lower(trim(p_username)) and s.permission = p_permission;
  return 'Done: ' || p_username || ' no longer has ' || p_permission || '.';
end $$;
revoke execute on function public.revoke_permission(text, text) from public, anon, authenticated;

-- The founder can see the numbers from the start
insert into public.staff_permissions (user_id, permission)
select id, 'sign_stats' from public.profiles where badge = 'founder'
on conflict do nothing;


-- ---------- The signs ----------
create table if not exists public.shop_signs (
  key text primary key check (key ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('google', 'house', 'sponsor')),
  sponsor text,                -- the brand, for sponsor signs
  starts_on date,              -- sponsor signs: when the deal runs
  ends_on date,
  created_at timestamptz not null default now()
);
alter table public.shop_signs enable row level security;
drop policy if exists "Sign stats viewers can see signs" on public.shop_signs;
create policy "Sign stats viewers can see signs" on public.shop_signs for select to authenticated
  using ((select public.has_permission('sign_stats')));

insert into public.shop_signs (key, name, kind) values
  ('google-middle', 'Google ad, middle sign', 'google'),
  ('google-bottom', 'Google ad, bottom sign', 'google'),
  ('house-thanks', 'Thank you for joining Byome!', 'house'),
  ('house-better-place', 'You make Byome a better place!', 'house'),
  ('house-terry', 'Rare: Terry pot now available!', 'house'),
  ('house-haunted-harvest', 'Haunted Harvest (Events)', 'house')
on conflict (key) do nothing;


-- ---------- The counts ----------
create table if not exists public.sign_stats (
  day date not null,
  sign text not null,
  views integer not null default 0,
  people integer not null default 0,
  taps integer not null default 0,
  tappers integer not null default 0,
  primary key (day, sign)
);
alter table public.sign_stats enable row level security;
-- (no policies: read through sign_stats_report below)

-- Who has seen what today, so each member counts once. Deleted after two days.
create table if not exists public.sign_seen (
  day date not null,
  sign text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  views integer not null default 0,
  taps integer not null default 0,
  primary key (day, sign, user_id)
);
create index if not exists sign_seen_day_idx on public.sign_seen (day);
alter table public.sign_seen enable row level security;
-- (no policies: nobody can read it)

-- The shop calls this when a sign has been seen ('view') or tapped ('tap')
create or replace function public.log_sign_event(p_sign text, p_kind text) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  today date := byome_today();
  v integer;
  t integer;
begin
  if me is null or p_sign !~ '^[a-z0-9-]{1,60}$' or p_kind not in ('view', 'tap') then return; end if;

  insert into sign_seen (day, sign, user_id, views, taps)
  values (today, p_sign, me, (p_kind = 'view')::int, (p_kind = 'tap')::int)
  on conflict (day, sign, user_id) do update
    set views = sign_seen.views + excluded.views, taps = sign_seen.taps + excluded.taps
  returning views, taps into v, t;

  -- (a cap per member per day, so nobody can inflate the numbers)
  if (p_kind = 'view' and v > 20) or (p_kind = 'tap' and t > 5) then return; end if;

  insert into sign_stats (day, sign, views, people, taps, tappers)
  values (today, p_sign,
          (p_kind = 'view')::int, (p_kind = 'view' and v = 1)::int,
          (p_kind = 'tap')::int, (p_kind = 'tap' and t = 1)::int)
  on conflict (day, sign) do update set
    views = sign_stats.views + excluded.views, people = sign_stats.people + excluded.people,
    taps = sign_stats.taps + excluded.taps, tappers = sign_stats.tappers + excluded.tappers;

  delete from sign_seen where day < today - 1;
end $$;
revoke execute on function public.log_sign_event(text, text) from public, anon;
grant execute on function public.log_sign_event(text, text) to authenticated;

-- The Shop signs page: totals and each day's numbers for the last p_days days
create or replace function public.sign_stats_report(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  since date := byome_today() - (greatest(1, least(coalesce(p_days, 30), 400)) - 1);
begin
  if not has_permission('sign_stats') then raise exception 'You don''t have access to the shop sign numbers'; end if;
  return jsonb_build_object(
    'since', since,
    'today', byome_today(),
    'signs', coalesce((select jsonb_agg(jsonb_build_object(
        'key', s.key, 'name', s.name, 'kind', s.kind, 'sponsor', s.sponsor,
        'starts_on', s.starts_on, 'ends_on', s.ends_on) order by s.kind, s.created_at, s.key)
      from shop_signs s), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
        'day', d.day, 'sign', d.sign, 'views', d.views, 'people', d.people,
        'taps', d.taps, 'tappers', d.tappers) order by d.day desc, d.sign)
      from sign_stats d where d.day >= since), '[]'::jsonb));
end $$;
revoke execute on function public.sign_stats_report(integer) from public, anon;
grant execute on function public.sign_stats_report(integer) to authenticated;

-- Check: who can see the numbers
select p.username, s.permission
from public.staff_permissions s join public.profiles p on p.id = s.user_id;
