-- =========================================================
-- Byome: inviting friends (referrals).
--  - Every member has a private invite code (and a link with it).
--  - Someone who signs up with a code is recorded as "pending".
--  - It counts as a referral once the new member has written a review that earned
--    its points (so it passed the checks and wasn't removed) AND made a post
--    or a comment that isn't waiting for a moderator.
--  - Then the member who invited them earns 50 Byome + 5 community points,
--    and the new member earns 40 Byome points (enough for a common pot).
--  - The inviter earns points for up to 5 friends a week (weeks start on
--    Monday). More still count toward their total and milestones, just
--    without points until the week resets.
--  - Milestones at 1, 5 and 25 friends (the reward items come later).
--  - An email address can only ever bring in one referral: a scrambled
--    one-way fingerprint of each sign-up's email is kept (never the email
--    itself), so deleting an account and signing up again with the same
--    email doesn't count again. Gmail's dots and "+anything" are ignored.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
--
-- Change the amounts later with, for example:
--   update point_rules set biome_points = 50 where action = 'referral_welcome';
-- =========================================================


-- ---------- Points for inviting ----------
insert into public.point_rules (action, community_points, biome_points, delay_hours, label, notify)
values ('referral', 5, 50, 0, 'Referring a friend', true),
       ('referral_welcome', 0, 40, 0, 'Joining Byome with an invite', true)
on conflict (action) do nothing;


-- ---------- Milestones (reward items are added once the art is ready) ----------
insert into public.achievements (key, name, description, sort_order) values
  ('invite-1', 'First friend', 'Referred a friend to Byome.', 10),
  ('invite-5', 'Five friends', 'Referred 5 friends to Byome.', 11),
  ('invite-25', 'Twenty-five friends', 'Referred 25 friends to Byome.', 12)
on conflict (key) do nothing;


-- ---------- Tables (private: only the functions below use them) ----------
create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,          -- when it counted as a referral
  rewarded boolean not null default false  -- false if the inviter was over the weekly limit
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, qualified_at);

create table if not exists public.email_fingerprints (
  fingerprint text primary key,      -- sha256 of the tidied-up email; the email itself is never kept
  first_seen timestamptz not null default now()
);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.email_fingerprints enable row level security;
revoke all on public.referral_codes, public.referrals, public.email_fingerprints from anon, authenticated;


-- ---------- Helpers ----------
-- A short code that's easy to read out and type (no 0/O, 1/I/L)
create or replace function public.new_referral_code() returns text
language plpgsql set search_path to public as $$
declare
  letters constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(letters, 1 + floor(random() * length(letters))::int, 1);
    end loop;
    exit when not exists (select 1 from referral_codes where code = c);
  end loop;
  return c;
end $$;

create or replace function public.ensure_referral_code(p_user uuid) returns text
language plpgsql security definer set search_path to public as $$
declare c text;
begin
  select code into c from referral_codes where user_id = p_user;
  if c is null then
    insert into referral_codes (user_id, code) values (p_user, new_referral_code())
    on conflict (user_id) do nothing;
    select code into c from referral_codes where user_id = p_user;
  end if;
  return c;
end $$;

-- The same inbox always gives the same fingerprint: lower case, no spaces,
-- "+anything" dropped, and for Gmail the dots too
create or replace function public.email_fingerprint(p_email text) returns text
language plpgsql immutable set search_path to public as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  local text := split_part(e, '@', 1);
  domain text := split_part(e, '@', 2);
begin
  if e = '' then return null; end if;
  local := split_part(local, '+', 1);
  if domain in ('gmail.com', 'googlemail.com') then
    local := replace(local, '.', '');
    domain := 'gmail.com';
  end if;
  return encode(sha256(convert_to(local || '@' || domain, 'UTF8')), 'hex');
end $$;

revoke execute on function public.new_referral_code() from public, anon, authenticated;
revoke execute on function public.ensure_referral_code(uuid) from public, anon, authenticated;
revoke execute on function public.email_fingerprint(text) from public, anon, authenticated;


-- ---------- Signing up with a code ----------
-- Runs right after the new member's profile is created (on_auth_user_created).
-- Nothing in here can stop someone joining: any problem just means no referral.
create or replace function public.record_signup_referral() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  fp text := email_fingerprint(new.email);
  seen boolean := false;
  wanted text := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
  inviter uuid;
begin
  begin
    if fp is not null then
      select exists (select 1 from email_fingerprints where fingerprint = fp) into seen;
      insert into email_fingerprints (fingerprint) values (fp) on conflict do nothing;
    end if;
    perform ensure_referral_code(new.id);

    if wanted <> '' and not seen then
      select rc.user_id into inviter from referral_codes rc
      join profiles p on p.id = rc.user_id
      where rc.code = wanted and p.deleted_at is null;
      if inviter is not null and inviter <> new.id then
        insert into referrals (referrer_id, referred_id) values (inviter, new.id)
        on conflict (referred_id) do nothing;
        perform create_notification(inviter, new.id, 'referral', new.id,
          username_of(new.id) || ' joined Byome with your invite! Once they write a review and join the conversation (a post or a comment), you''ll both get your bonus.',
          'invite.html');
      end if;
    end if;
  exception when others then
    raise warning 'referral not recorded: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created_referral on auth.users;
create trigger on_auth_user_created_referral after insert on auth.users
  for each row execute function public.record_signup_referral();


-- ---------- Counting a referral once the new member has taken part ----------
create or replace function public.check_referral(p_user uuid) returns void
language plpgsql security definer set search_path to public as $$
declare
  r referrals%rowtype;
  week_start timestamptz := date_trunc('week', now());   -- Monday 00:00 (UTC)
  rewarded_this_week int;
  total int;
  inviter_active boolean;
  limit_per_week constant int := 5;
begin
  select * into r from referrals where referred_id = p_user and qualified_at is null for update;
  if not found then return; end if;

  -- a review that earned its points, and a post or comment that isn't held
  if not exists (select 1 from point_ledger where user_id = p_user and action = 'review' and revoked_at is null) then return; end if;
  if not exists (select 1 from posts where user_id = p_user and held_at is null)
     and not exists (select 1 from comments where user_id = p_user and held_at is null) then return; end if;

  select deleted_at is null into inviter_active from profiles where id = r.referrer_id;
  select count(*) into rewarded_this_week from referrals
  where referrer_id = r.referrer_id and rewarded and qualified_at >= week_start;

  update referrals set qualified_at = now(),
    rewarded = coalesce(inviter_active, false) and rewarded_this_week < limit_per_week
  where id = r.id
  returning * into r;

  -- the new member's welcome bonus (never limited)
  perform award_points(p_user, 'referral_welcome', 'referral', r.id);

  if not coalesce(inviter_active, false) then return; end if;

  if r.rewarded then
    perform award_points(r.referrer_id, 'referral', 'referral', r.id);
  else
    perform create_notification(r.referrer_id, p_user, 'referral', r.id,
      username_of(p_user) || ' wrote their first review and joined the conversation, so they count as one of your referrals! You''ve reached this week''s limit of '
        || limit_per_week || ' bonuses, so there are no points for this one, but it still counts toward your total and milestones. Bonuses start again on Monday.',
      'invite.html');
  end if;

  -- milestones count every referral, over the limit or not
  select count(*) into total from referrals where referrer_id = r.referrer_id and qualified_at is not null;
  if total >= 1 then perform grant_achievement(r.referrer_id, 'invite-1'); end if;
  if total >= 5 then perform grant_achievement(r.referrer_id, 'invite-5'); end if;
  if total >= 25 then perform grant_achievement(r.referrer_id, 'invite-25'); end if;
end $$;
revoke execute on function public.check_referral(uuid) from public, anon, authenticated;

create or replace function public.on_referral_activity() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if exists (select 1 from referrals where referred_id = new.user_id and qualified_at is null) then
    perform check_referral(new.user_id);
  end if;
  return new;
end $$;

-- A review's points (given once it passes the checks, or once a moderator approves it)
drop trigger if exists referral_after_review_points on public.point_ledger;
create trigger referral_after_review_points after insert on public.point_ledger
  for each row when (new.action = 'review') execute function public.on_referral_activity();
-- A post or comment that isn't waiting for a moderator (new, or just approved)
drop trigger if exists referral_after_post on public.posts;
create trigger referral_after_post after insert or update of held_at on public.posts
  for each row when (new.held_at is null) execute function public.on_referral_activity();
drop trigger if exists referral_after_comment on public.comments;
create trigger referral_after_comment after insert or update of held_at on public.comments
  for each row when (new.held_at is null) execute function public.on_referral_activity();


-- ---------- For the Invite friends page ----------
create or replace function public.my_referrals() returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  week_start timestamptz := date_trunc('week', now());
begin
  if me is null then raise exception 'Please log in first'; end if;
  return jsonb_build_object(
    'code', ensure_referral_code(me),
    'weekly_limit', 5,
    'week_resets_at', week_start + interval '7 days',
    'total', (select count(*) from referrals where referrer_id = me and qualified_at is not null),
    'this_week', (select count(*) from referrals where referrer_id = me and qualified_at >= week_start),
    'rewarded_this_week', (select count(*) from referrals where referrer_id = me and rewarded and qualified_at >= week_start),
    'pending', (select count(*) from referrals where referrer_id = me and qualified_at is null),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'username', p.username, 'deleted', p.deleted_at is not null,
        'joined_at', r.created_at, 'qualified_at', r.qualified_at, 'rewarded', r.rewarded)
        order by r.created_at desc)
      from referrals r join profiles p on p.id = r.referred_id
      where r.referrer_id = me), '[]'::jsonb)
  );
end $$;
revoke execute on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

-- The sign-up page shows who invited you ("Invited by AliceB")
create or replace function public.referral_inviter(p_code text) returns text
language sql stable security definer set search_path to public as $$
  select p.username from referral_codes rc join profiles p on p.id = rc.user_id
  where rc.code = upper(trim(p_code)) and p.deleted_at is null
$$;
revoke execute on function public.referral_inviter(text) from public;
grant execute on function public.referral_inviter(text) to anon, authenticated;


-- ---------- Everyone who's already here ----------
-- Fingerprints for existing accounts, so they can't come back as "new"
insert into public.email_fingerprints (fingerprint)
select public.email_fingerprint(email) from auth.users where email is not null
on conflict do nothing;
-- An invite code for every member
select count(public.ensure_referral_code(id)) as members_with_invite_codes from public.profiles where deleted_at is null;
