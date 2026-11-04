-- =========================================================
-- Byome: the Chai teapot, the prize for "Sugar and Spice" (earning both
-- the Sugar and Spice prizes in Beta Testing: Sugar and Spice).
--  - A small pot (for the top and middle shelves), heirloom, and only from
--    the achievement, not the shop. Its spout and handle stick out past a
--    normal pot's sides (the shelf knows about this, see style.css).
--  - Anyone who has already earned both prizes gets it (and their points)
--    right away, with a notification; anyone who does later gets it with
--    the achievement.
-- Needs 2026-12-08-beta-event.sql first. Run in the Supabase SQL Editor.
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values ('chai-teapot', 'pot', 'small', 'Chai teapot',
        'Steeped in cinnamon, cardamom and star anise, with a spoonful of sugar. For finishing both sides of Beta Testing: Sugar and Spice. A souvenir from the very first Byome beta.',
        'heirloom', null, 'biome-assets/pot-chai-teapot.png', 41, 1)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image, max_per_member = excluded.max_per_member;

select public.release_event_reward('beta-sugar-and-spice', 'chai-teapot');
