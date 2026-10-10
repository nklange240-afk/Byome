-- =========================================================
-- byome: catch-up for 2026-10-03-profiles.sql.
-- On the live site only the first part of that file ran (the profile
-- details). This adds everything after that, and skips anything that's
-- already there:
--   - profile pictures storage (bucket + who can upload/remove)
--   - reporting a profile (picture or username)
--   - deleting your account
-- Run in the Supabase SQL Editor BEFORE 2026-10-11-moderation-log.sql.
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================


-- ---------- Profile pictures: storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Members manage their own avatar files (add)" on storage.objects;
create policy "Members manage their own avatar files (add)" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Members manage their own avatar files (replace)" on storage.objects;
create policy "Members manage their own avatar files (replace)" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Members manage their own avatar files (view list)" on storage.objects;
create policy "Members manage their own avatar files (view list)" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Members and moderators remove avatar files" on storage.objects;
create policy "Members and moderators remove avatar files" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_moderator())));


-- ---------- Reporting a profile (picture or username) ----------
alter table public.content_reports add column if not exists profile_id uuid references public.profiles(id) on delete cascade;

-- Replace the old rules about what a report can point at. (The old rule's
-- name isn't the same everywhere, so any rule that checks the report's
-- target or kind is replaced.)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.content_reports'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) like '%post_id%' or pg_get_constraintdef(oid) like '%kind%'
                  or pg_get_constraintdef(oid) like '%resolution%')
  loop
    execute format('alter table public.content_reports drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.content_reports add constraint content_reports_kind_check
  check (kind in ('post', 'comment', 'review', 'profile'));
alter table public.content_reports add constraint content_reports_target_check
  check ((kind = 'post') = (post_id is not null)
     and (kind = 'comment') = (comment_id is not null)
     and (kind = 'review') = (review_id is not null)
     and (kind = 'profile') = (profile_id is not null));
alter table public.content_reports add constraint content_reports_resolution_check
  check (resolution in ('kept', 'actioned'));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_reports_reporter_id_profile_id_key') then
    alter table public.content_reports add constraint content_reports_reporter_id_profile_id_key unique (reporter_id, profile_id);
  end if;
end $$;

-- Reporting: same as before, plus profiles
create or replace function public.report_content(p_kind text, p_id uuid, p_reason text, p_details text default null)
returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  tbl text := case p_kind when 'post' then 'posts' when 'comment' then 'comments' when 'review' then 'reviews' end;
  author uuid;
  held timestamptz;
  new_id uuid;
begin
  if me is null then raise exception 'Please log in first'; end if;

  if p_kind = 'profile' then
    select id into author from profiles where id = p_id and deleted_at is null;
    if author is null then raise exception 'That member no longer exists'; end if;
    if author = me then raise exception 'You can''t report your own profile'; end if;
  else
    if tbl is null then raise exception 'That can''t be reported'; end if;
    execute format('select user_id, held_at from %I where id = $1', tbl) into author, held using p_id;
    if author is null then raise exception 'That % no longer exists', p_kind; end if;
    if author = me then raise exception 'You can''t report your own %', p_kind; end if;
    if held is not null then return 'already'; end if;  -- automod is already holding it for a moderator
  end if;

  -- stop anyone flooding the moderators
  if (select count(*) from content_reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You''ve sent a lot of reports today. Please try again tomorrow.';
  end if;

  insert into content_reports (kind, post_id, comment_id, review_id, profile_id, reporter_id, reason, details)
  values (p_kind,
          case when p_kind = 'post' then p_id end,
          case when p_kind = 'comment' then p_id end,
          case when p_kind = 'review' then p_id end,
          case when p_kind = 'profile' then p_id end,
          me, p_reason, nullif(trim(p_details), ''))
  on conflict do nothing
  returning id into new_id;

  return case when new_id is null then 'already' else 'reported' end;
end $$;

-- (resolve_reports and moderate_profile are brought fully up to date by
-- 2026-10-11-moderation-log.sql, which runs next.)

-- Moderator alerts and the waiting count, now including profiles
create or replace function public.on_content_reported() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if not exists (
    select 1 from content_reports r
    where r.id <> new.id and r.resolved_at is null
      and r.post_id is not distinct from new.post_id
      and r.comment_id is not distinct from new.comment_id
      and r.review_id is not distinct from new.review_id
      and r.profile_id is not distinct from new.profile_id
  ) then
    perform notify_moderators(new.reporter_id, coalesce(new.post_id, new.comment_id, new.review_id, new.profile_id),
      'A member reported a ' || new.kind || '.');
  end if;
  return new;
end $$;

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
            from content_reports where resolved_at is null);
end $$;


-- ---------- Deleting your account ----------
-- So that a profile can outlive its login, profiles no longer require a
-- matching row in auth.users.
alter table public.profiles drop constraint if exists profiles_id_fkey;

create or replace function public.delete_my_account(p_delete_content boolean) returns void
language plpgsql security definer set search_path to public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in first'; end if;

  if p_delete_content then
    delete from review_updates where user_id = me;
    delete from reviews where user_id = me;
    delete from comments where user_id = me;
    delete from posts where user_id = me;
  end if;

  -- personal things nobody else needs
  delete from notifications where user_id = me;
  delete from biome_slots where user_id = me;
  delete from biome_inventory where user_id = me;
  delete from user_achievements where user_id = me;
  delete from point_ledger where user_id = me;
  delete from content_reports where reporter_id = me;

  update profiles set
    username = 'deleted-member-' || right(replace(me::text, '-', ''), 12),
    avatar_path = null, skin_type = null, skin_concerns = '{}', hair_type = null, hair_texture = null,
    is_moderator = false, deleted_at = now()
  where id = me;

  delete from auth.users where id = me;  -- the login itself
end $$;
revoke execute on function public.delete_my_account(boolean) from public, anon;
grant execute on function public.delete_my_account(boolean) to authenticated;
