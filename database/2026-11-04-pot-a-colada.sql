-- =========================================================
-- Byome: the "Haworthia Hoarder" achievement and its reward, the
-- Pot-a-colada (a small pineapple pot: add a zebra haworthia for the crown).
--  - Earned the moment a member buys their second zebra haworthia in the
--    Byome Shop. It's a surprise: it only shows on profiles once earned.
--  - Members who have already bought two get it when you run this file.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('pot-a-colada', 'pot', 'small', 'Pot-a-colada',
        'Not quite a pineapple... until you add a zebra haworthia on top!',
        'uncommon', null, 'biome-assets/pot-pot-a-colada.png', 27)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image;

insert into public.achievements (key, name, description, reward_item, sort_order)
values ('haworthia-hoarder', 'Haworthia Hoarder', 'Bought two zebra haworthia... and found a use for the spare.', 'pot-a-colada', 26)
on conflict (key) do nothing;


-- ---------- Buying the second zebra haworthia ----------
create or replace function public.check_haworthia_hoarder() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if (select count(*) from biome_inventory
      where user_id = new.user_id and item_key = 'zebra-haworthia' and source = 'shop') >= 2 then
    perform grant_achievement(new.user_id, 'haworthia-hoarder');
  end if;
  return null;
end $$;
revoke execute on function public.check_haworthia_hoarder() from public, anon, authenticated;

drop trigger if exists haworthia_hoarder on public.biome_inventory;
create trigger haworthia_hoarder after insert on public.biome_inventory
for each row when (new.item_key = 'zebra-haworthia' and new.source = 'shop')
execute function public.check_haworthia_hoarder();


-- ---------- Members who already bought two ----------
select public.grant_achievement(i.user_id, 'haworthia-hoarder')
from public.biome_inventory i
join public.profiles p on p.id = i.user_id and p.deleted_at is null
where i.item_key = 'zebra-haworthia' and i.source = 'shop'
group by i.user_id having count(*) >= 2;

select p.username, ua.earned_at from public.user_achievements ua
join public.profiles p on p.id = ua.user_id
where ua.achievement_key = 'haworthia-hoarder' order by ua.earned_at;
