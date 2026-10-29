-- =========================================================
-- Byome: "Bug Squasher" and the Sapphire Butterfly.
-- The reward for finding a MAJOR bug: one that breaks something important
-- for members (for example, reviews, likes and comments failing to save).
-- Crediting a major bug gives the usual bug credit (50 Byome points, and
-- Bug Finder / Bug Watcher / Entomologist as they're reached) plus the
-- "Bug Squasher" achievement, whose reward is the Sapphire Butterfly
-- (once per member). The butterfly is never sold. It rests on the rim of
-- a small pot, like the ladybug.
--
-- Credit a major bug:
--   select public.credit_major_bug('their-username', 'What broke');
-- (For an ordinary bug, keep using credit_bug as before.)
--
-- This file also credits jamiliahtate, who found the first one. (If you
-- already ran the earlier one-of-a-kind version of this file, they keep the
-- butterfly they have and just get the achievement.)
-- Run in the Supabase SQL Editor AFTER the site update with the
-- butterfly's picture is live. Safe to run again (it won't credit
-- jamiliahtate twice). Paste the whole file with nothing highlighted.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, max_supply, max_per_member, sort_order)
values ('sapphire-butterfly', 'companion', 'small', 'Sapphire Butterfly',
  'A thank-you for finding a major bug and helping keep Byome working for everyone.',
  'heirloom', null, 'biome-assets/companion-sapphire-butterfly.png', null, 1, 2)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image,
  max_supply = excluded.max_supply, max_per_member = excluded.max_per_member;
-- (no longer numbered "#1 of 1", if the earlier version of this file ran)
update public.biome_inventory set serial = null where item_key = 'sapphire-butterfly' and serial is not null;

insert into public.achievements (key, name, description, reward_item, sort_order)
values ('bug-squasher', 'Bug Squasher',
  'Found a major bug that broke something important, and helped fix Byome for everyone.',
  'sapphire-butterfly', 23)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, reward_item = excluded.reward_item;

-- Remembers which bugs were major (for your records)
alter table public.bug_reports add column if not exists major boolean not null default false;

-- A major bug: the usual bug credit, plus Bug Squasher (and its butterfly)
create or replace function public.credit_major_bug(p_username text, p_note text default null) returns text
language plpgsql security definer set search_path to public as $$
declare
  uid uuid;
  result text;
begin
  select id into uid from profiles where lower(username) = lower(trim(p_username)) and deleted_at is null;
  if uid is null then return 'No member called "' || p_username || '". Check the spelling.'; end if;
  result := credit_bug(p_username, p_note);
  update bug_reports set major = true
  where id = (select id from bug_reports where user_id = uid order by created_at desc limit 1);
  -- (jamiliahtate may already have the butterfly from the earlier one-of-a-kind
  -- version of this file: then they get the achievement without a second one)
  if exists (select 1 from biome_inventory where user_id = uid and item_key = 'sapphire-butterfly')
     and not exists (select 1 from user_achievements where user_id = uid and achievement_key = 'bug-squasher') then
    insert into user_achievements (user_id, achievement_key) values (uid, 'bug-squasher');
    perform create_notification(uid, null, 'achievement', null,
      'You earned the "Bug Squasher" achievement! Your Sapphire Butterfly is its reward, so from now on '
        || 'everyone who finds a major bug will get one too. Yours was the very first.',
      'profile.html', false, 'positive');
    result := result || ' Major bug: they earned "Bug Squasher" (they already had the butterfly).';
  elsif grant_achievement(uid, 'bug-squasher') then
    result := result || ' Major bug: they earned "Bug Squasher" and the Sapphire Butterfly.';
  else
    result := result || ' Major bug noted (they already have Bug Squasher).';
  end if;
  return result;
end $$;
-- only for you in the SQL Editor; members can't call it
revoke execute on function public.credit_major_bug(text, text) from public, anon, authenticated;

-- The first one: jamiliahtate (once)
do $$
begin
  if not exists (select 1 from public.user_achievements ua join public.profiles p on p.id = ua.user_id
                 where ua.achievement_key = 'bug-squasher' and lower(p.username) = 'jamiliahtate') then
    raise notice '%', public.credit_major_bug('jamiliahtate', 'Reviews, likes and comments failing to save after the levels update');
  end if;
end $$;

-- Check: everyone with Bug Squasher
select p.username, ua.earned_at
from public.user_achievements ua join public.profiles p on p.id = ua.user_id
where ua.achievement_key = 'bug-squasher';
