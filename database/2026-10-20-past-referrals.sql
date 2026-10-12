-- =========================================================
-- Byome: credit referrals people made before invites were tracked.
-- Adds a command for the SQL Editor that counts friends someone invited
-- earlier, WITHOUT naming the friends:
--
--   select public.credit_past_referrals('their-username', 3);
--
-- For each friend counted, the inviter gets the usual bonus (50 Byome +
-- 5 community points), credit toward their total and the 1/5/25
-- milestones, and one notification summing it up. The weekly limit
-- doesn't apply, and these don't count toward "this week". Their Invite
-- page shows them as one line: "Plus 3 friends you invited before
-- invites were tracked."
--
-- To count friends without giving points, add false:
--   select public.credit_past_referrals('their-username', 3, false);
--
-- Each run ADDS to what's there, so run it once per person. To see what's
-- been credited:
--   select p.username, c.friends, c.with_points, c.created_at
--   from public.referral_credits c join public.profiles p on p.id = c.user_id
--   order by c.created_at desc;
--
-- Run this whole file once in the Supabase SQL Editor first (after
-- 2026-10-19-referrals.sql). Safe to run again. Paste the whole file with
-- nothing highlighted.
-- =========================================================


-- ---------- Earlier referrals, counted without names ----------
create table if not exists public.referral_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friends integer not null check (friends between 1 and 100),
  with_points boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists referral_credits_user_idx on public.referral_credits (user_id);
alter table public.referral_credits enable row level security;
revoke all on public.referral_credits from anon, authenticated;


-- ---------- The command ----------
create or replace function public.credit_past_referrals(p_username text, p_friends integer, p_with_points boolean default true)
returns text
language plpgsql security definer set search_path to public as $$
declare
  who profiles%rowtype;
  rule point_rules%rowtype;
  credit_id uuid;
  total int;
  msg text;
begin
  select * into who from profiles where lower(username) = lower(trim(p_username)) and deleted_at is null;
  if not found then raise exception 'No member called "%"', p_username; end if;
  if p_friends is null or p_friends < 1 or p_friends > 100 then raise exception 'The number of friends must be between 1 and 100'; end if;

  insert into referral_credits (user_id, friends, with_points) values (who.id, p_friends, p_with_points)
  returning id into credit_id;

  select * into rule from point_rules where action = 'referral';
  if p_with_points and found then
    -- one bonus per friend, all at once (one notification below, not one each)
    insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
    select who.id, 'referral', rule.community_points, rule.biome_points, 'referral_credit', gen_random_uuid()
    from generate_series(1, p_friends);
    msg := 'Thank you for inviting friends to Byome before invites were tracked! We''ve counted '
      || p_friends || case when p_friends = 1 then ' friend' else ' friends' end
      || ' and added ' || (p_friends * rule.biome_points) || ' Byome points and '
      || (p_friends * rule.community_points) || ' community points.';
  else
    msg := 'Thank you for inviting friends to Byome before invites were tracked! We''ve counted '
      || p_friends || case when p_friends = 1 then ' friend' else ' friends' end || ' toward your total and milestones.';
  end if;
  perform create_notification(who.id, null, 'referral', credit_id, msg, 'invite.html');

  -- milestones, counting everyone (tracked friends and these)
  select count(*) + coalesce((select sum(friends) from referral_credits where user_id = who.id), 0)
    into total from referrals where referrer_id = who.id and qualified_at is not null;
  if total >= 1 then perform grant_achievement(who.id, 'invite-1'); end if;
  if total >= 5 then perform grant_achievement(who.id, 'invite-5'); end if;
  if total >= 25 then perform grant_achievement(who.id, 'invite-25'); end if;

  return who.username || ': counted ' || p_friends || case when p_friends = 1 then ' friend' else ' friends' end
    || case when p_with_points and rule.action is not null
         then ' (+' || (p_friends * rule.biome_points) || ' Byome, +' || (p_friends * rule.community_points) || ' community)'
         else ' (no points)' end
    || '. Their total is now ' || total || '.';
end $$;
-- Only from the SQL Editor, never from the website
revoke execute on function public.credit_past_referrals(text, integer, boolean) from public, anon, authenticated;


-- ---------- Milestones and the Invite page count these too ----------
-- Same as in 2026-10-19-referrals.sql, except the milestone total includes
-- earlier friends
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
  select count(*) + coalesce((select sum(friends) from referral_credits where user_id = r.referrer_id), 0)
    into total from referrals where referrer_id = r.referrer_id and qualified_at is not null;
  if total >= 1 then perform grant_achievement(r.referrer_id, 'invite-1'); end if;
  if total >= 5 then perform grant_achievement(r.referrer_id, 'invite-5'); end if;
  if total >= 25 then perform grant_achievement(r.referrer_id, 'invite-25'); end if;
end $$;
revoke execute on function public.check_referral(uuid) from public, anon, authenticated;

-- Same as in 2026-10-19-referrals.sql, plus "earlier" (friends counted
-- without names), which the total includes
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
    'total', (select count(*) from referrals where referrer_id = me and qualified_at is not null)
             + coalesce((select sum(friends) from referral_credits where user_id = me), 0),
    'earlier', coalesce((select sum(friends) from referral_credits where user_id = me), 0),
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
