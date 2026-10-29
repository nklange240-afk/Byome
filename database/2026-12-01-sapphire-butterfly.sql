-- =========================================================
-- Byome: the Sapphire Butterfly, a one-of-a-kind thank-you for finding
-- Byome's first site-breaking bug (reviews, likes and comments stopped
-- saving after the levels update). There's only ever one (#1 of 1), it
-- isn't sold, and it goes to jamiliahtate with a notification.
-- It rests on the rim of a small pot, like the ladybug.
-- Run in the Supabase SQL Editor. Safe to run again (it won't give a
-- second one). Paste the whole file with nothing highlighted.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, max_supply, max_per_member, sort_order)
values ('sapphire-butterfly', 'companion', 'small', 'Sapphire Butterfly',
  'One of a kind. A thank-you for finding Byome''s first site-breaking bug.',
  'heirloom', null, 'biome-assets/companion-sapphire-butterfly.png', 1, 1, 2)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image,
  max_supply = excluded.max_supply, max_per_member = excluded.max_per_member;

-- Give it to jamiliahtate (once)
do $$
declare who uuid;
begin
  select id into who from public.profiles where lower(username) = 'jamiliahtate';
  if who is null then raise exception 'No member called jamiliahtate'; end if;
  if not exists (select 1 from public.biome_inventory where item_key = 'sapphire-butterfly') then
    insert into public.biome_inventory (user_id, item_key, serial, source) values (who, 'sapphire-butterfly', 1, 'gift');
    update public.biome_items set sold = 1 where key = 'sapphire-butterfly';
    perform public.create_notification(who, null, 'achievement', null,
      'Thank you for finding Byome''s first site-breaking bug! We made something just for you: the Sapphire Butterfly, '
        || 'the only one there will ever be. It''s waiting for you on your shelf.',
      'profile.html?shelf=edit', false, 'positive');
  end if;
end $$;

-- Check
select p.username, i.item_key, i.serial, i.acquired_at
from public.biome_inventory i join public.profiles p on p.id = i.user_id
where i.item_key = 'sapphire-butterfly';
