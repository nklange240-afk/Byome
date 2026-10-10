-- =========================================================
-- byome: the moderation log, green/red moderation notifications, and
-- keeping moderators anonymous to members.
--
--   - Every moderation action is recorded in moderation_log (who did
--     what, to what, and when). Only moderators can read it.
--   - Moderation notifications are marked positive (approved, your report
--     was acted on) or negative (removed, rejected, reset), so members see
--     a green or red flag.
--   - Members can no longer find out which moderator acted: reports and
--     standout marks stop storing the moderator (the log keeps it, for
--     moderators only), and moderation notifications never name one.
--
-- Run in the Supabase SQL Editor (after 2026-10-10-helpful-reviews.sql).
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================


-- ---------- The log ----------
create table if not exists public.moderation_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  moderator_id uuid references public.profiles(id) on delete set null,
  action text not null,         -- approve, remove, keep, reject, edit, remove_avatar, reset_username, standout
  target_type text not null,    -- post, comment, review, review_update, product, profile
  target_id uuid,
  target_owner uuid references public.profiles(id) on delete set null,  -- whose it was
  outcome text check (outcome in ('positive', 'negative')),
  note text                     -- a short description (title, product name, reason)
);
create index if not exists moderation_log_created_idx on public.moderation_log (created_at desc);
alter table public.moderation_log enable row level security;
drop policy if exists "Moderators can read the log" on public.moderation_log;
create policy "Moderators can read the log" on public.moderation_log for select to authenticated
  using ((select public.is_moderator()));
-- Nobody writes to it directly; the moderation functions below do
revoke insert, update, delete on public.moderation_log from anon, authenticated;

create or replace function public.log_moderation(p_action text, p_type text, p_target uuid,
                                                 p_owner uuid, p_outcome text, p_note text)
returns void
language plpgsql security definer set search_path to public as $$
begin
  insert into moderation_log (moderator_id, action, target_type, target_id, target_owner, outcome, note)
  values (auth.uid(), p_action, p_type, p_target, p_owner, p_outcome, left(p_note, 200));
end $$;
revoke execute on function public.log_moderation(text, text, uuid, uuid, text, text) from public, anon, authenticated;


-- ---------- Green or red: a "tone" on notifications ----------
alter table public.notifications add column if not exists tone text
  check (tone in ('positive', 'negative'));

-- Same as before, plus an optional tone. (The old version is replaced,
-- not kept alongside, so existing calls keep working.)
drop function if exists public.create_notification(uuid, uuid, text, uuid, text, text, boolean);
create or replace function public.create_notification(p_user uuid, p_actor uuid, p_type text, p_ref uuid,
  p_message text, p_link text, p_once boolean default false, p_tone text default null)
returns void
language plpgsql security definer set search_path to public as $$
begin
  if p_user is null then return; end if;
  if p_actor is not null and p_user = p_actor then return; end if;   -- never notify yourself
  if p_once and exists (
    select 1 from notifications
    where user_id = p_user and actor_id = p_actor and type = p_type and ref_id = p_ref
  ) then return; end if;                                              -- like/unlike/like won't spam
  insert into notifications (user_id, actor_id, type, ref_id, message, link, tone)
  values (p_user, p_actor, p_type, p_ref, p_message, p_link, p_tone);
end $$;
revoke execute on function public.create_notification(uuid, uuid, text, uuid, text, text, boolean, text) from public, anon, authenticated;


-- ---------- Held content (automod queue) ----------
-- Same as before, plus the tone and the log.
create or replace function public.moderate_content(p_kind text, p_id uuid, p_action text)
returns text
language plpgsql security definer set search_path to public as $$
declare
  tbl text;
  author uuid;
  label text;
  what text := replace(p_kind, '_', ' ');
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;

  tbl := case p_kind when 'post' then 'posts' when 'comment' then 'comments'
                     when 'review' then 'reviews' when 'review_update' then 'review_updates' end;
  if tbl is null then raise exception 'Unknown kind: %', p_kind; end if;

  execute format('select user_id, left(to_jsonb(t) ->> %L, 80) from %I t where id = $1',
                 case when p_kind in ('post', 'review') then 'title' else 'body' end, tbl)
    into author, label using p_id;
  if author is null then return 'gone'; end if;  -- already deleted

  if p_action = 'approve' then
    perform set_config('byome.moderating', 'on', true);
    execute format('update %I set held_at = null where id = $1', tbl) using p_id;
    perform set_config('byome.moderating', 'off', true);
    perform create_notification(author, null, 'moderation', p_id,
      'A moderator approved your ' || what || '. Everyone can see it now.',
      case when p_kind in ('post', 'comment') then 'feed.html' else 'reviews.html' end,
      false, 'positive');
    perform log_moderation('approve', p_kind, p_id, author, 'positive', label);
    perform reward_moderator('mod_decision', p_kind, p_id, author);
    return 'approved';
  elsif p_action = 'remove' then
    execute format('delete from %I where id = $1', tbl) using p_id;
    perform create_notification(author, null, 'moderation', p_id,
      'A moderator removed your ' || what || ' because it didn''t follow the community guidelines.', null,
      false, 'negative');
    perform log_moderation('remove', p_kind, p_id, author, 'negative', label);
    perform reward_moderator('mod_decision', p_kind, p_id, author);
    return 'removed';
  end if;
  raise exception 'Unknown action: %', p_action;
end $$;


-- ---------- Reports ----------
-- Same as before, except: reports no longer store which moderator closed
-- them, the reporter's thank-you doesn't name the moderator, and "keep"
-- is logged.
create or replace function public.resolve_reports(p_kind text, p_id uuid, p_action text)
returns text
language plpgsql security definer set search_path to public as $$
declare
  col text := case p_kind when 'post' then 'post_id' when 'comment' then 'comment_id'
                          when 'review' then 'review_id' when 'profile' then 'profile_id' end;
  r record;
  closed int;
  author uuid;
  label text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  if col is null then raise exception 'Unknown kind: %', p_kind; end if;

  if p_action = 'keep' then
    execute format('update content_reports set resolved_at = now(), resolved_by = null, resolution = ''kept''
                    where %I = $1 and resolved_at is null', col) using p_id;
    get diagnostics closed = row_count;
    if closed > 0 then
      if p_kind = 'profile' then
        author := p_id;
        select username into label from profiles where id = p_id;
      else
        execute format('select user_id, left(to_jsonb(t) ->> %L, 80) from %I t where id = $1',
          case when p_kind = 'comment' then 'body' else 'title' end,
          case p_kind when 'post' then 'posts' when 'comment' then 'comments' else 'reviews' end)
          into author, label using p_id;
      end if;
      perform log_moderation('keep', p_kind, p_id, author, null, label);
      perform reward_moderator('mod_decision', p_kind, p_id, author);
    end if;
    return 'kept';
  elsif p_action = 'remove' and p_kind <> 'profile' then
    for r in execute format('select distinct reporter_id from content_reports where %I = $1', col) using p_id loop
      perform create_notification(r.reporter_id, null, 'moderation', p_id,
        'Thanks for your report. A moderator removed the ' || p_kind || ' you flagged.', null,
        false, 'positive');
    end loop;
    return moderate_content(p_kind, p_id, 'remove');
  end if;
  raise exception 'Unknown action: %', p_action;
end $$;


-- ---------- Reported profiles ----------
-- Same as before, plus the tone and the log; reports don't store the moderator.
create or replace function public.moderate_profile(p_id uuid, p_action text)
returns text
language plpgsql security definer set search_path to public as $$
declare msg text; old_name text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  select username into old_name from profiles where id = p_id;

  if p_action = 'remove_avatar' then
    update profiles set avatar_path = null where id = p_id;
    msg := 'A moderator removed your profile picture because it didn''t follow the community guidelines. You can upload a new one on Edit profile.';
  elsif p_action = 'reset_username' then
    update profiles set username = 'member-' || right(replace(p_id::text, '-', ''), 12) where id = p_id;
    msg := 'A moderator reset your username because it didn''t follow the community guidelines. Please choose a new one on Edit profile.';
  else
    raise exception 'Unknown action: %', p_action;
  end if;

  update content_reports set resolved_at = now(), resolved_by = null, resolution = 'actioned'
  where profile_id = p_id and resolved_at is null;
  perform create_notification(p_id, null, 'moderation', p_id, msg, 'edit-profile.html', false, 'negative');
  perform log_moderation(p_action, 'profile', p_id, p_id, 'negative', old_name);
  perform reward_moderator('mod_decision', 'profile', p_id, p_id);
  return 'done';
end $$;


-- ---------- Standout reviews ----------
-- Same as before, except the standout no longer records the moderator
-- (the log does, for moderators only).
create or replace function public.grant_standout(p_review_id uuid)
returns text
language plpgsql security definer set search_path to public as $$
declare author uuid; label text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;

  select user_id, title into author, label from reviews where id = p_review_id;
  if author is null then raise exception 'Review not found'; end if;
  if author = auth.uid() then raise exception 'You can''t mark your own review as standout'; end if;
  if exists (select 1 from review_standouts where review_id = p_review_id) then return 'already'; end if;

  insert into review_standouts (review_id, granted_by) values (p_review_id, null);
  perform award_points(author, 'review_standout', 'review', p_review_id);
  perform log_moderation('standout', 'review', p_review_id, author, 'positive', label);
  return 'granted';
end $$;


-- ---------- Product suggestions ----------
-- Approved = green, not approved = red (same messages as before)
create or replace function public.handle_product_status() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      perform create_notification(new.suggested_by, null, 'moderation', new.id,
        'Your product suggestion "' || new.brand || ' — ' || new.name || '" was approved. You can review it now!',
        'reviews.html', false, 'positive');
      perform award_points(new.suggested_by, 'product_approved', 'product', new.id);
    elsif new.status = 'rejected' then
      perform create_notification(new.suggested_by, null, 'moderation', new.id,
        'Your product suggestion "' || new.brand || ' — ' || new.name || '" wasn''t approved.'
        || case when coalesce(new.rejection_reason, '') <> '' then ' Reason: ' || new.rejection_reason else '' end,
        'suggest-product.html', false, 'negative');
    end if;
  end if;
  return new;
end $$;

-- Approving, rejecting and editing suggestions: logged, and rewarded as before
create or replace function public.reward_product_moderation() returns trigger
language plpgsql security definer set search_path to public as $$
declare label text := new.brand || ' — ' || new.name;
begin
  if old.status <> 'pending' or not is_moderator() then return new; end if;
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


-- ---------- Tidying up what's already there ----------
-- Move moderators recorded on old reports and standouts into the log
-- (moderators only), then remove them from where members could see them.
insert into public.moderation_log (created_at, moderator_id, action, target_type, target_id, target_owner, outcome, note)
select r.resolved_at, r.resolved_by,
       case r.resolution when 'kept' then 'keep' else 'remove' end,
       r.kind, coalesce(r.post_id, r.comment_id, r.review_id, r.profile_id), null,
       case when r.resolution = 'kept' then null else 'negative' end,
       'Earlier report (before the log)'
from public.content_reports r
where r.resolved_by is not null;
update public.content_reports set resolved_by = null where resolved_by is not null;

insert into public.moderation_log (created_at, moderator_id, action, target_type, target_id, target_owner, outcome, note)
select s.created_at, s.granted_by, 'standout', 'review', s.review_id, rv.user_id, 'positive', rv.title
from public.review_standouts s left join public.reviews rv on rv.id = s.review_id
where s.granted_by is not null;
update public.review_standouts set granted_by = null where granted_by is not null;

-- Moderation notifications never name a moderator
update public.notifications set actor_id = null where type = 'moderation' and actor_id is not null;

-- Green or red for the moderation notifications members already have
update public.notifications set tone = 'positive'
where type = 'moderation' and tone is null
  and (message like '%was approved%' or message like 'A moderator approved%' or message like 'Thanks for your report%');
update public.notifications set tone = 'negative'
where type = 'moderation' and tone is null
  and (message like '%wasn''t approved%' or message like 'A moderator removed%' or message like 'A moderator reset%');
