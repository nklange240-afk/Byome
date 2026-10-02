-- Adds the Zebra haworthia to the Biome shop (uncommon, 120 biome points).
-- Run once in the Supabase SQL Editor.
--
-- Change the story, price or rarity later with, for example:
--   update biome_items set price = 150 where key = 'zebra-haworthia';
--   update biome_items set description = 'New text' where key = 'zebra-haworthia';
insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('zebra-haworthia', 'plant', 'small', 'Zebra haworthia',
        'A hardy little succulent with striped leaves. It asks for very little and keeps growing anyway.',
        'uncommon', 120, 'biome-assets/plant-zebra-haworthia.png', 2);
