-- =========================================================
-- byome: richer profiles, profile pictures, reporting profiles,
-- and deleting your account.
-- Run this once in the Supabase SQL Editor
-- (after 2026-10-03-moderator-alerts.sql).
-- =========================================================


-- ---------- Profile details (all optional) ----------

alter table public.profiles
  add column avatar_path text check (avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  add column skin_type text check (skin_type in ('dry', 'oily', 'combination', 'normal', 'sensitive')),
  add column skin_concerns text[] not null default '{}' check (skin_concerns <@ array[
    'acne', 'fine-lines', 'hyperpigmentation', 'redness', 'texture', 'dullness',
    'sensitivity', 'dehydration', 'large-pores', 'dark-circles']::text[]),
  add column hair_type text check (hair_type in ('straight', 'wavy', 'curly', 'coily')),
  add column hair_texture text check (hair_texture in ('fine', 'medium', 'thick')),
  add column deleted_at timestamptz;


-- ---------- Usernames: "deleted-member-..." is reserved ----------
-- (Same as before, plus that one rule.)
create or replace function public.check_username(p_username text) returns text
language plpgsql stable security definer set search_path to public as $$
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_.-]{3,20}$' then return 'invalid'; end if;
  if lower(p_username) like 'deleted-member%' then return 'not_allowed'; end if;
  if exists (select 1 from profiles where lower(username) = lower(p_username)) then return 'taken'; end if;
  if text_is_flagged(regexp_replace(p_username, '[_.-]+', ' ', 'g')) then return 'not_allowed'; end if;
  return 'ok';
end $$;


-- ---------- Editing your own profile ----------
-- Profiles can't be edited directly (that would let people make themselves
-- moderators), only through these functions.

create or replace function public.update_my_profile(
  p_username text, p_skin_type text, p_skin_concerns text[], p_hair_type text, p_hair_texture text)
returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  current_name text;
  problem text;
begin
  if me is null then raise exception 'Please log in first'; end if;
  select username into current_name from profiles where id = me;

  if p_username is distinct from current_name then
    problem := check_username(p_username);
    -- changing only the capitals of your own name is fine
    if problem = 'taken' and lower(p_username) = lower(current_name) then problem := 'ok'; end if;
    if problem <> 'ok' then return problem; end if;
  end if;

  update profiles set
    username = p_username,
    skin_type = nullif(p_skin_type, ''),
    skin_concerns = coalesce(p_skin_concerns, '{}'),
    hair_type = nullif(p_hair_type, ''),
    hair_texture = nullif(p_hair_texture, '')
  where id = me;
  return 'ok';
end $$;
revoke execute on function public.update_my_profile(text, text, text[], text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text[], text, text) to authenticated;

-- Point your profile at a picture you uploaded (or null to remove it).
-- Pictures must be in your own folder of the avatars storage bucket.
create or replace function public.set_my_avatar(p_path text) returns void
language plpgsql security definer set search_path to public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in first'; end if;
  if p_path is not null and split_part(p_path, '/', 1) <> me::text then
    raise exception 'That picture isn''t yours';
  end if;
  update profiles set avatar_path = p_path where id = me;
end $$;
revoke execute on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;


-- ---------- Profile pictures: storage ----------
-- A public bucket (anyone can view pictures). Each member can only add,
-- replace or remove files in their own folder; moderators can remove any.
-- Pictures are shrunk in the browser before upload; 2 MB is the hard limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Members manage their own avatar files (add)" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Members manage their own avatar files (replace)" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Members manage their own avatar files (view list)" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Members and moderators remove avatar files" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_moderator())));


-- ---------- Reporting a profile (picture or username) ----------

alter table public.content_reports add column profile_id uuid references public.profiles(id) on delete cascade;
alter table public.content_reports drop constraint content_reports_kind_check;
alter table public.content_reports add constraint content_reports_kind_check
  check (kind in ('post', 'comment', 'review', 'profile'));
alter table public.content_reports drop constraint content_reports_check;
alter table public.content_reports add constraint content_reports_target_check
  check ((kind = 'post') = (post_id is not null)
     and (kind = 'comment') = (comment_id is not null)
     and (kind = 'review') = (review_id is not null)
     and (kind = 'profile') = (profile_id is not null));
alter table public.content_reports add constraint content_reports_reporter_id_profile_id_key unique (reporter_id, profile_id);
alter table public.content_reports drop constraint content_reports_resolution_check;
alter table public.content_reports add constraint content_reports_resolution_check
  check (resolution in ('kept', 'actioned'));

-- Same as before, plus profiles
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

-- Same as before, plus "keep" for profiles (profiles are dealt with by
-- moderate_profile below rather than removed)
create or replace function public.resolve_reports(p_kind text, p_id uuid, p_action text) returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  col text := case p_kind when 'post' then 'post_id' when 'comment' then 'comment_id'
                          when 'review' then 'review_id' when 'profile' then 'profile_id' end;
  r record;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  if col is null then raise exception 'Unknown kind: %', p_kind; end if;

  if p_action = 'keep' then
    execute format('update content_reports set resolved_at = now(), resolved_by = $1, resolution = ''kept''
                    where %I = $2 and resolved_at is null', col) using me, p_id;
    return 'kept';
  elsif p_action = 'remove' and p_kind <> 'profile' then
    for r in execute format('select distinct reporter_id from content_reports where %I = $1', col) using p_id loop
      perform create_notification(r.reporter_id, me, 'moderation', p_id,
        'Thanks for your report. A moderator removed the ' || p_kind || ' you flagged.', null);
    end loop;
    return moderate_content(p_kind, p_id, 'remove');
  end if;
  raise exception 'Unknown action: %', p_action;
end $$;

-- Moderators: remove a member's picture, or reset their username
create or replace function public.moderate_profile(p_id uuid, p_action text) returns text
language plpgsql security definer set search_path to public as $$
declare me uuid := auth.uid(); msg text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;

  if p_action = 'remove_avatar' then
    update profiles set avatar_path = null where id = p_id;
    msg := 'A moderator removed your profile picture because it didn''t follow the community guidelines. You can upload a new one on Edit profile.';
  elsif p_action = 'reset_username' then
    update profiles set username = 'member-' || right(replace(p_id::text, '-', ''), 12) where id = p_id;
    msg := 'A moderator reset your username because it didn''t follow the community guidelines. Please choose a new one on Edit profile.';
  else
    raise exception 'Unknown action: %', p_action;
  end if;

  update content_reports set resolved_at = now(), resolved_by = me, resolution = 'actioned'
  where profile_id = p_id and resolved_at is null;
  perform create_notification(p_id, null, 'moderation', p_id, msg, 'edit-profile.html');
  return 'done';
end $$;
revoke execute on function public.moderate_profile(uuid, text) from public, anon;
grant execute on function public.moderate_profile(uuid, text) to authenticated;

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
-- Removes your login (email and password) and personal details for good.
-- Your reviews, posts and comments stay up, credited to "Deleted member",
-- unless you choose to delete them too.
--
-- So that a profile can outlive its login, profiles no longer require a
-- matching row in auth.users.
alter table public.profiles drop constraint profiles_id_fkey;

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
