-- =========================================================
-- Byome: member levels (the plan is in docs/plans/levels.md).
--   1 Seed       join Byome
--   2 Sprout     account at least 3 days old, and 1 published review
--   3 Sapling    25 contributions: published reviews, Community posts or
--                polls someone else engaged with (a like, comment or vote
--                from a Sprout or higher who isn't blocked either way),
--                and approved product suggestions
--   4 Bloom      100 published reviews, then approved by a moderator
--                ("Ready to Bloom" on the Moderate page)
--   5 Evergreen  Bloom, plus 5 standout reviews, 50 different people who
--                found their reviews helpful, and 6 months as a member
-- Levels never go down on their own; a moderator can demote someone, and
-- their next level-up then waits for a moderator ("Level-up needs
-- approval"). Active restrictions (coming next) pause levelling up.
--
-- Level-up gifts: when one is drawn and added to the shop items, release it
-- to everyone at that level or higher (and to everyone who reaches it
-- later) with:
--   select public.release_level_gift(2, 'item-key');
--
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Run it before publishing the site update that
-- came with it. (It works out everyone's level when it runs, so it can
-- take a few seconds.)
-- =========================================================

-- ---------- Levels and their gifts ----------
create table if not exists public.levels (
  level smallint primary key check (level between 1 and 5),
  key text not null unique,
  name text not null,
  reward_item text references public.biome_items(key)
);
insert into public.levels (level, key, name) values
  (1, 'seed', 'Seed'), (2, 'sprout', 'Sprout'), (3, 'sapling', 'Sapling'),
  (4, 'bloom', 'Bloom'), (5, 'evergreen', 'Evergreen')
on conflict (level) do nothing;
alter table public.levels enable row level security;
drop policy if exists "Anyone can see the levels" on public.levels;
create policy "Anyone can see the levels" on public.levels for select using (true);

-- Each member's level. Members can't change these (profiles have no update
-- policy for members; only the functions below change them).
alter table public.profiles add column if not exists level smallint not null default 1;
alter table public.profiles add column if not exists level_at timestamptz;
alter table public.profiles add column if not exists level_seen smallint not null default 1;  -- the level-up pop-up shown up to
alter table public.profiles add column if not exists level_needs_approval boolean not null default false;
alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.profiles add constraint profiles_level_check check (level between 1 and 5);

-- Gifts already given (so a gift is never given twice)
create table if not exists public.level_gifts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  level smallint not null,
  item_key text not null,
  given_at timestamptz not null default now(),
  primary key (user_id, level)
);
alter table public.level_gifts enable row level security;

-- Waiting for a moderator: the Bloom check, or a level-up after a demotion
-- or a restriction
create table if not exists public.level_requests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('bloom', 'level_up')),
  target_level smallint not null,
  status text not null default 'waiting' check (status in ('waiting', 'not_yet')),
  note text check (char_length(note) <= 500),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.level_requests enable row level security;

insert into public.point_rules (action, label, community_points, biome_points, notify, description)
values ('mod_level', 'Level decisions (moderator)', 0, 5, false, 'For each Bloom or level-up decision.')
on conflict (action) do nothing;


-- ---------- Counting ----------
-- Restrictions arrive in the next update; until then nobody has one
create or replace function public.has_active_restriction(p_user uuid) returns boolean
language sql stable security definer set search_path to public as $$ select false $$;

-- Everything levels look at, for one member
create or replace function public.level_stats(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  joined timestamptz;
  reviews_n int;
  posts_n int;
  products_n int;
  standouts_n int;
  helpful_n int;
  marks_n int;
begin
  select created_at into joined from profiles where id = p_user;
  select count(*) into reviews_n from reviews where user_id = p_user and held_at is null;
  -- Posts and polls someone else (a Sprout or higher, not blocked either
  -- way) liked, commented on or voted in
  select count(*) into posts_n from posts p
  where p.user_id = p_user and p.held_at is null and (
    exists (select 1 from likes l join profiles e on e.id = l.user_id
            where l.post_id = p.id and l.user_id <> p_user and e.level >= 2 and not blocked_between(p_user, e.id))
    or exists (select 1 from comments c join profiles e on e.id = c.user_id
               where c.post_id = p.id and c.held_at is null and c.user_id <> p_user and e.level >= 2
                 and not blocked_between(p_user, e.id))
    or exists (select 1 from poll_votes v join profiles e on e.id = v.user_id
               where v.post_id = p.id and v.user_id <> p_user and e.level >= 2 and not blocked_between(p_user, e.id)));
  select count(*) into products_n from products where suggested_by = p_user and status = 'approved';
  select count(*) into standouts_n from review_standouts s join reviews r on r.id = s.review_id
  where r.user_id = p_user and r.held_at is null;
  select count(distinct l.user_id), count(*) into helpful_n, marks_n from review_likes l join reviews r on r.id = l.review_id
  where r.user_id = p_user and r.held_at is null and l.user_id <> p_user;

  return jsonb_build_object(
    'joined', joined,
    'days', floor(extract(epoch from now() - coalesce(joined, now())) / 86400),
    'reviews', reviews_n,
    'posts', posts_n,
    'products', products_n,
    'contributions', reviews_n + posts_n + products_n,
    'standouts', standouts_n,
    'helpful', helpful_n,
    'helpful_marks', marks_n,
    'six_months', coalesce(joined, now()) <= now() - interval '6 months');
end $$;
revoke execute on function public.level_stats(uuid) from public, anon, authenticated;

-- The highest level someone has earned on their own (Bloom always needs a
-- moderator, so this stops at Sapling until then)
create or replace function public.level_earned(p_user uuid, p_current smallint, s jsonb) returns smallint
language sql immutable as $$
  select case
    when p_current >= 4 then
      case when (s->>'standouts')::int >= 5 and (s->>'helpful')::int >= 50 and (s->>'six_months')::boolean
           then 5::smallint else p_current end
    when (s->>'days')::int >= 3 and (s->>'reviews')::int >= 1 and (s->>'contributions')::int >= 25 then 3::smallint
    when (s->>'days')::int >= 3 and (s->>'reviews')::int >= 1 then 2::smallint
    else 1::smallint end
$$;

-- Move someone to a level (gifts, notification, history)
create or replace function public.set_member_level(p_user uuid, p_level smallint) returns void
language plpgsql security definer set search_path to public as $$
declare
  old smallint;
  l record;
begin
  select level into old from profiles where id = p_user;
  update profiles set level = p_level, level_at = now() where id = p_user;
  if p_level > old then
    -- gifts for every level passed (once each)
    for l in select * from levels where level > old and level <= p_level and reward_item is not null loop
      insert into level_gifts (user_id, level, item_key) values (p_user, l.level, l.reward_item) on conflict do nothing;
      if found then
        insert into biome_inventory (user_id, item_key, source) values (p_user, l.reward_item, 'gift');
      end if;
    end loop;
    perform create_notification(p_user, null, 'level', null,
      'You''ve reached ' || (select name from levels where level = p_level) || ' (level ' || p_level || ')! Thank you for helping Byome grow.',
      'profile.html', false, 'positive');
  end if;
end $$;
revoke execute on function public.set_member_level(uuid, smallint) from public, anon, authenticated;

-- Work out someone's level again. Levels only go up here; a level-up waits
-- for a moderator after a demotion, and doesn't happen while restricted.
create or replace function public.refresh_level(p_user uuid) returns smallint
language plpgsql security definer set search_path to public as $$
declare
  pr profiles%rowtype;
  s jsonb;
  target smallint;
begin
  select * into pr from profiles where id = p_user;
  if not found or pr.deleted_at is not null then return null; end if;
  s := level_stats(p_user);
  target := level_earned(p_user, pr.level, s);

  -- Ready to Bloom: 100 published reviews puts a Sapling on the moderators' list
  if pr.level = 3 and (s->>'reviews')::int >= 100 and not has_active_restriction(p_user) then
    insert into level_requests (user_id, kind, target_level) values (p_user, 'bloom', 4) on conflict do nothing;
  end if;

  if target <= pr.level or has_active_restriction(p_user) then return pr.level; end if;
  if pr.level_needs_approval then
    insert into level_requests (user_id, kind, target_level) values (p_user, 'level_up', target)
    on conflict (user_id, kind) do update set target_level = excluded.target_level;
    return pr.level;
  end if;
  perform set_member_level(p_user, target);
  return target;
end $$;
revoke execute on function public.refresh_level(uuid) from public, anon, authenticated;


-- ---------- Keeping levels up to date ----------
-- Anything that could earn someone a level checks theirs again
create or replace function public.level_after_change() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  r jsonb := to_jsonb(new);  -- (each table has different columns, so read them by name)
  who uuid;
begin
  if tg_table_name = 'reviews' then who := (r->>'user_id')::uuid;
  elsif tg_table_name = 'products' then who := (r->>'suggested_by')::uuid;
  elsif tg_table_name in ('likes', 'comments', 'poll_votes') then
    select user_id into who from posts where id = (r->>'post_id')::uuid;
  elsif tg_table_name in ('review_standouts', 'review_likes') then
    select user_id into who from reviews where id = (r->>'review_id')::uuid;
  end if;
  if who is not null then perform refresh_level(who); end if;
  return null;
end $$;

drop trigger if exists level_after_review on public.reviews;
create trigger level_after_review after insert or update of held_at on public.reviews
  for each row execute function public.level_after_change();
drop trigger if exists level_after_product on public.products;
create trigger level_after_product after update of status on public.products
  for each row execute function public.level_after_change();
drop trigger if exists level_after_like on public.likes;
create trigger level_after_like after insert on public.likes
  for each row execute function public.level_after_change();
drop trigger if exists level_after_comment on public.comments;
create trigger level_after_comment after insert or update of held_at on public.comments
  for each row execute function public.level_after_change();
drop trigger if exists level_after_vote on public.poll_votes;
create trigger level_after_vote after insert on public.poll_votes
  for each row execute function public.level_after_change();
drop trigger if exists level_after_standout on public.review_standouts;
create trigger level_after_standout after insert on public.review_standouts
  for each row execute function public.level_after_change();
drop trigger if exists level_after_helpful on public.review_likes;
create trigger level_after_helpful after insert on public.review_likes
  for each row execute function public.level_after_change();


-- ---------- For members ----------
-- Your level, your progress towards the next one, and whether there's a
-- level-up pop-up to show. (Also checks your level, for the parts that
-- depend on time, like Sprout's 3 days.)
create or replace function public.my_level() returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  pr profiles%rowtype;
  s jsonb;
begin
  if me is null then return null; end if;
  perform refresh_level(me);
  select * into pr from profiles where id = me;
  if not found then return null; end if;
  s := level_stats(me);
  return jsonb_build_object(
    'level', pr.level,
    'seen', pr.level_seen,
    'stats', s,
    'bloom_waiting', exists (select 1 from level_requests where user_id = me and kind = 'bloom'),
    'approval_waiting', exists (select 1 from level_requests where user_id = me and kind = 'level_up'),
    'restricted', has_active_restriction(me),
    'gift', (select jsonb_build_object('name', i.name, 'key', i.key, 'image', i.image, 'kind', i.kind,
                                       'size', i.size, 'rarity', i.rarity, 'over_pot', i.over_pot)
             from levels l join biome_items i on i.key = l.reward_item where l.level = pr.level));
end $$;
revoke execute on function public.my_level() from public, anon;
grant execute on function public.my_level() to authenticated;

-- The level-up pop-up has been shown
create or replace function public.mark_level_seen() returns void
language sql security definer set search_path to public as $$
  update profiles set level_seen = level where id = auth.uid();
$$;
revoke execute on function public.mark_level_seen() from public, anon;
grant execute on function public.mark_level_seen() to authenticated;


-- ---------- For moderators ----------
-- Ready to Bloom, and level-ups waiting for approval, with each member's numbers
create or replace function public.level_queue() returns jsonb
language plpgsql stable security definer set search_path to public as $$
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', q.user_id, 'username', p.username, 'level', p.level, 'kind', q.kind,
      'target_level', q.target_level, 'status', q.status, 'note', q.note, 'since', q.created_at,
      'decided_at', q.decided_at, 'stats', level_stats(q.user_id))
      order by (q.status = 'waiting') desc, q.created_at)
    from level_requests q join profiles p on p.id = q.user_id
    where p.deleted_at is null), '[]'::jsonb);
end $$;
revoke execute on function public.level_queue() from public, anon;
grant execute on function public.level_queue() to authenticated;

-- Approve (p_approve) or "Not yet" with a note. For Bloom the note is
-- private to the team; for other level-ups the member is told it.
create or replace function public.decide_level(p_user uuid, p_kind text, p_approve boolean, p_note text default null)
returns text
language plpgsql security definer set search_path to public as $$
declare
  q level_requests%rowtype;
  pr profiles%rowtype;
  target smallint;
  label text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  if p_user = auth.uid() then raise exception 'Another moderator needs to look at your own level'; end if;
  select * into q from level_requests where user_id = p_user and kind = p_kind for update;
  if not found then raise exception 'That isn''t waiting any more'; end if;
  select * into pr from profiles where id = p_user;

  if p_approve then
    if has_active_restriction(p_user) then raise exception 'They have an active restriction, so they can''t level up yet'; end if;
    target := case when p_kind = 'bloom' then 4 else greatest(q.target_level, level_earned(p_user, pr.level, level_stats(p_user))) end;
    if p_kind = 'bloom' and pr.level <> 3 then raise exception 'They aren''t a Sapling any more'; end if;
    delete from level_requests where user_id = p_user and kind = p_kind;
    update profiles set level_needs_approval = false where id = p_user;
    perform set_member_level(p_user, target);
    label := (select name from levels where level = target);
    perform log_moderation('level_up', 'profile', p_user, p_user, 'positive', pr.username || ' → ' || label);
    perform refresh_level(p_user);  -- e.g. straight on to Evergreen
  else
    if coalesce(btrim(p_note), '') = '' then raise exception 'Please add a short note'; end if;
    update level_requests set status = 'not_yet', note = left(btrim(p_note), 500), decided_by = auth.uid(), decided_at = now()
    where user_id = p_user and kind = p_kind;
    if p_kind = 'level_up' then
      perform create_notification(p_user, null, 'level', null,
        'Your level-up has been put on hold for now. ' || left(btrim(p_note), 300), 'profile.html', false, 'negative');
    end if;
    perform log_moderation('level_not_yet', 'profile', p_user, p_user, null,
      pr.username || case when p_kind = 'bloom' then ' (Bloom)' else '' end || ': ' || left(btrim(p_note), 200));
  end if;
  perform reward_moderator('mod_level', 'profile', gen_random_uuid(), p_user);
  return case when p_approve then pr.username || ' is now ' || label || '.' else 'Saved. They''ll stay on the list.' end;
end $$;
revoke execute on function public.decide_level(uuid, text, boolean, text) from public, anon;
grant execute on function public.decide_level(uuid, text, boolean, text) to authenticated;

-- Move someone down a level or more. They're told kindly, and their next
-- level-up waits for a moderator.
create or replace function public.demote_member(p_user uuid, p_level smallint, p_reason text) returns text
language plpgsql security definer set search_path to public as $$
declare
  pr profiles%rowtype;
  label text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  if p_user = auth.uid() then raise exception 'Another moderator needs to change your own level'; end if;
  select * into pr from profiles where id = p_user;
  if not found then raise exception 'Member not found'; end if;
  if p_level < 1 or p_level >= pr.level then raise exception 'Choose a lower level than their current one'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Please give a reason (they''ll see it)'; end if;
  label := (select name from levels where level = p_level);
  update profiles set level = p_level, level_at = now(), level_seen = least(level_seen, p_level), level_needs_approval = true
  where id = p_user;
  delete from level_requests where user_id = p_user;
  perform create_notification(p_user, null, 'level', null,
    'A moderator has moved your level to ' || label || '. ' || left(btrim(p_reason), 300)
      || ' You can keep growing from here, and a moderator will look at your next level-up.',
    'profile.html', false, 'negative');
  perform log_moderation('demote', 'profile', p_user, p_user, 'negative', pr.username || ' → ' || label || ': ' || left(btrim(p_reason), 200));
  perform reward_moderator('mod_level', 'profile', gen_random_uuid(), p_user);
  return pr.username || ' is now ' || label || '.';
end $$;
revoke execute on function public.demote_member(uuid, smallint, text) from public, anon;
grant execute on function public.demote_member(uuid, smallint, text) to authenticated;

-- A level's gift is ready: everyone at that level or higher gets it now,
-- and everyone who reaches it later gets it too
create or replace function public.release_level_gift(p_level smallint, p_item text) returns integer
language plpgsql security definer set search_path to public as $$
declare
  m record;
  n int := 0;
  item biome_items%rowtype;
  lname text;
begin
  select * into item from biome_items where key = p_item;
  if not found then raise exception 'No shop item called %', p_item; end if;
  update levels set reward_item = p_item where level = p_level returning name into lname;
  for m in select id from profiles where level >= p_level and deleted_at is null loop
    insert into level_gifts (user_id, level, item_key) values (m.id, p_level, p_item) on conflict do nothing;
    if found then
      insert into biome_inventory (user_id, item_key, source) values (m.id, p_item, 'gift');
      perform create_notification(m.id, null, 'level', null,
        'Your ' || lname || ' gift is here: ' || item.name || '! It''s waiting for you on your shelf.',
        'profile.html?shelf=edit', false, 'positive');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.release_level_gift(smallint, text) from public, anon, authenticated;

-- The Moderate badge counts levels waiting too
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
       + (select count(*) from modmail_threads where status = 'open' and last_from = 'member')
       + (select count(*) from level_requests where status = 'waiting');
end $$;


-- ---------- Everyone's level, now ----------
-- Members who already qualify get their level straight away (one pop-up
-- for the level they've reached, not one per level)
-- (twice, since engagement only counts from Sprouts and up, and the first
-- pass is what makes them Sprouts)
do $$
declare m record;
begin
  for pass in 1..2 loop
    for m in select id from profiles where deleted_at is null order by created_at loop
      perform refresh_level(m.id);
    end loop;
  end loop;
end $$;

-- Check: how many members are at each level
select l.level, l.name, count(p.id) as members
from levels l left join profiles p on p.level = l.level and p.deleted_at is null
group by l.level, l.name order by l.level;
