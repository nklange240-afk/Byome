-- =========================================================
-- Byome: Byome points are available right away.
-- Some activities' points wait a while before they can be used (each
-- rule's delay_hours), so moderators have time to catch anything that
-- breaks the rules. From now on only community points wait; Byome
-- points can be spent in the Byome Shop straight away. Byome points
-- already waiting are released now.
-- (If something is later removed by a moderator, its points are still
-- taken back, as before; a member who already spent them can end up
-- with a balance below zero until they earn more.)
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole
-- file with nothing highlighted.
-- =========================================================


-- ---------- When each entry's Byome points can be used ----------
alter table public.point_ledger add column if not exists biome_available_at timestamptz;
-- Everything earned so far: usable now (or when it already was)
update public.point_ledger set biome_available_at = least(available_at, now())
where biome_available_at is null;
alter table public.point_ledger alter column biome_available_at set default now();
alter table public.point_ledger alter column biome_available_at set not null;


-- ---------- Balances ----------
-- Same as before, except Byome points go by biome_available_at
create or replace view public.user_points with (security_invoker = true) as
select user_id,
       coalesce(sum(community_points) filter (where available_at <= now()), 0)::integer as community,
       coalesce(sum(biome_points) filter (where biome_available_at <= now()), 0)::integer as biome,
       coalesce(sum(community_points) filter (where available_at > now()), 0)::integer as pending_community,
       coalesce(sum(biome_points) filter (where biome_available_at > now()), 0)::integer as pending_biome
from public.point_ledger
where revoked_at is null
group by user_id;


-- ---------- Earning points ----------
-- Same as in 2026-10-13-polls.sql, except Byome points are available
-- right away, and the message only mentions a wait for community points
create or replace function public.award_points(p_user uuid, p_action text, p_ref_type text, p_ref uuid)
returns boolean
language plpgsql security definer set search_path to public as $$
declare
  rule point_rules%rowtype;
  today_count int;
  new_id uuid;
  msg text;
  parts text[] := '{}';
begin
  select * into rule from point_rules where action = p_action;
  if not found then return false; end if;

  if rule.daily_cap is not null then
    select count(*) into today_count from point_ledger
    where user_id = p_user and action = p_action and revoked_at is null
      and created_at >= date_trunc('day', now());
    if today_count >= rule.daily_cap then return false; end if;
  end if;

  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id,
                            available_at, biome_available_at)
  values (p_user, p_action, rule.community_points, rule.biome_points, p_ref_type, p_ref,
          now() + make_interval(hours => rule.delay_hours), now())
  on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
  returning id into new_id;

  if new_id is null then return false; end if;
  if p_action like 'mod\_%' or not rule.notify then return true; end if;  -- quiet rewards

  if rule.community_points <> 0 then parts := parts || (rule.community_points || ' community points'); end if;
  if rule.biome_points <> 0 then parts := parts || (rule.biome_points || ' Byome points'); end if;
  msg := 'You earned ' || array_to_string(parts, ' and ') || ': ' || rule.label || '.';
  if rule.delay_hours > 0 and rule.community_points <> 0 then
    msg := msg || case when rule.biome_points <> 0
                       then ' Your Byome points are ready to spend; the community points will be available in '
                       else ' They''ll be available in ' end
               || rule.delay_hours || ' hours.';
  end if;
  perform create_notification(p_user, null, 'points', new_id, msg, 'profile.html');
  return true;
end $$;


-- ---------- Spending points ----------
-- Same as in 2026-10-10-moderator-rewards.sql, except the balance counts
-- Byome points by biome_available_at
create or replace function public.buy_biome_item(p_key text) returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  item biome_items%rowtype;
  balance int;
  new_id uuid;
  new_sold int;
begin
  if me is null then raise exception 'Please log in first'; end if;

  -- One purchase at a time per member, so the same points can't be spent twice
  perform pg_advisory_xact_lock(hashtext('biome-buy'), hashtext(me::text));
  -- and one at a time per item, so a limited edition can't oversell
  select * into item from biome_items where key = p_key for update;

  if not found or not item.available or item.price is null then raise exception 'That item isn''t for sale'; end if;
  if item.starter then raise exception 'Everyone already has that one'; end if;
  if item.max_supply is not null and item.sold >= item.max_supply then raise exception 'Sorry, that one is sold out'; end if;
  if item.kind = 'shelf' and exists (select 1 from biome_inventory where user_id = me and item_key = p_key) then
    raise exception 'You already own that shelf';
  end if;
  if item.max_per_member is not null
     and (select count(*) from biome_inventory where user_id = me and item_key = p_key) >= item.max_per_member then
    raise exception 'That one is limited to % per member, and you already have it', item.max_per_member;
  end if;

  select coalesce(sum(biome_points), 0) into balance from point_ledger
  where user_id = me and revoked_at is null and biome_available_at <= now();
  if balance < item.price then raise exception 'Not enough Byome points yet'; end if;

  update biome_items set sold = sold + 1 where key = p_key returning sold into new_sold;
  insert into biome_inventory (user_id, item_key, serial, source)
  values (me, p_key, case when item.max_supply is not null then new_sold end, 'shop')
  returning id into new_id;
  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
  values (me, 'biome_purchase', 0, -item.price, 'biome_item', new_id);

  return jsonb_build_object(
    'serial', case when item.max_supply is not null then new_sold end,
    'balance', balance - item.price);
end $$;
