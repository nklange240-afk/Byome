-- =========================================================
-- Byome: a stricter automod check on usernames.
--
-- Usernames were already checked against the automod word list when
-- someone signs up or changes their name. This also catches the ways
-- people dodge it in a username:
--   - spreading a word out with dots, dashes or underscores
--     (f_u_c_k, s.h.i.t)
--   - swapping u for v (fvckface)
-- Usernames like "assassin", "Scunthorpe" or "cockatoo" are still fine.
--
-- The last part lists any current usernames that would now be refused,
-- so they can be reset: report the profile, then use "Reset username"
-- on the Moderate page. Running this file doesn't change anyone's name.
--
-- Needs 2026-12-10-username-holds.sql first. Safe to run again. Paste
-- the whole file with nothing highlighted.
-- =========================================================

-- Does this username break the automod word list?
create or replace function public.username_is_flagged(p_username text) returns boolean
language sql stable security definer set search_path to public as $$
  select text_is_flagged(regexp_replace(p_username, '[_.-]+', ' ', 'g'))        -- glow_fuck
      or text_is_flagged(regexp_replace(p_username, '[_.-]+', '', 'g'))         -- f_u_c_k
      or text_is_flagged(translate(lower(regexp_replace(p_username, '[_.-]+', '', 'g')), 'v', 'u'))  -- fvck
$$;
revoke execute on function public.username_is_flagged(text) from public, anon, authenticated;

-- Checking a username (signing up or changing it)
create or replace function public.check_username(p_username text) returns text
language plpgsql stable security definer set search_path to public as $$
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_.-]{3,20}$' then return 'invalid'; end if;
  if lower(p_username) like 'deleted-member%' then return 'not_allowed'; end if;
  if exists (select 1 from profiles where lower(username) = lower(p_username)) then return 'taken'; end if;
  if exists (select 1 from username_history where lower(username) = lower(p_username)
             and held_until > now() and user_id is distinct from auth.uid()) then return 'held'; end if;
  if username_is_flagged(p_username) then return 'not_allowed'; end if;
  return 'ok';
end $$;

-- Check: current usernames that would now be refused (none is good news)
select username, created_at::date as joined
from public.profiles
where deleted_at is null and username not ilike 'deleted-member%' and public.username_is_flagged(username)
order by username;
