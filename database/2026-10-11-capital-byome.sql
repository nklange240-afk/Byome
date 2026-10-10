-- =========================================================
-- Byome: "Byome" with a capital B in text stored in the database
-- (achievement names, item stories, and notifications people already have).
-- Run in the Supabase SQL Editor (any time). Safe to run again.
-- Paste the whole file with nothing highlighted.
-- =========================================================

update public.achievements
set name = replace(name, 'byome', 'Byome'),
    description = replace(description, 'byome', 'Byome')
where name like '%byome%' or description like '%byome%';

update public.biome_items
set description = replace(description, 'byome', 'Byome')
where description like '%byome%';

-- Notifications already sent (e.g. 'You earned the "Welcome to byome"
-- achievement!'), leaving web and email addresses alone
update public.notifications
set message = regexp_replace(message, '(?<![./@a-z-])byome(?![@a-z-])(?!\.[a-z])', 'Byome', 'g')
where message ~ '(?<![./@a-z-])byome(?![@a-z-])(?!\.[a-z])';
