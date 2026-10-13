-- =========================================================
-- Byome: the "Bug Finder" achievement, for members who spot a bug.
-- It's given by hand. After running this file once, award it with:
--   select public.give_achievement('their-username', 'bug-finder');
-- The member gets the usual achievement notification and pop-up, and it
-- shows on their profile. Giving it twice does nothing the second time.
-- give_achievement works for any achievement, by its key.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

insert into public.achievements (key, name, description, sort_order)
values ('bug-finder', 'Bug Finder', 'Spotted a bug and helped make Byome better for everyone.', 20)
on conflict (key) do nothing;


-- ---------- Giving an achievement by username (SQL Editor only) ----------
create or replace function public.give_achievement(p_username text, p_key text) returns text
language plpgsql security definer set search_path to public as $$
declare
  uid uuid;
  a achievements%rowtype;
begin
  select id into uid from profiles where lower(username) = lower(trim(p_username)) and deleted_at is null;
  if uid is null then return 'No member called "' || p_username || '". Check the spelling.'; end if;
  select * into a from achievements where key = p_key;
  if not found then return 'There''s no achievement with the key "' || p_key || '".'; end if;
  if grant_achievement(uid, p_key) then
    return 'Done: ' || p_username || ' earned "' || a.name || '".';
  end if;
  return p_username || ' already had "' || a.name || '".';
end $$;
-- only for you in the SQL Editor; members can't call it
revoke execute on function public.give_achievement(text, text) from public, anon, authenticated;

select key, name, description from public.achievements where key = 'bug-finder';
