-- =========================================================
-- Byome: Small and Large pots and plants.
--  - Members now see "Large" instead of "medium" (the database still says
--    'medium'). Pots named "Medium ..." become "Large ...", and the bottom
--    shelf's free terra cotta pot is the "Large terra cotta pot".
--  - Small pots can now go on any shelf, including the bottom one. Large
--    pots still need the bottom shelf.
--  - A plant has to match its pot's size: small plants in small pots,
--    large plants in large pots. A plant put in an empty spot comes in the
--    free terra cotta pot of its own size.
--  - Companions that only visit small pots (like the ladybug) can visit a
--    small pot on the bottom shelf too.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

update public.biome_items set name = 'Large ' || substr(name, 8) where name like 'Medium %';
update public.biome_items set name = 'Large terra cotta pot' where key = 'terra-cotta-medium';


-- ---------- Does this item fit here? ----------
-- p_size is the size of the space: the spot for a pot, or the pot for a plant.
-- Small things fit in large spaces; large things only in large ones.
create or replace function public.biome_check_placeable(p_user uuid, p_key text, p_kind text, p_size text, p_slot int)
returns void
language plpgsql security definer set search_path to public as $$
declare it biome_items%rowtype; owned int; used int;
begin
  select * into it from biome_items where key = p_key;
  if not found or it.kind <> p_kind then raise exception 'That isn''t a %', p_kind; end if;
  if it.size = 'medium' and p_size is distinct from 'medium' then
    raise exception 'Uh oh! That''s a large % and needs extra space. Place it on the bottom shelf.', p_kind;
  end if;
  if it.size is distinct from 'small' and it.size is distinct from p_size then
    raise exception 'That % doesn''t fit here', p_kind;
  end if;
  if it.starter then return; end if;
  select count(*) into owned from biome_inventory where user_id = p_user and item_key = p_key;
  select count(*) into used from biome_slots
  where user_id = p_user and slot <> p_slot and (pot_key = p_key or plant_key = p_key);
  if used >= owned then raise exception 'You don''t have a spare % of those', p_kind; end if;
end $$;
revoke execute on function public.biome_check_placeable(uuid, text, text, text, int) from public, anon, authenticated;


-- ---------- Put a pot (and maybe a plant) in a spot ----------
create or replace function public.set_biome_slot(p_slot int, p_pot text, p_plant text default null) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  spot_size text := case when p_slot between 0 and 7 then 'small' when p_slot between 8 and 10 then 'medium' end;
  pot_size text;
  plant_size text;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if spot_size is null then raise exception 'There''s no spot % on the shelf', p_slot; end if;

  if p_plant is not null then
    select size into plant_size from biome_items where key = p_plant and kind = 'plant';
    if not found then raise exception 'That isn''t a plant'; end if;
  end if;

  -- A plant on its own comes in the free terra cotta pot of its size
  if p_pot is null and p_plant is not null then
    select key into p_pot from biome_items
    where kind = 'pot' and starter and size = plant_size order by sort_order limit 1;
    if p_pot is null then raise exception 'There''s no pot for that plant yet'; end if;
  end if;

  if p_pot is null then
    delete from biome_slots where user_id = me and slot = p_slot;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('biome-slot'), hashtext(me::text));
  perform biome_check_placeable(me, p_pot, 'pot', spot_size, p_slot);
  select size into pot_size from biome_items where key = p_pot;
  if p_plant is not null then
    if plant_size is distinct from pot_size then
      raise exception 'That plant needs a % pot', case when plant_size = 'medium' then 'large' else 'small' end;
    end if;
    perform biome_check_placeable(me, p_plant, 'plant', pot_size, p_slot);
  end if;

  insert into biome_slots (user_id, slot, pot_key, plant_key, updated_at)
  values (me, p_slot, p_pot, p_plant, now())
  on conflict (user_id, slot) do update
    set pot_key = excluded.pot_key, plant_key = excluded.plant_key, updated_at = now();
end $$;
revoke execute on function public.set_biome_slot(int, text, text) from public, anon;
grant execute on function public.set_biome_slot(int, text, text) to authenticated;


-- ---------- Companions visit pots of their size ----------
create or replace function public.set_biome_companion(p_slot int, p_key text default null) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  it biome_items%rowtype;
  owned int;
  used int;
  pot_size text;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if p_key is null then
    update biome_slots set companion_key = null, updated_at = now() where user_id = me and slot = p_slot;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('biome-slot'), hashtext(me::text));
  select * into it from biome_items where key = p_key;
  if not found or it.kind <> 'companion' then raise exception 'That isn''t a companion'; end if;
  select i.size into pot_size from biome_slots s join biome_items i on i.key = s.pot_key
  where s.user_id = me and s.slot = p_slot;
  if not found then raise exception 'Put a pot in this spot first'; end if;
  if it.size is not null and it.size is distinct from pot_size then
    raise exception 'The % only visits % pots', lower(it.name), case when it.size = 'medium' then 'large' else 'small' end;
  end if;
  select count(*) into owned from biome_inventory where user_id = me and item_key = p_key;
  if owned = 0 then raise exception 'You don''t have that companion yet'; end if;

  -- all of them are busy elsewhere: move one over
  select count(*) into used from biome_slots where user_id = me and slot <> p_slot and companion_key = p_key;
  if used >= owned then
    update biome_slots set companion_key = null, updated_at = now()
    where user_id = me and slot = (select min(slot) from biome_slots
                                   where user_id = me and slot <> p_slot and companion_key = p_key);
  end if;

  update biome_slots set companion_key = p_key, updated_at = now() where user_id = me and slot = p_slot;
end $$;
revoke execute on function public.set_biome_companion(int, text) from public, anon;
grant execute on function public.set_biome_companion(int, text) to authenticated;

select key, name, case size when 'medium' then 'Large' else 'Small' end as size
from public.biome_items where kind in ('pot', 'plant') and size = 'medium' order by sort_order;
