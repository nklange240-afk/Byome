-- =========================================================
-- byome achievements, part 1: the system + "Welcome to byome"
-- Run this once in the Supabase SQL Editor (after 2026-10-02-biome-shop.sql).
--
-- Every member (new and existing) earns "Welcome to byome" and gets a
-- Welcome sprout, which goes straight onto their shelf in a terra cotta pot.
--
-- The sprout's picture is a placeholder. To use your own drawing, upload it
-- to GitHub as biome-assets/plant-welcome-sprout.png (same name, replacing
-- the placeholder). To rename it:
--   update biome_items set name = 'New name' where key = 'welcome-sprout';
--
-- Adding an achievement later:
--   insert into achievements (key, name, description, reward_item)
--   values ('ten-makeup-reviews', 'Makeup maven', 'Wrote 10 makeup reviews.', 'some-item-key');
-- (Then it needs a rule for when it's earned, which goes in the code.)
-- =========================================================


-- ---------- The welcome gift ----------
-- A plant that can't be bought (no price), only earned
insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('welcome-sprout', 'plant', 'small', 'Welcome sprout', 'A gift for joining byome.',
        'common', null, 'biome-assets/plant-welcome-sprout.png', 1);


-- ---------- Achievements ----------

create table public.achievements (
  key text primary key check (key ~ '^[a-z0-9-]+$'),
  name text not null,
  description text not null,
  reward_item text references public.biome_items(key),  -- optional biome item given when earned
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.achievements enable row level security;
create policy "Anyone can see the achievements" on public.achievements for select to public using (true);

insert into public.achievements (key, name, description, reward_item, sort_order)
values ('welcome', 'Welcome to byome', 'Joined the byome community.', 'welcome-sprout', 1);

create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references public.achievements(key),
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);
alter table public.user_achievements enable row level security;
-- Achievements show on profiles, so members can see everyone's
create policy "Members can see achievements" on public.user_achievements for select to authenticated using (true);


-- Give an achievement (once), its reward item, and a notification.
-- A plant reward goes straight onto the shelf, in the default pot, if
-- there's a free spot of its size.
create or replace function public.grant_achievement(p_user uuid, p_key text) returns boolean
language plpgsql security definer set search_path to public as $$
declare
  a achievements%rowtype;
  it biome_items%rowtype;
  default_pot text;
  free_spot int;
  msg text;
begin
  insert into user_achievements (user_id, achievement_key) values (p_user, p_key)
  on conflict do nothing;
  if not found then return false; end if;  -- already had it

  select * into a from achievements where key = p_key;
  msg := 'You earned the "' || a.name || '" achievement!';

  if a.reward_item is not null then
    select * into it from biome_items where key = a.reward_item;
    insert into biome_inventory (user_id, item_key, source) values (p_user, it.key, 'achievement');
    msg := msg || ' You got a ' || lower(it.name) || ' for your biome.';

    if it.kind = 'plant' then
      select key into default_pot from biome_items
      where kind = 'pot' and starter and size = it.size order by sort_order limit 1;
      select min(s) into free_spot
      from generate_series(case when it.size = 'small' then 0 else 8 end,
                           case when it.size = 'small' then 7 else 10 end) s
      where not exists (select 1 from biome_slots where user_id = p_user and slot = s);
      if default_pot is not null and free_spot is not null then
        insert into biome_slots (user_id, slot, pot_key, plant_key) values (p_user, free_spot, default_pot, it.key);
        msg := msg || ' It''s already on your shelf.';
      end if;
    end if;
  end if;

  perform create_notification(p_user, null, 'achievement', null, msg, 'profile.html');
  return true;
end $$;
revoke execute on function public.grant_achievement(uuid, text) from public, anon, authenticated;


-- ---------- Earning "Welcome to byome" ----------

create or replace function public.on_profile_achievements() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  begin
    perform grant_achievement(new.id, 'welcome');
  exception when others then
    null;  -- never let a gift problem stop someone signing up
  end;
  return new;
end $$;

create trigger profiles_achievements after insert on public.profiles
  for each row execute function public.on_profile_achievements();

-- Everyone who's already a member gets it too
select public.grant_achievement(id, 'welcome') from public.profiles;


-- ---------- Plants come in the default pot ----------
-- Same as before, except: choosing a plant for an empty spot (no pot given)
-- puts it in the default terra cotta pot. Pots can be swapped afterwards.
create or replace function public.set_biome_slot(p_slot int, p_pot text, p_plant text default null) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  spot_size text := case when p_slot between 0 and 7 then 'small' when p_slot between 8 and 10 then 'medium' end;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if spot_size is null then raise exception 'There''s no spot % on the shelf', p_slot; end if;

  if p_pot is null and p_plant is not null then
    select key into p_pot from biome_items
    where kind = 'pot' and starter and size = spot_size order by sort_order limit 1;
    if p_pot is null then raise exception 'There''s no pot for this spot yet'; end if;
  end if;

  if p_pot is null then
    delete from biome_slots where user_id = me and slot = p_slot;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('biome-slot'), hashtext(me::text));
  perform biome_check_placeable(me, p_pot, 'pot', spot_size, p_slot);
  if p_plant is not null then
    perform biome_check_placeable(me, p_plant, 'plant', spot_size, p_slot);
  end if;

  insert into biome_slots (user_id, slot, pot_key, plant_key, updated_at)
  values (me, p_slot, p_pot, p_plant, now())
  on conflict (user_id, slot) do update
    set pot_key = excluded.pot_key, plant_key = excluded.plant_key, updated_at = now();
end $$;
