-- =========================================================
-- Byome: "Bait the Trap" (Haunted Harvest 2026) now needs 4 votes instead
-- of 5, since there aren't many active members yet. Anyone whose event
-- poll already has votes from 4 other members gets it now (with its Venus
-- flytrap and Byome points), and is told.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

update public.achievements set
  description = 'Made a poll that 4 members voted in, during Haunted Harvest 2026.',
  how_to = 'Start a poll in the Community during the event and get votes from 4 other members (votes count until Nov 15).'
where key = 'hh-bait-the-trap';

-- The two places that count votes: when a vote comes in, and the progress
-- shown on the Events page ("3 of 4")
do $$
declare d text;
begin
  d := pg_get_functiondef('public.event_on_vote()'::regprocedure);
  d := replace(d, 'v.user_id <> creator) >= 5 then', 'v.user_id <> creator) >= 4 then');
  execute d;
  d := pg_get_functiondef('public.event_overview(text)'::regprocedure);
  d := replace(d, 'group by p.id) x), 0), ''need'', 5)', 'group by p.id) x), 0), ''need'', 4)');
  execute d;
end $$;

-- Anyone who already qualifies gets it now
do $$
declare
  e events;
  r record;
begin
  select * into e from events where key = 'halloween-2026';
  for r in
    select distinct p.user_id from posts p join polls pl on pl.post_id = p.id
    where p.held_at is null and pl.created_at between e.starts_at and e.ends_at
      and (select count(distinct v.user_id) from poll_votes v where v.post_id = p.id and v.user_id <> p.user_id) >= 4
  loop
    perform event_qualify(r.user_id, 'hh-bait-the-trap');
  end loop;
end $$;

-- Check: everyone who has it now
select pr.username, q.qualified_at
from event_qualifications q join profiles pr on pr.id = q.user_id
where q.achievement_key = 'hh-bait-the-trap'
order by q.qualified_at;
