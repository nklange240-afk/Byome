-- =========================================================
-- Byome: blocking, mod mail, feedback and error logging.
--  - Blocking: a member can block another member. After that, neither
--    sees the other's posts, comments, reviews or review updates, the
--    blocked member can't comment on the blocker's posts or reply to
--    their comments, and the blocker gets no notifications from them.
--    Moderators still see everything (so blocking a moderator doesn't
--    stop moderation, and moderators can still do their job).
--  - Mod mail: members can message the moderator team. Every moderator
--    sees every conversation and can reply; members see replies as from
--    "the Byome moderators". Blocking someone can include an optional
--    note to the moderators, and "Send feedback" uses mod mail too.
--  - Error log: the site quietly records errors that happen in members'
--    browsers (page, browser, error message; no personal details beyond
--    the account, if logged in), so problems can be fixed. Kept 30 days.
--    See the latest: select * from client_errors order by created_at desc limit 50;
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

-- ---------- Blocking ----------
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked on public.user_blocks (blocked_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;
drop policy if exists "Members see who they blocked" on public.user_blocks;
create policy "Members see who they blocked" on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

-- Has either of these two members blocked the other?
create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path to public as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;
revoke execute on function public.blocked_between(uuid, uuid) from public, anon;
grant execute on function public.blocked_between(uuid, uuid) to authenticated;

-- Hide content between members who've blocked each other (on top of the
-- usual rules; moderators are exempt)
do $$
declare t text;
begin
  foreach t in array array['posts', 'comments', 'reviews', 'review_updates'] loop
    execute format('drop policy if exists "Hidden between blocked members" on public.%I', t);
    execute format('create policy "Hidden between blocked members" on public.%I as restrictive for select to authenticated
      using ((select is_moderator()) or not blocked_between((select auth.uid()), user_id))', t);
  end loop;
end $$;

-- No commenting on a post (or replying to a comment) of someone who's
-- blocked you, or whom you've blocked
create or replace function public.no_comments_across_blocks() returns trigger
language plpgsql security definer set search_path to public as $$
declare owner uuid;
begin
  select user_id into owner from posts where id = new.post_id;
  if blocked_between(new.user_id, owner) then
    raise exception 'You can''t comment on this post.';
  end if;
  if new.parent_id is not null then
    select user_id into owner from comments where id = new.parent_id;
    if blocked_between(new.user_id, owner) then
      raise exception 'You can''t reply to this comment.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists comments_no_blocked on public.comments;
create trigger comments_no_blocked before insert on public.comments
for each row execute function public.no_comments_across_blocks();

-- Notifications: same as before, but never from someone you've blocked
-- (or who has blocked you)
create or replace function public.create_notification(p_user uuid, p_actor uuid, p_type text, p_ref uuid,
  p_message text, p_link text, p_once boolean default false, p_tone text default null)
returns void
language plpgsql security definer set search_path to public as $$
begin
  if p_user is null then return; end if;
  if p_actor is not null and p_user = p_actor then return; end if;   -- never notify yourself
  if blocked_between(p_user, p_actor) then return; end if;           -- blocked either way
  if p_once and exists (
    select 1 from notifications
    where user_id = p_user and actor_id = p_actor and type = p_type and ref_id = p_ref
  ) then return; end if;                                              -- like/unlike/like won't spam
  insert into notifications (user_id, actor_id, type, ref_id, message, link, tone)
  values (p_user, p_actor, p_type, p_ref, p_message, p_link, p_tone);
end $$;
revoke execute on function public.create_notification(uuid, uuid, text, uuid, text, text, boolean, text) from public, anon, authenticated;

-- Block a member, optionally telling the moderators why (the note starts
-- a mod mail conversation). Returns 'blocked'.
create or replace function public.block_member(p_user uuid, p_note text default null) returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  them text;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if p_user = me then raise exception 'You can''t block yourself'; end if;
  select username into them from profiles where id = p_user;
  if them is null then raise exception 'Member not found'; end if;
  insert into user_blocks (blocker_id, blocked_id) values (me, p_user) on conflict do nothing;
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    perform modmail_start('block', 'I blocked ' || them, p_note, p_user, null);
  end if;
  return 'blocked';
end $$;

create or replace function public.unblock_member(p_user uuid) returns void
language plpgsql security definer set search_path to public as $$
begin
  if auth.uid() is null then raise exception 'Please log in first'; end if;
  delete from user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
end $$;
revoke execute on function public.unblock_member(uuid) from public, anon;
grant execute on function public.unblock_member(uuid) to authenticated;


-- ---------- Mod mail ----------
create table if not exists public.modmail_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'message' check (kind in ('message', 'block', 'feedback')),
  subject text not null check (char_length(subject) between 1 and 120),
  about_user uuid references public.profiles(id) on delete set null,  -- who was blocked
  page text check (char_length(page) <= 300),                          -- where feedback was sent from
  status text not null default 'open' check (status in ('open', 'closed')),
  last_from text not null default 'member' check (last_from in ('member', 'mods')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists modmail_threads_user on public.modmail_threads (user_id, updated_at desc);
create index if not exists modmail_threads_updated on public.modmail_threads (updated_at desc);

create table if not exists public.modmail_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.modmail_threads(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  from_mods boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists modmail_messages_thread on public.modmail_messages (thread_id, created_at);

-- Only through the functions below (so members never see which moderator
-- replied, just "the Byome moderators")
alter table public.modmail_threads enable row level security;
alter table public.modmail_messages enable row level security;
revoke all on public.modmail_threads from anon, authenticated;
revoke all on public.modmail_messages from anon, authenticated;

-- Tell every moderator (except one who sent it) about mod mail
create or replace function public.notify_modmail(p_actor uuid, p_thread uuid, p_message text) returns void
language plpgsql security definer set search_path to public as $$
declare m uuid;
begin
  for m in select id from profiles where is_moderator and deleted_at is null loop
    if m is distinct from p_actor then
      insert into notifications (user_id, actor_id, type, ref_id, message, link)
      values (m, p_actor, 'modmail', p_thread, p_message, 'modmail.html?thread=' || p_thread);
    end if;
  end loop;
end $$;
revoke execute on function public.notify_modmail(uuid, uuid, text) from public, anon, authenticated;

-- Start a conversation with the moderators. Returns its id.
create or replace function public.modmail_start(p_kind text, p_subject text, p_body text,
  p_about uuid default null, p_page text default null) returns uuid
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  t uuid;
  label text := case p_kind when 'feedback' then 'Feedback' when 'block' then 'A block' else 'Mod mail' end;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if p_kind not in ('message', 'block', 'feedback') then raise exception 'Unknown kind: %', p_kind; end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then raise exception 'Please write a message'; end if;
  if char_length(btrim(p_body)) > 2000 then raise exception 'Messages can be up to 2000 characters'; end if;
  if (select count(*) from modmail_threads where user_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve sent a lot of messages today. Please wait a little, or add to one of your conversations.';
  end if;
  insert into modmail_threads (user_id, kind, subject, about_user, page)
  values (me, p_kind, left(coalesce(nullif(btrim(p_subject), ''), label), 120), p_about, left(p_page, 300))
  returning id into t;
  insert into modmail_messages (thread_id, sender_id, from_mods, body) values (t, me, false, btrim(p_body));
  perform notify_modmail(me, t, label || ' from ' || (select username from profiles where id = me) || ': ' || left(coalesce(nullif(btrim(p_subject), ''), label), 80));
  return t;
end $$;
revoke execute on function public.modmail_start(text, text, text, uuid, text) from public, anon;
grant execute on function public.modmail_start(text, text, text, uuid, text) to authenticated;
-- (block_member uses it, so it's granted after modmail_start exists)
revoke execute on function public.block_member(uuid, text) from public, anon;
grant execute on function public.block_member(uuid, text) to authenticated;

-- Reply in a conversation: the member who started it, or any moderator
create or replace function public.modmail_reply(p_thread uuid, p_body text) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  th modmail_threads%rowtype;
  as_mod boolean;
begin
  if me is null then raise exception 'Please log in first'; end if;
  select * into th from modmail_threads where id = p_thread;
  if not found then raise exception 'Conversation not found'; end if;
  as_mod := is_moderator() and th.user_id is distinct from me;
  if not as_mod and th.user_id is distinct from me then raise exception 'Conversation not found'; end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then raise exception 'Please write a message'; end if;
  if char_length(btrim(p_body)) > 2000 then raise exception 'Messages can be up to 2000 characters'; end if;
  if (select count(*) from modmail_messages where sender_id = me and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'That''s a lot of messages in a short time! Please take a little break and try again later.';
  end if;

  insert into modmail_messages (thread_id, sender_id, from_mods, body) values (p_thread, me, as_mod, btrim(p_body));
  update modmail_threads set updated_at = now(), last_from = case when as_mod then 'mods' else 'member' end,
    status = case when as_mod then status else 'open' end
  where id = p_thread;

  if as_mod then
    if th.user_id is not null then
      insert into notifications (user_id, actor_id, type, ref_id, message, link)
      values (th.user_id, null, 'modmail', p_thread, 'The Byome moderators replied to "' || left(th.subject, 60) || '".',
              'modmail.html?thread=' || p_thread);
    end if;
  else
    perform notify_modmail(me, p_thread, (select username from profiles where id = me) || ' replied in mod mail: ' || left(th.subject, 60));
  end if;
end $$;
revoke execute on function public.modmail_reply(uuid, text) from public, anon;
grant execute on function public.modmail_reply(uuid, text) to authenticated;

-- Moderators: mark a conversation done (or open it again)
create or replace function public.modmail_set_status(p_thread uuid, p_status text) returns void
language plpgsql security definer set search_path to public as $$
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  if p_status not in ('open', 'closed') then raise exception 'Unknown status: %', p_status; end if;
  update modmail_threads set status = p_status where id = p_thread;
end $$;
revoke execute on function public.modmail_set_status(uuid, text) from public, anon;
grant execute on function public.modmail_set_status(uuid, text) to authenticated;

-- Your conversations (moderators: everyone's, or only yours with p_mine)
create or replace function public.modmail_list(p_mine boolean default false) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  mod boolean := is_moderator() and not p_mine;
begin
  if me is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'kind', t.kind, 'subject', t.subject, 'status', t.status, 'last_from', t.last_from,
      'created_at', t.created_at, 'updated_at', t.updated_at,
      'member', case when mod then (select username from profiles where id = t.user_id) end,
      'about', case when mod then (select username from profiles where id = t.about_user) end,
      'count', (select count(*) from modmail_messages m where m.thread_id = t.id))
      order by (t.status = 'open' and t.last_from = 'member' and mod) desc, t.updated_at desc)
    from modmail_threads t
    where (mod or t.user_id = me)
  ), '[]'::jsonb);
end $$;
revoke execute on function public.modmail_list(boolean) from public, anon;
grant execute on function public.modmail_list(boolean) to authenticated;

-- One conversation with its messages. Members see moderator replies as
-- "Byome moderators"; moderators see which moderator wrote each one.
create or replace function public.modmail_thread(p_thread uuid) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  th modmail_threads%rowtype;
  mod boolean;
begin
  if me is null then return null; end if;
  select * into th from modmail_threads where id = p_thread;
  if not found then return null; end if;
  mod := is_moderator();
  if not mod and th.user_id is distinct from me then return null; end if;
  return jsonb_build_object(
    'id', th.id, 'kind', th.kind, 'subject', th.subject, 'status', th.status, 'page', th.page,
    'created_at', th.created_at, 'mine', th.user_id = me, 'as_mod', mod and th.user_id is distinct from me,
    'member', (select username from profiles where id = th.user_id),
    'about', case when mod then (select username from profiles where id = th.about_user) end,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'body', m.body, 'created_at', m.created_at, 'from_mods', m.from_mods,
        'mine', m.sender_id = me,
        'sender', case when m.from_mods and not mod then 'Byome moderators'
                       else (select username from profiles where id = m.sender_id) end)
        order by m.created_at)
      from modmail_messages m where m.thread_id = th.id), '[]'::jsonb));
end $$;
revoke execute on function public.modmail_thread(uuid) from public, anon;
grant execute on function public.modmail_thread(uuid) to authenticated;

-- The Moderate badge counts mod mail waiting for a reply too
create or replace function public.moderation_counts() returns integer
language plpgsql stable security definer set search_path to public as $$
begin
  if not is_moderator() then return 0; end if;
  return (select count(*) from products where status = 'pending')
       + (select count(*) from posts where held_at is not null)
       + (select count(*) from comments where held_at is not null)
       + (select count(*) from reviews where held_at is not null)
       + (select count(*) from review_updates where held_at is not null)
       + (select count(distinct coalesce(post_id, comment_id, review_id, profile_id))
            from content_reports where resolved_at is null)
       + (select count(*) from modmail_threads where status = 'open' and last_from = 'member');
end $$;

-- Mod mail waiting, for the Mod mail link
create or replace function public.modmail_waiting() returns integer
language sql stable security definer set search_path to public as $$
  select case when is_moderator()
    then (select count(*)::int from modmail_threads where status = 'open' and last_from = 'member')
    else 0 end
$$;
revoke execute on function public.modmail_waiting() from public, anon;
grant execute on function public.modmail_waiting() to authenticated;


-- ---------- Error log ----------
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  page text,
  message text,
  source text,
  line int,
  col int,
  user_agent text
);
create index if not exists client_errors_created on public.client_errors (created_at);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;

create or replace function public.log_client_error(p_page text, p_message text, p_source text,
  p_line int, p_col int, p_agent text) returns void
language plpgsql security definer set search_path to public as $$
declare me uuid := auth.uid();
begin
  -- a few per member an hour, and a cap overall, so it can't be flooded
  if me is not null and (select count(*) from client_errors where user_id = me and created_at > now() - interval '1 hour') >= 20 then return; end if;
  if (select count(*) from client_errors where created_at > now() - interval '1 hour') >= 500 then return; end if;
  insert into client_errors (user_id, page, message, source, line, col, user_agent)
  values (me, left(p_page, 300), left(p_message, 1000), left(p_source, 300), p_line, p_col, left(p_agent, 300));
  delete from client_errors where created_at < now() - interval '30 days';
end $$;
revoke execute on function public.log_client_error(text, text, text, int, int, text) from public;
grant execute on function public.log_client_error(text, text, text, int, int, text) to anon, authenticated;
