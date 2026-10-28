-- =========================================================
-- Byome: suggest a new variation (shade, scent...) of a listed product.
-- When a brand releases a new shade of something already on Byome, members
-- can suggest it from the product's page or the Suggest a product page.
-- A moderator approves it (it's added to the product, and the member earns
-- the same points as for a variation of a product they suggested) or
-- rejects it with a reason.
-- Run in the Supabase SQL Editor AFTER 2026-11-22-review-new-products.sql.
-- Safe to run again. Paste the whole file with nothing highlighted. Run it
-- before publishing the site update that came with it.
-- =========================================================

create table if not exists public.variation_suggestions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variation text not null check (char_length(btrim(variation)) between 1 and 100),
  suggested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text check (char_length(rejection_reason) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists variation_suggestions_pending_idx
  on public.variation_suggestions (created_at) where status = 'pending';
create index if not exists variation_suggestions_user_idx
  on public.variation_suggestions (suggested_by, created_at desc);

-- Members see their own; moderators see all. Changes only go through the
-- functions below.
alter table public.variation_suggestions enable row level security;
drop policy if exists "See your own variation suggestions" on public.variation_suggestions;
create policy "See your own variation suggestions" on public.variation_suggestions for select to authenticated
  using (suggested_by = (select auth.uid()) or (select is_moderator()));


-- ---------- Suggesting one ----------
-- Returns a thank-you message, or raises a friendly reason it can't be added
create or replace function public.suggest_variation(p_product uuid, p_variation text) returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  pr products%rowtype;
  v text := btrim(regexp_replace(coalesce(p_variation, ''), '\s+', ' ', 'g'));
begin
  if me is null then raise exception 'Please log in first'; end if;
  select * into pr from products where id = p_product and status = 'approved';
  if not found then raise exception 'That product isn''t on Byome'; end if;
  if v = '' then raise exception 'Please type the shade or scent'; end if;
  if char_length(v) > 100 then raise exception 'That''s a bit long. Please keep it under 100 characters'; end if;
  if looks_like_size(v) then
    raise exception 'That looks like a size. Sizes aren''t variations (reviews cover every size of a product)';
  end if;
  if exists (select 1 from unnest(coalesce(pr.variations, '{}')) e where variation_key(e) = variation_key(v)) then
    raise exception '"%" is already listed for this product', v;
  end if;
  if exists (select 1 from variation_suggestions where product_id = pr.id and status = 'pending'
             and variation_key(variation) = variation_key(v)) then
    raise exception 'Someone has already suggested "%". It''s waiting for a moderator', v;
  end if;
  if (select count(*) from variation_suggestions where suggested_by = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Whoa, that''s a lot of suggestions in a short time! Please take a little break and try again later.';
  end if;

  insert into variation_suggestions (product_id, variation, suggested_by) values (pr.id, v, me);
  perform notify_moderators(me, pr.id,
    'New variation suggestion: "' || v || '" for ' || pr.brand || ' — ' || pr.name || '.');
  return 'Thanks! A moderator will check "' || v || '" soon, and we''ll let you know when it''s added.';
end $$;
revoke execute on function public.suggest_variation(uuid, text) from public, anon;
grant execute on function public.suggest_variation(uuid, text) to authenticated;


-- ---------- Approving or rejecting one (moderators) ----------
-- p_variation: the moderator's corrected spelling, if they fixed a typo
create or replace function public.decide_variation(p_id uuid, p_approve boolean, p_reason text default null, p_variation text default null)
returns text
language plpgsql security definer set search_path to public as $$
declare
  s variation_suggestions%rowtype;
  pr products%rowtype;
  v text;
  label text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  select * into s from variation_suggestions where id = p_id for update;
  if not found or s.status <> 'pending' then raise exception 'That suggestion isn''t waiting any more'; end if;
  select * into pr from products where id = s.product_id;
  label := pr.brand || ' — ' || pr.name;

  if p_approve then
    v := btrim(regexp_replace(coalesce(nullif(btrim(p_variation), ''), s.variation), '\s+', ' ', 'g'));
    if looks_like_size(v) then raise exception 'That looks like a size, so it can''t be added as a variation'; end if;
    if not exists (select 1 from unnest(coalesce(pr.variations, '{}')) e where variation_key(e) = variation_key(v)) then
      if coalesce(array_length(pr.variations, 1), 0) >= 30 then
        raise exception 'This product already has 30 variations, the most it can have';
      end if;
      update products set variations = coalesce(variations, '{}') || v where id = pr.id;
    end if;
    update variation_suggestions set status = 'approved', variation = v, decided_at = now() where id = s.id;
    perform award_points(s.suggested_by, 'product_variation', 'variation', s.id);
    perform create_notification(s.suggested_by, null, 'moderation', pr.id,
      'Thanks! "' || v || '" was added to ' || label || '.',
      'reviews.html?product=' || pr.id, false, 'positive');
    perform log_moderation('approve', 'variation', s.id, s.suggested_by, 'positive', v || ' (' || label || ')');
  else
    update variation_suggestions set status = 'rejected', rejection_reason = left(nullif(btrim(p_reason), ''), 500),
      decided_at = now() where id = s.id;
    perform create_notification(s.suggested_by, null, 'moderation', pr.id,
      'Your suggestion "' || s.variation || '" for ' || label || ' wasn''t added.'
        || case when coalesce(btrim(p_reason), '') <> '' then ' Reason: ' || btrim(p_reason)
                || case when btrim(p_reason) ~ '[.!?]$' then '' else '.' end else '' end,
      'reviews.html?product=' || pr.id, false, 'negative');
    perform log_moderation('reject', 'variation', s.id, s.suggested_by, 'negative',
      s.variation || ' (' || label || ')' || case when coalesce(btrim(p_reason), '') <> '' then ': ' || btrim(p_reason) else '' end);
  end if;
  perform reward_moderator('mod_decision', 'variation', s.id, s.suggested_by);
  return case when p_approve then 'Added "' || v || '" to ' || label || '.' else 'Rejected.' end;
end $$;
revoke execute on function public.decide_variation(uuid, boolean, text, text) from public, anon;
grant execute on function public.decide_variation(uuid, boolean, text, text) to authenticated;


-- ---------- The Moderate badge counts them too ----------
create or replace function public.moderation_counts() returns integer
language plpgsql stable security definer set search_path to public as $$
begin
  if not is_moderator() then return 0; end if;
  return (select count(*) from products where status = 'pending')
       + (select count(*) from variation_suggestions where status = 'pending')
       + (select count(*) from posts where held_at is not null)
       + (select count(*) from comments where held_at is not null)
       + (select count(*) from reviews where held_at is not null and not awaiting_product)
       + (select count(*) from review_updates where held_at is not null)
       + (select count(distinct coalesce(post_id, comment_id, review_id, profile_id))
            from content_reports where resolved_at is null)
       + (select count(*) from modmail_threads where status = 'open' and last_from = 'member');
end $$;
