-- =========================================================
-- byome: the "First bloom" achievement and its reward, a Bunch of daisies.
-- Earned with your first review that passes the quality check (the same
-- check that awards review points), so a junk review can't unlock it.
-- Run once in the Supabase SQL Editor (after 2026-10-03-terry-and-sweetheart.sql).
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('daisies', 'plant', 'small', 'Bunch of daisies',
        'For your first review: the first flowers of spring, and the first of many honest words.',
        'common', null, 'biome-assets/plant-daisies.png', 4);

insert into public.achievements (key, name, description, reward_item, sort_order)
values ('first-bloom', 'First bloom', 'Wrote your first review.', 'daisies', 3);

-- A review earns points only when it passes the quality check, so the
-- first "review" entry in the points ledger is the first quality review.
create or replace function public.check_first_bloom() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if new.action = 'review' and new.revoked_at is null then
    perform grant_achievement(new.user_id, 'first-bloom');  -- does nothing if they already have it
  end if;
  return new;
end $$;

create trigger point_ledger_first_bloom after insert on public.point_ledger
  for each row execute function public.check_first_bloom();

-- Members who've already written a quality review get it now
select public.grant_achievement(p.id, 'first-bloom') from public.profiles p
where p.deleted_at is null
  and exists (select 1 from public.point_ledger l
              where l.user_id = p.id and l.action = 'review' and l.revoked_at is null);
