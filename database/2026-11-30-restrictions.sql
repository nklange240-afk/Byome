-- =========================================================
-- Byome: restrictions (the plan is in docs/plans/levels.md).
-- A moderator can stop one member from:
--   posting     Community posts and polls
--   commenting  comments and replies
--   reviewing   reviews and review updates
--   suggesting  product and variation suggestions
--   photos      photo uploads (once photos exist)
-- for 7 days, 30 days, or permanently, with a reason the member sees.
-- Existing content stays up (only new content is stopped). It's enforced
-- by the database, logged, and any moderator can lift it early.
-- While a restriction is active the member can't level up, and afterwards
-- their next level-up waits for a moderator ("Level-up needs approval").
-- Moderators can't be restricted (remove moderator status first).
--
-- Run in the Supabase SQL Editor AFTER 2026-11-28-levels.sql and
-- 2026-11-29-levels-fix.sql. Safe to run again. Paste the whole file with
-- nothing highlighted. Run it before publishing the site update that came
-- with it.
-- =========================================================

create table if not exists public.restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('posting', 'commenting', 'reviewing', 'suggesting', 'photos')),
  reason text not null check (char_length(reason) between 1 and 500),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,                       -- null: permanent
  created_by uuid references public.profiles(id) on delete set null,
  lifted_at timestamptz,
  lifted_by uuid references public.profiles(id) on delete set null
);
create index if not exists restrictions_user_idx on public.restrictions (user_id) where lifted_at is null;

-- Members see their own; moderators see everyone's
alter table public.restrictions enable row level security;
drop policy if exists "See your own restrictions" on public.restrictions;
create policy "See your own restrictions" on public.restrictions for select to authenticated
  using (user_id = (select auth.uid()) or (select is_moderator()));

-- What each kind is called in messages
create or replace function public.restriction_label(p_kind text) returns text
language sql immutable as $$
  select case p_kind
    when 'posting' then 'posting in the Community'
    when 'commenting' then 'commenting'
    when 'reviewing' then 'writing reviews'
    when 'suggesting' then 'suggesting products'
    when 'photos' then 'uploading photos'
    else p_kind end
$$;

-- "posting in the Community" -> "Posting in the Community"
create or replace function public.initcap_first(p text) returns text
language sql immutable as $$ select upper(left(p, 1)) || substr(p, 2) $$;

-- "posting, commenting and writing reviews"
create or replace function public.restriction_list(p_kinds text[]) returns text
language sql immutable as $$
  select case when cardinality(p_kinds) = 1 then restriction_label(p_kinds[1])
    else (select string_agg(restriction_label(k), ', ' order by n) from unnest(p_kinds[1:cardinality(p_kinds) - 1]) with ordinality as t(k, n))
         || ' and ' || restriction_label(p_kinds[cardinality(p_kinds)]) end
$$;

-- The member's active restriction of one kind (the one ending last)
create or replace function public.active_restriction(p_user uuid, p_kind text) returns public.restrictions
language sql stable security definer set search_path to public as $$
  select * from restrictions
  where user_id = p_user and kind = p_kind and lifted_at is null and starts_at <= now()
    and (ends_at is null or ends_at > now())
  order by ends_at desc nulls first limit 1
$$;
revoke execute on function public.active_restriction(uuid, text) from public, anon, authenticated;

-- Levels: any active restriction pauses levelling up (replaces the
-- placeholder from 2026-11-28-levels.sql)
create or replace function public.has_active_restriction(p_user uuid) returns boolean
language sql stable security definer set search_path to public as $$
  select exists (select 1 from restrictions
    where user_id = p_user and lifted_at is null and starts_at <= now() and (ends_at is null or ends_at > now()))
$$;


-- ---------- Enforcement ----------
-- Stops new content of a restricted kind, with a clear message
create or replace function public.enforce_restriction() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  r jsonb := to_jsonb(new);  -- (each table has different columns, so read them by name)
  who uuid;
  kind text;
  x restrictions%rowtype;
begin
  kind := case tg_table_name
    when 'posts' then 'posting'
    when 'comments' then 'commenting'
    when 'reviews' then 'reviewing'
    when 'review_updates' then 'reviewing'
    when 'products' then 'suggesting'
    when 'variation_suggestions' then 'suggesting' end;
  who := coalesce((r->>'user_id')::uuid, (r->>'suggested_by')::uuid);
  if who is null or kind is null then return new; end if;
  x := active_restriction(who, kind);
  if x.id is not null then
    raise exception '% is paused on your account %. Reason: %', initcap_first(restriction_label(kind)),
      case when x.ends_at is null then 'for now'
           else 'until ' || to_char(x.ends_at at time zone 'America/Chicago', 'FMMonth FMDD') end,
      x.reason;
  end if;
  return new;
end $$;

drop trigger if exists posts_restriction on public.posts;
create trigger posts_restriction before insert on public.posts
  for each row execute function public.enforce_restriction();
drop trigger if exists comments_restriction on public.comments;
create trigger comments_restriction before insert on public.comments
  for each row execute function public.enforce_restriction();
drop trigger if exists reviews_restriction on public.reviews;
create trigger reviews_restriction before insert on public.reviews
  for each row execute function public.enforce_restriction();
drop trigger if exists review_updates_restriction on public.review_updates;
create trigger review_updates_restriction before insert on public.review_updates
  for each row execute function public.enforce_restriction();
drop trigger if exists products_restriction on public.products;
create trigger products_restriction before insert on public.products
  for each row execute function public.enforce_restriction();
drop trigger if exists variation_suggestions_restriction on public.variation_suggestions;
create trigger variation_suggestions_restriction before insert on public.variation_suggestions
  for each row execute function public.enforce_restriction();


-- ---------- For moderators ----------
-- Restrict someone from one or more kinds. p_days: 7, 30, or null for permanent.
create or replace function public.restrict_member(p_user uuid, p_kinds text[], p_days integer, p_reason text)
returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  pr profiles%rowtype;
  k text;
  ends timestamptz := case when p_days is null then null else now() + make_interval(days => p_days) end;
  what text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  if p_user = me then raise exception 'You can''t restrict yourself'; end if;
  select * into pr from profiles where id = p_user;
  if not found or pr.deleted_at is not null then raise exception 'Member not found'; end if;
  if pr.is_moderator then raise exception 'Moderators can''t be restricted. The site owner can remove their moderator status first.'; end if;
  if p_days is not null and p_days not in (7, 30) then raise exception 'Choose 7 days, 30 days, or permanent'; end if;
  if coalesce(array_length(p_kinds, 1), 0) = 0 then raise exception 'Choose at least one thing to restrict'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Please give a reason (they''ll see it)'; end if;
  foreach k in array p_kinds loop
    if k not in ('posting', 'commenting', 'reviewing', 'suggesting', 'photos') then raise exception 'Unknown restriction: %', k; end if;
    insert into restrictions (user_id, kind, reason, ends_at, created_by) values (p_user, k, left(btrim(p_reason), 500), ends, me);
  end loop;
  -- Their next level-up waits for a moderator, and nothing's waiting meanwhile
  update profiles set level_needs_approval = true where id = p_user;
  delete from level_requests where user_id = p_user;

  what := restriction_list(p_kinds);
  perform create_notification(p_user, null, 'moderation', null,
    'A moderator has paused ' || what || ' on your account '
      || case when ends is null then 'until further notice' else 'until ' || to_char(ends at time zone 'America/Chicago', 'FMMonth FMDD') end
      || '. Reason: ' || left(btrim(p_reason), 300)
      || case when btrim(p_reason) ~ '[.!?]$' then '' else '.' end
      || ' Everything you''ve already shared stays up. If you have questions, you can message the moderators.',
    'modmail.html?new=message', false, 'negative');
  perform log_moderation('restrict', 'profile', p_user, p_user, 'negative',
    pr.username || ': ' || what || ' (' || coalesce(p_days || ' days', 'permanent') || '): ' || left(btrim(p_reason), 200));
  perform reward_moderator('mod_decision', 'profile', gen_random_uuid(), p_user);
  return 'Paused for ' || pr.username || ': ' || what || case when ends is null then ', until further notice.' else ', for ' || p_days || ' days.' end;
end $$;
revoke execute on function public.restrict_member(uuid, text[], integer, text) from public, anon;
grant execute on function public.restrict_member(uuid, text[], integer, text) to authenticated;

-- Lift one restriction early
create or replace function public.lift_restriction(p_id uuid) returns text
language plpgsql security definer set search_path to public as $$
declare
  x restrictions%rowtype;
  name text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  select * into x from restrictions where id = p_id for update;
  if not found or x.lifted_at is not null then raise exception 'That restriction isn''t active'; end if;
  update restrictions set lifted_at = now(), lifted_by = auth.uid() where id = p_id;
  select username into name from profiles where id = x.user_id;
  perform create_notification(x.user_id, null, 'moderation', null,
    'A moderator has lifted the pause on ' || restriction_label(x.kind) || '. Welcome back!',
    'profile.html', false, 'positive');
  perform log_moderation('lift_restriction', 'profile', x.user_id, x.user_id, 'positive', name || ': ' || restriction_label(x.kind));
  perform reward_moderator('mod_decision', 'profile', gen_random_uuid(), x.user_id);
  perform refresh_level(x.user_id);  -- onto "Level-up needs approval" if they've earned one
  return 'Lifted.';
end $$;
revoke execute on function public.lift_restriction(uuid) from public, anon;
grant execute on function public.lift_restriction(uuid) to authenticated;

-- Every active restriction (Moderate page), or one member's (profiles)
create or replace function public.active_restrictions(p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path to public as $$
begin
  if not is_moderator() and p_user is distinct from auth.uid() then raise exception 'Moderators only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'user_id', x.user_id, 'username', p.username, 'kind', x.kind, 'label', restriction_label(x.kind),
      'reason', x.reason, 'starts_at', x.starts_at, 'ends_at', x.ends_at)
      order by x.ends_at nulls last, x.starts_at)
    from restrictions x join profiles p on p.id = x.user_id
    where x.lifted_at is null and (x.ends_at is null or x.ends_at > now())
      and (p_user is null or x.user_id = p_user)), '[]'::jsonb);
end $$;
revoke execute on function public.active_restrictions(uuid) from public, anon;
grant execute on function public.active_restrictions(uuid) to authenticated;
