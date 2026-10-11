-- =========================================================
-- Byome: polls on Community posts.
-- A poll is a post (question as the heading, optional details as the
-- text) with 2-6 options. Members see the results once they've voted
-- (or the poll has closed); the poll's author and moderators always can.
-- Votes are anonymous: everyone sees totals, nobody sees who voted for
-- what. Members can change their vote until the poll closes.
-- A poll can be edited (question, details, options) only until somebody
-- votes, so nobody can change the question under other people's votes.
-- Voting in someone else's poll earns 1 Byome point, up to 5 a day, and
-- only the first vote on each poll counts (changing it earns nothing).
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole
-- file with nothing highlighted.
-- =========================================================


-- ---------- Tables ----------
create table if not exists public.polls (
  post_id uuid primary key references public.posts(id) on delete cascade,
  closes_at timestamptz,            -- null: never closes
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.polls(post_id) on delete cascade,
  position smallint not null,
  label text not null check (char_length(label) between 1 and 80),
  unique (post_id, position)
);

create table if not exists public.poll_votes (
  post_id uuid not null references public.polls(post_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists poll_votes_option_idx on public.poll_votes (option_id);

-- A poll's details are optional, so a post's text may now be empty
-- (the post form still asks for text on ordinary posts)
alter table public.posts drop constraint if exists posts_body_check;
alter table public.posts add constraint posts_body_check check (char_length(body) <= 1000);


-- ---------- Who can see what ----------
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- A poll and its options are visible to whoever can see the post
drop policy if exists "Polls are visible with their post" on public.polls;
create policy "Polls are visible with their post" on public.polls for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "Poll options are visible with their post" on public.poll_options;
create policy "Poll options are visible with their post" on public.poll_options for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

-- Votes are anonymous: members can only see their own
drop policy if exists "Members see their own votes" on public.poll_votes;
create policy "Members see their own votes" on public.poll_votes for select to authenticated
  using (user_id = (select auth.uid()));

-- Everything is written through the functions below, which check the rules
revoke insert, update, delete on public.polls, public.poll_options, public.poll_votes from anon, authenticated;


-- ---------- Points for voting ----------
-- Some rewards are too small to be worth a notification each time
alter table public.point_rules add column if not exists notify boolean not null default true;

insert into public.point_rules (action, label, community_points, biome_points, delay_hours, daily_cap, description, notify) values
  ('poll_vote', 'Voting in a poll', 0, 1, 0, 5,
   'Voting in another member''s poll (up to 5 a day; changing your vote doesn''t count again).', false)
on conflict (action) do nothing;

-- Same as in 2026-10-10-moderator-rewards.sql, plus: rewards with
-- notify = false don't send a notification
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

  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id, available_at)
  values (p_user, p_action, rule.community_points, rule.biome_points, p_ref_type, p_ref,
          now() + make_interval(hours => rule.delay_hours))
  on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
  returning id into new_id;

  if new_id is null then return false; end if;
  if p_action like 'mod\_%' or not rule.notify then return true; end if;  -- quiet rewards

  if rule.community_points <> 0 then parts := parts || (rule.community_points || ' community points'); end if;
  if rule.biome_points <> 0 then parts := parts || (rule.biome_points || ' Byome points'); end if;
  msg := 'You earned ' || array_to_string(parts, ' and ') || ': ' || rule.label || '.';
  if rule.delay_hours > 0 then
    msg := msg || ' They''ll be available in ' || rule.delay_hours || ' hours.';
  end if;
  perform create_notification(p_user, null, 'points', new_id, msg, 'profile.html');
  return true;
end $$;


-- ---------- Checking a poll's options ----------
-- Trims them, drops empty ones, and checks there are 2-6 different ones
create or replace function public.clean_poll_options(p_options text[]) returns text[]
language plpgsql immutable as $$
declare
  cleaned text[];
begin
  select coalesce(array_agg(o order by n), '{}') into cleaned
  from (select btrim(o) as o, n from unnest(p_options) with ordinality as t(o, n)) x
  where o <> '';
  if cardinality(cleaned) < 2 then raise exception 'A poll needs at least 2 options'; end if;
  if cardinality(cleaned) > 6 then raise exception 'A poll can have up to 6 options'; end if;
  if exists (select 1 from unnest(cleaned) o where char_length(o) > 80) then
    raise exception 'Please keep each option to 80 characters';
  end if;
  if (select count(distinct lower(o)) from unnest(cleaned) o) < cardinality(cleaned) then
    raise exception 'Each option needs to be different';
  end if;
  return cleaned;
end $$;

-- Hold a post for a moderator if its poll options trip automod
create or replace function public.hold_poll_if_flagged(p_post uuid, p_options text[]) returns void
language plpgsql security definer set search_path to public as $$
begin
  if text_is_flagged(array_to_string(p_options, ' '))
     and exists (select 1 from posts where id = p_post and held_at is null) then
    perform set_config('byome.moderating', 'on', true);
    update posts set held_at = now() where id = p_post;
    perform set_config('byome.moderating', 'off', true);
  end if;
end $$;
revoke execute on function public.hold_poll_if_flagged(uuid, text[]) from public, anon, authenticated;


-- ---------- Posting a poll ----------
-- p_days: 1, 3 or 7, or null for a poll that never closes
create or replace function public.create_poll_post(p_title text, p_body text, p_category text,
                                                   p_options text[], p_days integer default null)
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

  insert into posts (user_id, title, body, category)
  values (me, p_title, btrim(coalesce(p_body, '')), p_category)
  returning id into new_id;

  insert into polls (post_id, closes_at)
  values (new_id, case when p_days is not null then now() + make_interval(days => p_days) end);
  insert into poll_options (post_id, position, label)
  select new_id, n, o from unnest(opts) with ordinality as t(o, n);

  perform hold_poll_if_flagged(new_id, opts);
  select held_at into held from posts where id = new_id;
  return jsonb_build_object('id', new_id, 'held', held is not null);
end $$;
revoke execute on function public.create_poll_post(text, text, text, text[], integer) from public, anon;
grant execute on function public.create_poll_post(text, text, text, text[], integer) to authenticated;


-- ---------- Editing a poll (only until somebody votes) ----------
create or replace function public.edit_poll_post(p_post uuid, p_title text, p_body text, p_options text[])
returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  opts text[];
  held timestamptz;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if not exists (select 1 from posts where id = p_post and user_id = me) then
    raise exception 'You can only edit your own posts';
  end if;
  if exists (select 1 from poll_votes where post_id = p_post) then
    raise exception 'This poll can''t be edited now that people have voted';
  end if;
  p_title := btrim(coalesce(p_title, ''));
  if p_title = '' then raise exception 'Please write your question'; end if;
  opts := clean_poll_options(p_options);

  -- The question and details (automod checks them as usual)
  update posts set title = p_title, body = btrim(coalesce(p_body, '')), edited_at = now() where id = p_post;
  -- The options, replaced in full
  delete from poll_options where post_id = p_post;
  insert into poll_options (post_id, position, label)
  select p_post, n, o from unnest(opts) with ordinality as t(o, n);

  perform hold_poll_if_flagged(p_post, opts);
  select held_at into held from posts where id = p_post;
  return jsonb_build_object('held', held is not null);
end $$;
revoke execute on function public.edit_poll_post(uuid, text, text, text[]) from public, anon;
grant execute on function public.edit_poll_post(uuid, text, text, text[]) to authenticated;

-- Once somebody has voted, the poll's post can't be edited directly
-- either (moderators approving or removing it are fine)
create or replace function public.lock_voted_poll() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if coalesce(current_setting('byome.moderating', true), '') = 'on' then return new; end if;
  if (new.title is distinct from old.title or new.body is distinct from old.body)
     and exists (select 1 from poll_votes where post_id = old.id) then
    raise exception 'This poll can''t be edited now that people have voted';
  end if;
  return new;
end $$;
drop trigger if exists posts_lock_voted_poll on public.posts;
create trigger posts_lock_voted_poll before update on public.posts
  for each row execute function public.lock_voted_poll();


-- ---------- Results ----------
-- For each poll asked about: when it closes, whether it has closed, your
-- vote, the number of votes, and (once you may see them) the counts for
-- each option. Only for posts you can see.
create or replace function public.poll_results(p_posts uuid[])
returns table (post_id uuid, closes_at timestamptz, closed boolean, my_option uuid, total integer, counts jsonb)
language sql stable security definer set search_path to public as $$
  select pl.post_id,
         pl.closes_at,
         coalesce(pl.closes_at <= now(), false),
         mine.option_id,
         (select count(*)::int from poll_votes v where v.post_id = pl.post_id),
         case when mine.option_id is not null or pl.closes_at <= now()
                   or p.user_id = auth.uid() or is_moderator()
              then (select coalesce(jsonb_object_agg(o.id, (select count(*) from poll_votes v where v.option_id = o.id)), '{}'::jsonb)
                    from poll_options o where o.post_id = pl.post_id)
         end
  from polls pl
  join posts p on p.id = pl.post_id
  left join poll_votes mine on mine.post_id = pl.post_id and mine.user_id = auth.uid()
  where pl.post_id = any(p_posts)
    and (p.held_at is null or p.user_id = auth.uid() or is_moderator());
$$;
revoke execute on function public.poll_results(uuid[]) from public, anon;
grant execute on function public.poll_results(uuid[]) to authenticated;


-- ---------- Voting ----------
-- Votes, or changes your vote, until the poll closes. The first vote on
-- someone else's poll earns a Byome point (up to 5 a day); changing it
-- earns nothing more. Returns the poll's results.
create or replace function public.vote_poll(p_post uuid, p_option uuid)
returns table (post_id uuid, closes_at timestamptz, closed boolean, my_option uuid, total integer, counts jsonb)
language plpgsql security definer set search_path to public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  author uuid;
  held timestamptz;
  ends timestamptz;
  first_vote boolean;
begin
  if me is null then raise exception 'Please log in first'; end if;
  select p.user_id, p.held_at, pl.closes_at into author, held, ends
  from posts p join polls pl on pl.post_id = p.id where p.id = p_post;
  if not found then raise exception 'That poll no longer exists'; end if;
  if held is not null then raise exception 'This poll is waiting for a moderator'; end if;
  if ends is not null and ends <= now() then raise exception 'This poll has closed'; end if;
  if not exists (select 1 from poll_options o where o.id = p_option and o.post_id = p_post) then
    raise exception 'That isn''t one of this poll''s options';
  end if;

  insert into poll_votes as v (post_id, user_id, option_id)
  values (p_post, me, p_option)
  on conflict on constraint poll_votes_pkey do update set option_id = excluded.option_id, voted_at = now()
  returning (xmax = 0) into first_vote;

  if first_vote and author <> me then
    perform award_points(me, 'poll_vote', 'poll', p_post);
  end if;

  return query select * from poll_results(array[p_post]);
end $$;
revoke execute on function public.vote_poll(uuid, uuid) from public, anon;
grant execute on function public.vote_poll(uuid, uuid) to authenticated;
