-- =========================================================
-- byome automoderation
-- Run this once in the Supabase SQL Editor.
--
-- What it does:
--   * Posts, comments, reviews and review updates are checked against a
--     word list when they're written or edited. Anything that matches is
--     HELD: only its author and moderators can see it, until a moderator
--     approves or removes it from the Moderate page.
--   * New usernames are checked against the same list (plus basic rules:
--     3-20 letters, numbers, _ . or -). A username can't be "held", so a
--     flagged one is refused at signup instead.
--
-- Managing the word list later (SQL Editor):
--   insert into moderation_words (word) values ('newword');
--   insert into moderation_words (word, match_inside_words) values ('newword', true);
--   delete from moderation_words where word = 'hell';
-- "match_inside_words" also catches the word inside longer words
-- (e.g. "fuck" in "motherfucker"). Leave it off for short words, or
-- innocent words get caught (e.g. "ass" in "class").
-- Matching ignores capitals, repeated letters ("shiiit"), common
-- number/symbol swaps ("sh1t", "@ss") and dots/dashes/stars between
-- letters ("s.h.i.t").
-- =========================================================


-- ---------- Helpers ----------

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path to public as $$
  select coalesce((select is_moderator from profiles where id = auth.uid()), false)
$$;
grant execute on function public.is_moderator() to anon, authenticated;


-- ---------- The word list ----------

create table public.moderation_words (
  word text primary key check (word ~ '^[a-z]+( [a-z]+)*$'),
  match_inside_words boolean not null default false,
  added_at timestamptz not null default now()
);
alter table public.moderation_words enable row level security;
create policy "Moderators can read the word list" on public.moderation_words
  for select to authenticated using ((select public.is_moderator()));
create policy "Moderators can add words" on public.moderation_words
  for insert to authenticated with check ((select public.is_moderator()));
create policy "Moderators can remove words" on public.moderation_words
  for delete to authenticated using ((select public.is_moderator()));

-- Caught even inside longer words
insert into public.moderation_words (word, match_inside_words) values
  ('fuck', true), ('bitch', true), ('asshole', true), ('bullshit', true),
  ('dumbass', true), ('jackass', true), ('goddamn', true), ('faggot', true),
  ('wetback', true), ('raghead', true), ('towelhead', true), ('whore', true);

-- Whole words only
insert into public.moderation_words (word) values
  -- mild
  ('damn'), ('damned'), ('dammit'), ('damnit'), ('hell'), ('crap'), ('crappy'),
  ('piss'), ('pissed'), ('pissing'), ('ass'), ('arse'), ('wtf'), ('stfu'),
  -- profanity
  ('shit'), ('shits'), ('shitty'), ('shitting'), ('shithead'), ('shite'),
  ('cunt'), ('cunts'), ('dick'), ('dicks'), ('dickhead'), ('cock'), ('cocks'),
  ('prick'), ('pricks'), ('pussy'), ('pussies'), ('tit'), ('tits'), ('titties'),
  ('twat'), ('twats'), ('wanker'), ('wankers'), ('bollocks'), ('bastard'), ('bastards'),
  ('slut'), ('sluts'), ('slutty'), ('cum'), ('jizz'), ('porn'),
  -- slurs
  ('nigger'), ('niggers'), ('nigga'), ('niggas'), ('niggaz'), ('fag'), ('fags'),
  ('dyke'), ('dykes'), ('tranny'), ('trannies'), ('shemale'), ('retard'), ('retarded'),
  ('retards'), ('spic'), ('spics'), ('kike'), ('kikes'), ('chink'), ('chinks'),
  ('gook'), ('gooks'), ('coon'), ('coons'), ('beaner'), ('beaners'), ('paki'), ('pakis'),
  -- threats and harassment
  ('kys'), ('kill yourself'), ('kill urself'), ('rape'), ('raped'), ('rapist');


-- ---------- The check ----------

create or replace function public.text_is_flagged(p_text text) returns boolean
language plpgsql stable security definer set search_path to public as $$
declare
  t text;
  w record;
  pattern text;
begin
  if p_text is null or p_text = '' then return false; end if;
  -- lowercase, and undo common swaps: 0->o 1->i 3->e 4->a 5->s 7->t @->a $->s
  t := translate(lower(p_text), '013457@$', 'oieastas');

  for w in select word, match_inside_words from moderation_words loop
    -- "shit" becomes s+h+i+t+ (repeats allowed). Whole words also allow
    -- dots, dashes, underscores and stars between letters.
    select string_agg(case when c = ' ' then '\s+' else c || '+' end,
                      case when w.match_inside_words then '' else '[._*-]*' end
                      order by n)
      into pattern
      from regexp_split_to_table(w.word, '') with ordinality as x(c, n);

    if not w.match_inside_words then
      pattern := '\m' || pattern || '\M';
    end if;
    if t ~ pattern then return true; end if;
  end loop;
  return false;
end $$;
revoke execute on function public.text_is_flagged(text) from public, anon, authenticated;


-- ---------- Holding flagged content ----------

alter table public.posts add column held_at timestamptz;
alter table public.comments add column held_at timestamptz;
alter table public.reviews add column held_at timestamptz;
alter table public.review_updates add column held_at timestamptz;

-- Runs before every new or edited post/comment/review/update.
-- Members can never clear held_at themselves; only moderate_content() can.
create or replace function public.hold_flagged_content() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  content text := coalesce(to_jsonb(new)->>'title', '') || ' ' || coalesce(to_jsonb(new)->>'body', '');
begin
  if tg_op = 'INSERT' then
    new.held_at := case when text_is_flagged(content) then now() end;
  elsif coalesce(current_setting('byome.moderating', true), '') = 'on' then
    null;  -- a moderator is approving it: keep their change
  else
    new.held_at := old.held_at;  -- once held, stays held until a moderator decides
    if new.held_at is null and text_is_flagged(content) then
      new.held_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger posts_automod before insert or update on public.posts
  for each row execute function public.hold_flagged_content();
create trigger comments_automod before insert or update on public.comments
  for each row execute function public.hold_flagged_content();
create trigger reviews_automod before insert or update on public.reviews
  for each row execute function public.hold_flagged_content();
create trigger review_updates_automod before insert or update on public.review_updates
  for each row execute function public.hold_flagged_content();


-- ---------- Who can see held content: only its author and moderators ----------

drop policy "Members can read posts" on public.posts;
create policy "Members can read posts" on public.posts for select to authenticated
  using (held_at is null or user_id = (select auth.uid()) or (select public.is_moderator()));

drop policy "Members can read comments" on public.comments;
create policy "Members can read comments" on public.comments for select to authenticated
  using (held_at is null or user_id = (select auth.uid()) or (select public.is_moderator()));

drop policy "Members can read reviews" on public.reviews;
drop policy "Reviews are publicly readable" on public.reviews;
create policy "Reviews are publicly readable" on public.reviews for select to public
  using (held_at is null or user_id = (select auth.uid()) or (select public.is_moderator()));

drop policy "Members can read review updates" on public.review_updates;
drop policy "Review updates are publicly readable" on public.review_updates;
create policy "Review updates are publicly readable" on public.review_updates for select to public
  using (held_at is null or user_id = (select auth.uid()) or (select public.is_moderator()));


-- ---------- Don't send "X commented on your post" for a held comment ----------
-- (Same as before, plus the first line of the body.)

create or replace function public.on_comment() returns trigger
language plpgsql security definer set search_path to public as $$
declare post_author uuid; parent_author uuid; t text;
begin
  if new.held_at is not null then return new; end if;
  select user_id, title into post_author, t from posts where id = new.post_id;
  if new.parent_id is not null then
    select user_id into parent_author from comments where id = new.parent_id;
    perform create_notification(parent_author, new.user_id, 'reply', new.id,
      username_of(new.user_id) || ' replied to your comment', 'feed.html');
  end if;
  if post_author is distinct from parent_author then   -- avoid two notices for one reply
    perform create_notification(post_author, new.user_id, 'comment', new.id,
      username_of(new.user_id) || ' commented on your post' || coalesce(' "' || t || '"', ''), 'feed.html');
  end if;
  perform check_post_engagement(new.post_id);
  return new;
end $$;


-- ---------- Moderators: approve or remove held content ----------

create or replace function public.moderate_content(p_kind text, p_id uuid, p_action text) returns text
language plpgsql security definer set search_path to public as $$
declare
  tbl text;
  author uuid;
  what text := replace(p_kind, '_', ' ');
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;

  tbl := case p_kind when 'post' then 'posts' when 'comment' then 'comments'
                     when 'review' then 'reviews' when 'review_update' then 'review_updates' end;
  if tbl is null then raise exception 'Unknown kind: %', p_kind; end if;

  execute format('select user_id from %I where id = $1', tbl) into author using p_id;
  if author is null then return 'gone'; end if;  -- already deleted

  if p_action = 'approve' then
    perform set_config('byome.moderating', 'on', true);
    execute format('update %I set held_at = null where id = $1', tbl) using p_id;
    perform set_config('byome.moderating', 'off', true);
    perform create_notification(author, null, 'moderation', p_id,
      'A moderator approved your ' || what || '. Everyone can see it now.',
      case when p_kind in ('post', 'comment') then 'feed.html' else 'reviews.html' end);
    return 'approved';
  elsif p_action = 'remove' then
    execute format('delete from %I where id = $1', tbl) using p_id;
    perform create_notification(author, null, 'moderation', p_id,
      'A moderator removed your ' || what || ' because it didn''t follow the community guidelines.', null);
    return 'removed';
  end if;
  raise exception 'Unknown action: %', p_action;
end $$;
revoke execute on function public.moderate_content(text, uuid, text) from public, anon;
grant execute on function public.moderate_content(text, uuid, text) to authenticated;


-- ---------- Usernames ----------

-- 'ok', or why not: 'invalid' (format), 'taken', 'not_allowed' (word list).
-- The signup page asks this before creating the account.
create or replace function public.check_username(p_username text) returns text
language plpgsql stable security definer set search_path to public as $$
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_.-]{3,20}$' then return 'invalid'; end if;
  if exists (select 1 from profiles where lower(username) = lower(p_username)) then return 'taken'; end if;
  if text_is_flagged(regexp_replace(p_username, '[_.-]+', ' ', 'g')) then return 'not_allowed'; end if;
  return 'ok';
end $$;
grant execute on function public.check_username(text) to anon, authenticated;

-- The signup trigger, now refusing usernames that fail the check
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  uname text := new.raw_user_meta_data->>'username';
  problem text := check_username(uname);
begin
  if problem <> 'ok' then
    raise exception 'Username not allowed (%)', problem;
  end if;
  insert into public.profiles (id, username) values (new.id, uname);
  return new;
end $$;
