-- =========================================================
-- Byome: "New event coming ..." on the Events page between events.
-- When no event is on (or about to start), the Events page shows a card
-- saying "New event coming November 27" in the biome you choose here,
-- without naming the event. It switches over by itself the moment the
-- current event ends; the ended event stays listed underneath.
-- Once the next event is added to the events table, its own "Coming soon"
-- card takes over instead.
--
-- Change the date or biome later (the date is in Central time):
--   update public.site_settings set value = '{"date": "2026-11-27", "biome": "tundra"}' where key = 'next_event';
-- Stop showing it:
--   delete from public.site_settings where key = 'next_event';
--
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================

-- Small site-wide settings that anyone (even visitors) can read
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
drop policy if exists "Anyone can read site settings" on public.site_settings;
create policy "Anyone can read site settings" on public.site_settings for select using (true);
-- (no other policies: only the SQL Editor changes them)

insert into public.site_settings (key, value) values ('next_event', '{"date": "2026-11-27", "biome": "tundra"}')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Check
select key, value from public.site_settings;
