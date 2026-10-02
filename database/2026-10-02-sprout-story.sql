-- The Welcome sprout's story, shown in the info box when someone hovers
-- over (or taps) it on a shelf. Edit the wording any time by running this
-- again with new text.
update public.biome_items
set description = 'A housewarming gift for every new member. A sprout stands for the potential in each of us to grow within our community.'
where key = 'welcome-sprout';
