-- =========================================================
-- Byome: points for product variations.
-- When a product suggestion is approved, the member also earns points for
-- each of its variations (shades, scents, sizes...), on top of the usual
-- points for the product itself. Each variation is worth about a third of
-- a product (at least 1 Byome point), for up to 10 variations a product.
-- Only the variations still listed when a moderator approves count, so a
-- moderator should delete any that aren't real before approving.
-- Repeats ("Rose, rose") count once.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
--
-- Change the amount per variation later with, for example:
--   update point_rules set biome_points = 3, community_points = 1 where action = 'product_variation';
-- and the most variations that earn points per product with:
--   update point_rules set threshold = 15 where action = 'product_variation';
-- =========================================================


-- ---------- The rule: about a third of a product, per variation ----------
insert into public.point_rules (action, community_points, biome_points, delay_hours, label, notify, threshold, description)
select 'product_variation',
       round(coalesce(p.community_points, 0) / 3.0)::int,
       greatest(1, round(coalesce(p.biome_points, 0) / 3.0)::int),
       0, 'Product variations', true, 10,
       'For each variation (shade, scent, size...) of a product you suggested, up to 10 per product.'
from (select 1) one
left join public.point_rules p on p.action = 'product_approved'
on conflict (action) do nothing;


-- ---------- Paying out when a suggestion is approved ----------
-- One entry in the points history per product (all its variations
-- together), so it's never paid twice.
create or replace function public.award_variation_points(p_product uuid) returns void
language plpgsql security definer set search_path to public as $$
declare
  pr products%rowtype;
  rule point_rules%rowtype;
  n int;
  paid int;
  new_id uuid;
  parts text[] := '{}';
begin
  select * into pr from products where id = p_product;
  select * into rule from point_rules where action = 'product_variation';
  if pr.suggested_by is null or rule.action is null then return; end if;

  select count(distinct lower(trim(v))) into n
  from unnest(coalesce(pr.variations, '{}')) v where trim(v) <> '';
  paid := least(n, coalesce(rule.threshold, n));
  if paid < 1 then return; end if;

  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id,
                            available_at, biome_available_at)
  values (pr.suggested_by, 'product_variation', rule.community_points * paid, rule.biome_points * paid,
          'product', pr.id, now() + make_interval(hours => rule.delay_hours), now())
  on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
  returning id into new_id;
  if new_id is null or not rule.notify then return; end if;

  if rule.community_points <> 0 then parts := parts || ((rule.community_points * paid) || ' community points'); end if;
  if rule.biome_points <> 0 then parts := parts || ((rule.biome_points * paid) || ' Byome points'); end if;
  perform create_notification(pr.suggested_by, null, 'points', new_id,
    'You earned ' || array_to_string(parts, ' and ') || ' for the ' || paid
      || case when paid = 1 then ' variation' else ' variations' end
      || ' of "' || pr.brand || ' — ' || pr.name || '". Thanks for the extra detail!',
    'profile.html');
end $$;
revoke execute on function public.award_variation_points(uuid) from public, anon, authenticated;

-- The same as before (database/2026-10-11-moderation-log.sql), plus the
-- variation points
create or replace function public.handle_product_status() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      perform create_notification(new.suggested_by, null, 'moderation', new.id,
        'Your product suggestion "' || new.brand || ' — ' || new.name || '" was approved. You can review it now!',
        'reviews.html', false, 'positive');
      perform award_points(new.suggested_by, 'product_approved', 'product', new.id);
      perform award_variation_points(new.id);
    elsif new.status = 'rejected' then
      perform create_notification(new.suggested_by, null, 'moderation', new.id,
        'Your product suggestion "' || new.brand || ' — ' || new.name || '" wasn''t approved.'
        || case when coalesce(new.rejection_reason, '') <> '' then ' Reason: ' || new.rejection_reason else '' end,
        'suggest-product.html', false, 'negative');
    end if;
  end if;
  return new;
end $$;

select action, label, community_points, biome_points, threshold as most_variations_per_product
from public.point_rules where action in ('product_approved', 'product_variation') order by action;
