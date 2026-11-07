-- =========================================================
-- Byome: the Snake plant, in the Byome Shop. A common large plant (for the
-- bottom shelf's large pots), 70 Byome points.
-- Change its price or story later with, for example:
--   update biome_items set price = 80 where key = 'snake-plant';
--   update biome_items set description = 'New text' where key = 'snake-plant';
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('snake-plant', 'plant', 'medium', 'Snake plant',
        'Tall, striped and nearly impossible to kill. Forget to water it for a month and it won''t even notice.',
        'common', 70, 'biome-assets/plant-snake-plant.png', 5)
on conflict (key) do nothing;
