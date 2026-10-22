-- =========================================================
-- Byome: a minimum length for Community posts and reviews, so there's
-- always something useful to read.
--  - Posts: at least 10 characters of text (not counting spaces at the
--    ends). Poll posts are exempt: their details are optional.
--  - Reviews: at least 20 characters.
-- Only new posts and reviews, and edits to their text, are checked;
-- existing shorter ones stay as they are.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Run it before publishing the site update that
-- came with it.
-- =========================================================

create or replace function public.posts_minimum_length() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  -- polls (made through create_poll_post, or an existing poll being edited)
  if coalesce(current_setting('byome.poll_post', true), '') = 'on'
     or exists (select 1 from polls where post_id = new.id) then
    return new;
  end if;
  if char_length(btrim(coalesce(new.body, ''))) < 10 then
    raise exception 'Posts need at least 10 characters, so everyone has something to go on.';
  end if;
  return new;
end $$;
drop trigger if exists posts_minimum_length on public.posts;
create trigger posts_minimum_length before insert or update of body on public.posts
for each row execute function public.posts_minimum_length();

create or replace function public.reviews_minimum_length() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  if char_length(btrim(coalesce(new.body, ''))) < 20 then
    raise exception 'Reviews need at least 20 characters. A sentence or two about how it worked for you is perfect!';
  end if;
  return new;
end $$;
drop trigger if exists reviews_minimum_length on public.reviews;
create trigger reviews_minimum_length before insert or update of body on public.reviews
for each row execute function public.reviews_minimum_length();

-- Making a poll post: same as before (database/2026-10-13-polls.sql), but
-- marked as a poll so its optional details aren't held to the minimum
create or replace function public.create_poll_post(p_title text, p_body text, p_category text, p_options text[], p_days integer default null)
returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  opts text[];
  new_id uuid;
  held timestamptz;
begin
  if me is null then raise exception 'Please log in first'; end if;
  p_title := btrim(coalesce(p_title, ''));
  if p_title = '' then raise exception 'Please write your question'; end if;
  if nullif(btrim(coalesce(p_category, '')), '') is null then raise exception 'Please choose a category'; end if;
  if p_days is not null and p_days not in (1, 3, 7) then raise exception 'Polls can run for 1, 3 or 7 days, or stay open'; end if;
  opts := clean_poll_options(p_options);

  perform set_config('byome.poll_post', 'on', true);
  insert into posts (user_id, title, body, category)
  values (me, p_title, btrim(coalesce(p_body, '')), p_category)
  returning id into new_id;
  perform set_config('byome.poll_post', 'off', true);

  insert into polls (post_id, closes_at)
  values (new_id, case when p_days is not null then now() + make_interval(days => p_days) end);
  insert into poll_options (post_id, position, label)
  select new_id, n, o from unnest(opts) with ordinality as t(o, n);

  perform hold_poll_if_flagged(new_id, opts);
  select held_at into held from posts where id = new_id;
  return jsonb_build_object('id', new_id, 'held', held is not null);
end $$;
