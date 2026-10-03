-- Plants whose leaves spill over the rim (like the African violet) are drawn
-- in front of the pot instead of inside it. Then adds the African violet to
-- the Biome shop. Run once in the Supabase SQL Editor.
--
-- Change the price, rarity or story later with, for example:
--   update biome_items set price = 200, rarity = 'rare' where key = 'african-violet';
alter table public.biome_items add column over_pot boolean not null default false;

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, over_pot)
values ('african-violet', 'plant', 'small', 'African violet',
        'Velvety leaves and a crown of purple blooms. It flowers again and again with a little patience.',
        'uncommon', 150, 'biome-assets/plant-african-violet.png', 3, true);
