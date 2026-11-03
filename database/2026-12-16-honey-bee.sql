-- =========================================================
-- Byome: the Honey Bee, the prize for "Sugar Rush" (any 5 of the 7 Sugar
-- tasks in Beta Testing: Sugar and Spice).
--  - A companion that visits any pot and buzzes gently among the leaves,
--    like the Swallowtail. Rare, and only from the achievement.
--  - Anyone who has already finished the Sugar side gets it (and their
--    points) right away, with a notification; anyone who finishes later
--    gets it with the achievement.
-- Needs 2026-12-08-beta-event.sql first. Run in the Supabase SQL Editor.
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values ('honey-bee', 'companion', null, 'Honey Bee',
        'Busy, buzzy and sweet as can be. A souvenir from Beta Testing: Sugar and Spice.',
        'rare', null, 'biome-assets/companion-honey-bee.png', 3, 1)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image, max_per_member = excluded.max_per_member;

select public.release_event_reward('beta-sugar-rush', 'honey-bee');
