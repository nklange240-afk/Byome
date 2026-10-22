-- =========================================================
-- Byome: moderators get credit for variations they add.
-- Until now, variation points went to the member for every variation listed
-- when the product was approved, including ones a moderator typed in (for
-- example, replacing "28 variations" with the 28 real shade names).
-- Now, when a product is approved:
--  - the member is credited for the variations they entered themselves. A
--    moderator fixing a typo ("Rose Gld" to "Rose Gold") still counts as
--    the member's.
--  - variations a moderator added (or wrote in place of something that
--    wasn't a real variation) earn the moderator who added them Byome
--    points instead, at the same rate, up to 10 per product.
-- Sizes still never count. Products suggested before this file is run are
-- treated as before, except ones still waiting in the queue, which use
-- their current list as what the member entered.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-24-variation-points.sql first.
--
-- Change the moderators' amount or limit later with, for example:
--   update point_rules set biome_points = 10, threshold = 30 where action = 'mod_variations';
--
-- Fix a product approved before this (e.g. your 28-shade foundation):
--   select public.fix_variation_credit('Product name', 'your-username', 28, 0);
--   (28 = how many variations you added; 0 = how many the member entered
--    that were real, which they keep credit for)
-- =========================================================

-- What the member originally entered, and which moderator last changed
-- the variations
alter table public.products add column if not exists submitted_variations text[];
alter table public.products add column if not exists variations_edited_by uuid references public.profiles(id) on delete set null;

update public.products set submitted_variations = variations
where submitted_variations is null and status = 'pending';

create or replace function public.track_product_variations() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_variations := new.variations;
    new.variations_edited_by := null;
  elsif new.variations is distinct from old.variations
        and is_moderator() and auth.uid() is distinct from new.suggested_by then
    new.variations_edited_by := auth.uid();
  end if;
  -- (only the database sets these two)
  if tg_op = 'UPDATE' then new.submitted_variations := old.submitted_variations; end if;
  return new;
end $$;
drop trigger if exists products_track_variations on public.products;
create trigger products_track_variations before insert or update on public.products
for each row execute function public.track_product_variations();


-- ---------- Matching variations ----------
-- "  Rose   GOLD " and "rose gold" are the same variation
create or replace function public.variation_key(p_text text) returns text
language sql immutable set search_path to public as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'))
$$;

-- How many single-letter changes turn one word into the other
create or replace function public.edit_distance(a text, b text) returns int
language plpgsql immutable set search_path to public as $$
declare
  la int := char_length(a);
  lb int := char_length(b);
  prev int[];
  cur int[];
  i int; j int;
begin
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  prev := array(select generate_series(0, lb));
  for i in 1..la loop
    cur := array[i];
    for j in 1..lb loop
      cur := cur || least(prev[j + 1] + 1, cur[j] + 1,
                          prev[j] + case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end);
    end loop;
    prev := cur;
  end loop;
  return prev[lb + 1];
end $$;

-- A typo fix: close enough to count as the same variation
create or replace function public.is_typo_fix(a text, b text) returns boolean
language sql immutable set search_path to public as $$
  select edit_distance(a, b) <= greatest(1, least(3, greatest(char_length(a), char_length(b)) / 4))
$$;


-- ---------- The moderators' rule ----------
insert into public.point_rules (action, community_points, biome_points, delay_hours, label, notify, threshold, description)
select 'mod_variations', 0, coalesce(v.biome_points, 8), 0, 'Variations added (moderator)', true, 10,
       'For each variation you add to a product suggestion while moderating (not typo fixes), up to 10 per product.'
from (select 1) one
left join public.point_rules v on v.action = 'product_variation'
on conflict (action) do nothing;


-- ---------- Paying out when a suggestion is approved ----------
-- Same as before, but split between the member (what they entered) and the
-- moderator (what they added). One entry in the points history each.
create or replace function public.award_variation_points(p_product uuid) returns void
language plpgsql security definer set search_path to public as $$
declare
  pr products%rowtype;
  rule point_rules%rowtype;
  mrule point_rules%rowtype;
  finals text[];
  originals text[];
  member_n int := 0;
  mod_n int := 0;
  f text;
  o text;
  hit int;
  paid int;
  new_id uuid;
  parts text[] := '{}';
  editor uuid;
begin
  select * into pr from products where id = p_product;
  select * into rule from point_rules where action = 'product_variation';
  select * into mrule from point_rules where action = 'mod_variations';
  if rule.action is null then return; end if;

  select coalesce(array_agg(distinct variation_key(v)), '{}') into finals
  from unnest(coalesce(pr.variations, '{}')) v where btrim(v) <> '' and not looks_like_size(v);
  -- (products suggested before this was set up: everything counts as the member's)
  select coalesce(array_agg(distinct variation_key(v)), '{}') into originals
  from unnest(coalesce(pr.submitted_variations, pr.variations, '{}')) v where btrim(v) <> '' and not looks_like_size(v);

  -- The member's: exact matches first, then typo fixes (each original once)
  foreach f in array finals loop
    hit := array_position(originals, f);
    if hit is not null then
      member_n := member_n + 1;
      originals := originals[1:hit - 1] || originals[hit + 1:];
      finals := array_remove(finals, f);
    end if;
  end loop;
  foreach f in array finals loop
    hit := null;
    for i in 1..coalesce(array_length(originals, 1), 0) loop
      if is_typo_fix(originals[i], f) then hit := i; exit; end if;
    end loop;
    if hit is not null then
      member_n := member_n + 1;
      originals := originals[1:hit - 1] || originals[hit + 1:];
    else
      mod_n := mod_n + 1;
    end if;
  end loop;

  -- The member
  paid := least(member_n, coalesce(rule.threshold, member_n));
  if pr.suggested_by is not null and paid >= 1 then
    insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id,
                              available_at, biome_available_at)
    values (pr.suggested_by, 'product_variation', rule.community_points * paid, rule.biome_points * paid,
            'product', pr.id, now() + make_interval(hours => rule.delay_hours), now())
    on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
    returning id into new_id;
    if new_id is not null and rule.notify then
      if rule.community_points <> 0 then parts := parts || ((rule.community_points * paid) || ' community points'); end if;
      if rule.biome_points <> 0 then parts := parts || ((rule.biome_points * paid) || ' Byome points'); end if;
      perform create_notification(pr.suggested_by, null, 'points', new_id,
        'You earned ' || array_to_string(parts, ' and ') || ' for the ' || paid
          || case when paid = 1 then ' variation' else ' variations' end
          || ' of "' || pr.brand || ' — ' || pr.name || '". Thanks for the extra detail!',
        'profile.html');
    end if;
  end if;

  -- The moderator who added the rest (or, failing that, the one approving)
  editor := coalesce(pr.variations_edited_by, auth.uid());
  if mod_n >= 1 and mrule.action is not null and editor is not null
     and editor is distinct from pr.suggested_by
     and exists (select 1 from profiles where id = editor and is_moderator) then
    paid := least(mod_n, coalesce(mrule.threshold, mod_n));
    new_id := null;
    insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id,
                              available_at, biome_available_at)
    values (editor, 'mod_variations', mrule.community_points * paid, mrule.biome_points * paid,
            'product', pr.id, now(), now())
    on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
    returning id into new_id;
    if new_id is not null and mrule.notify and mrule.biome_points <> 0 then
      insert into notifications (user_id, actor_id, type, ref_id, message, link)
      values (editor, null, 'points', new_id,
        'You earned ' || (mrule.biome_points * paid) || ' Byome points for adding ' || mod_n
          || case when mod_n = 1 then ' variation' else ' variations' end
          || ' to "' || pr.brand || ' — ' || pr.name || '". Thank you for the extra work!',
        'profile.html');
    end if;
  end if;
end $$;
revoke execute on function public.award_variation_points(uuid) from public, anon, authenticated;


-- ---------- Fixing products approved before this ----------
-- From the SQL Editor only. Takes back the member's variation points for the
-- product and gives them points for p_member_keeps variations instead (0 if
-- none of theirs were real), and gives the moderator points for p_added.
create or replace function public.fix_variation_credit(p_product text, p_moderator text,
  p_added int, p_member_keeps int default 0) returns text
language plpgsql security definer set search_path to public as $$
declare
  pr products%rowtype;
  found_n int;
  rule point_rules%rowtype;
  mrule point_rules%rowtype;
  mod_id uuid;
  paid int;
  new_id uuid;
begin
  select count(*) into found_n from products
  where status = 'approved' and (lower(name) = lower(btrim(p_product)) or lower(brand || ' ' || name) = lower(btrim(p_product)));
  if found_n = 0 then return 'No approved product called "' || p_product || '". Try the exact name, or "Brand Name".'; end if;
  if found_n > 1 then return 'More than one product is called "' || p_product || '". Add the brand in front, like "Brand Name".'; end if;
  select * into pr from products
  where status = 'approved' and (lower(name) = lower(btrim(p_product)) or lower(brand || ' ' || name) = lower(btrim(p_product)));
  select id into mod_id from profiles where lower(username) = lower(btrim(p_moderator)) and is_moderator;
  if mod_id is null then return 'No moderator called "' || p_moderator || '".'; end if;
  select * into rule from point_rules where action = 'product_variation';
  select * into mrule from point_rules where action = 'mod_variations';

  update point_ledger set revoked_at = now()
  where action = 'product_variation' and ref_id = pr.id and revoked_at is null;
  paid := least(greatest(coalesce(p_member_keeps, 0), 0), coalesce(rule.threshold, 10));
  if paid > 0 and pr.suggested_by is not null then
    insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id, available_at, biome_available_at)
    values (pr.suggested_by, 'product_variation', rule.community_points * paid, rule.biome_points * paid, 'product', pr.id, now(), now());
  end if;

  update point_ledger set revoked_at = now()
  where action = 'mod_variations' and ref_id = pr.id and revoked_at is null;
  paid := least(greatest(coalesce(p_added, 0), 0), coalesce(mrule.threshold, 10));
  if paid > 0 then
    insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id, available_at, biome_available_at)
    values (mod_id, 'mod_variations', mrule.community_points * paid, mrule.biome_points * paid, 'product', pr.id, now(), now())
    returning id into new_id;
    insert into notifications (user_id, actor_id, type, ref_id, message, link)
    values (mod_id, null, 'points', new_id,
      'You earned ' || (mrule.biome_points * paid) || ' Byome points for adding variations to "' || pr.brand || ' — ' || pr.name || '". Thank you!',
      'profile.html');
  end if;
  return 'Done: ' || pr.brand || ' — ' || pr.name || '. The member now has credit for '
    || least(greatest(coalesce(p_member_keeps, 0), 0), coalesce(rule.threshold, 10)) || ' variations; '
    || p_moderator || ' got ' || (mrule.biome_points * paid) || ' Byome points.';
end $$;
revoke execute on function public.fix_variation_credit(text, text, int, int) from public, anon, authenticated;
