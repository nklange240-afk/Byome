-- =========================================================
-- Byome: no time limits for moderators, and editing listed products.
--
--  - The "Whoa, that's a lot of ... in a short time!" limits on posts,
--    comments, reviews, review updates and product suggestions don't
--    apply to moderators.
--  - When a moderator adds a shade or scent to a listed product ("Missing
--    one? Suggest a new shade or scent"), it's added straight away: no
--    suggestion to approve, and no daily limit.
--  - Moderators can edit products that are already on Byome (name, brand,
--    category, photo and variations) from the product's page. Each edit
--    goes in the moderation log, like edits to suggestions do (without
--    extra Byome points, so the log can't be used to farm them).
--
-- Safe to run again. Paste the whole file with nothing highlighted. Run it
-- before publishing the site update that came with it.
-- =========================================================

-- ---------- Posting limits: not for moderators ----------
create or replace function public.rate_limit_new_row() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  made int;
  cap int;
  win interval;
  what text;
begin
  if me is null then return new; end if;  -- the SQL Editor and the site's own jobs
  if is_moderator() then return new; end if;  -- moderators have no limits
  case tg_table_name
    when 'posts' then cap := 10; win := interval '1 hour'; what := 'posts';
      select count(*) into made from posts where user_id = me and created_at > now() - win;
    when 'comments' then cap := 40; win := interval '1 hour'; what := 'comments';
      select count(*) into made from comments where user_id = me and created_at > now() - win;
    when 'reviews' then cap := 15; win := interval '1 hour'; what := 'reviews';
      select count(*) into made from reviews where user_id = me and created_at > now() - win;
    when 'review_updates' then cap := 20; win := interval '1 hour'; what := 'review updates';
      select count(*) into made from review_updates where user_id = me and created_at > now() - win;
    when 'products' then cap := 15; win := interval '1 day'; what := 'product suggestions';
      select count(*) into made from products where suggested_by = me and created_at > now() - win;
  end case;
  if made >= cap then
    raise exception 'Whoa, that''s a lot of % in a short time! Please take a little break and try again later.', what;
  end if;
  return new;
end $$;


-- ---------- Adding a shade or scent ----------
-- Members: a suggestion for a moderator to check (20 a day at most).
-- Moderators: added to the product straight away.
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

  if is_moderator() then
    update products set variations = coalesce(variations, '{}') || v where id = pr.id;
    return 'Added "' || v || '".';
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


-- ---------- Edits to listed products go in the moderation log ----------
create or replace function public.reward_product_moderation() returns trigger
language plpgsql security definer set search_path to public as $$
declare label text := new.brand || ' — ' || new.name;
begin
  if not is_moderator() then return new; end if;
  -- a listed product, edited: logged (no points)
  if old.status = 'approved' and new.status = 'approved' then
    if new.name is distinct from old.name or new.brand is distinct from old.brand
       or new.photo_url is distinct from old.photo_url or new.variations is distinct from old.variations
       or new.category is distinct from old.category or new.subcategory is distinct from old.subcategory then
      perform log_moderation('edit', 'product', new.id, new.suggested_by, null,
        case when new.name is distinct from old.name or new.brand is distinct from old.brand
             then old.brand || ' — ' || old.name || ' → ' || label else label end);
    end if;
    return new;
  end if;
  if old.status <> 'pending' then return new; end if;
  if new.status = 'approved' then
    perform log_moderation('approve', 'product', new.id, new.suggested_by, 'positive', label);
    perform reward_moderator('mod_decision', 'product', new.id, new.suggested_by);
  elsif new.status = 'rejected' then
    perform log_moderation('reject', 'product', new.id, new.suggested_by, 'negative',
      label || case when coalesce(new.rejection_reason, '') <> '' then ' (' || new.rejection_reason || ')' else '' end);
    perform reward_moderator('mod_decision', 'product', new.id, new.suggested_by);
  elsif new.name is distinct from old.name or new.brand is distinct from old.brand
     or new.photo_url is distinct from old.photo_url or new.variations is distinct from old.variations
     or new.category is distinct from old.category or new.subcategory is distinct from old.subcategory then
    perform log_moderation('edit', 'product', new.id, new.suggested_by, null,
      case when new.name is distinct from old.name or new.brand is distinct from old.brand
           then old.brand || ' — ' || old.name || ' → ' || label else label end);
    perform reward_moderator('mod_edit', 'product', new.id, new.suggested_by);
  end if;
  return new;
end $$;

-- Check: who has no limits (the moderators)
select username from public.profiles where is_moderator order by username;
