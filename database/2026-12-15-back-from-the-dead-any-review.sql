-- =========================================================
-- Byome: for the last day of Haunted Harvest, "Back from the Dead" counts
-- an update on any of your reviews, not just one that's at least 3 days
-- old (so newer members can earn it too). The update still needs at least
-- 50 characters, and still has to be added while the event is on.
--
-- Also gives it to anyone who already added an update like that during
-- the event but missed out because their review was too new.
--
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================

-- Back from the Dead: an update on any of your reviews
create or replace function public.event_on_review_update() returns trigger
language plpgsql security definer set search_path to public as $$
declare e events := halloween();
begin
  if new.held_at is null and new.created_at between e.starts_at and e.ends_at
     and event_text_length(new.body) >= 50
     and exists (select 1 from reviews r where r.id = new.review_id and r.user_id = new.user_id) then
    perform event_qualify(new.user_id, 'hh-back-from-the-dead');
  end if;
  return new;
end $$;

-- Anyone who already qualifies now
do $$
declare
  e events := halloween();
  m uuid;
begin
  for m in
    select distinct u.user_id from review_updates u join reviews r on r.id = u.review_id and r.user_id = u.user_id
    where u.held_at is null and u.created_at between e.starts_at and e.ends_at
      and event_text_length(u.body) >= 50
      and not exists (select 1 from event_qualifications q where q.user_id = u.user_id and q.achievement_key = 'hh-back-from-the-dead')
  loop
    perform event_qualify(m, 'hh-back-from-the-dead');
  end loop;
end $$;

-- Check: how many members have it now
select count(*) as members_with_back_from_the_dead
from public.event_qualifications where achievement_key = 'hh-back-from-the-dead';
