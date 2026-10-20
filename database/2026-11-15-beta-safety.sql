-- =========================================================
-- Byome: safety checks before opening the beta to testers.
--  1. New posts, comments, reviews, review updates and product suggestions
--     always get the real time they were made (no backdating), and a new
--     review always starts at 0 "helpful" votes.
--  2. Members can't mark their own review as helpful.
--  3. Product suggestions have length limits (name, brand, variations,
--     photo link).
--  4. Speed limits, so one person can't flood the site:
--       posts 10 an hour, comments 40 an hour, reviews 15 an hour,
--       review updates 20 an hour, product suggestions 15 a day.
--     Normal use never gets near these. You (and anything run from the SQL
--     Editor) aren't limited.
--  5. A last check: lists any old "anyone can read everything" rules still
--     on posts, comments, reviews or review updates. It should come back
--     EMPTY. If it lists anything, send me the result.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================


-- ---------- 1. Real times, and a fresh helpful count ----------
-- Only for rows sent straight from the website (logged-in members); the
-- site's own functions and the SQL Editor keep whatever they set.
create or replace function public.stamp_new_row() returns trigger
language plpgsql set search_path to public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.created_at := now();
    if tg_table_name in ('posts', 'comments', 'reviews') then new.edited_at := null; end if;
    if tg_table_name = 'reviews' then new.helpful_count := 0; end if;
    if tg_table_name = 'products' then new.rejection_reason := null; end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['posts', 'comments', 'reviews', 'review_updates', 'products'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_stamp_new', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.stamp_new_row()', t || '_stamp_new', t);
  end loop;
end $$;


-- ---------- 2. No marking your own review as helpful ----------
drop policy if exists "Members can like reviews as themselves" on public.review_likes;
create policy "Members can like reviews as themselves" on public.review_likes for insert to authenticated
  with check (auth.uid() = user_id
              and not exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid()));


-- ---------- 3. Length limits on product suggestions ----------
-- (not valid: only checks new and edited products, so nothing already
-- there can block this file)
alter table public.products drop constraint if exists products_name_length;
alter table public.products add constraint products_name_length check (char_length(name) between 1 and 150) not valid;
alter table public.products drop constraint if exists products_brand_length;
alter table public.products add constraint products_brand_length check (char_length(brand) between 1 and 80) not valid;
alter table public.products drop constraint if exists products_variations_size;
alter table public.products add constraint products_variations_size
  check (variations is null or (cardinality(variations) <= 30 and char_length(array_to_string(variations, '|')) <= 1500)) not valid;
alter table public.products drop constraint if exists products_photo_url_length;
alter table public.products add constraint products_photo_url_length check (photo_url is null or char_length(photo_url) <= 500) not valid;


-- ---------- 4. Speed limits ----------
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
revoke execute on function public.rate_limit_new_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['posts', 'comments', 'reviews', 'review_updates', 'products'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_rate_limit', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.rate_limit_new_row()', t || '_rate_limit', t);
  end loop;
end $$;


-- ---------- 5. Check: old read-everything rules (should be EMPTY) ----------
select tablename, policyname, qual as who_can_read
from pg_policies
where schemaname = 'public'
  and tablename in ('posts', 'comments', 'reviews', 'review_updates')
  and cmd = 'SELECT' and qual = 'true';
