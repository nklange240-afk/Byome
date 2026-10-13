-- =========================================================
-- Byome: a picture across the top of an event on the Events page.
--  - Haunted Harvest gets the five Halloween pots as a sneak peek. It shows
--    before the event starts too.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. (Needs the events file from before.)
-- =========================================================

alter table public.events add column if not exists banner_image text;
alter table public.events add column if not exists banner_alt text;

update public.events
set banner_image = 'biome-assets/event-halloween-2026-banner.webp',
    banner_alt = 'Five Halloween pots with plants in them: slime green, witch purple, midnight black, harvest orange and candy corn.'
where key = 'halloween-2026';

select key, name, banner_image from public.events order by starts_at;
