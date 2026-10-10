-- =========================================================
-- byome: when a moderator removes a post or review, its author keeps a
-- private copy ("Returned to you" on their profile). They can revise and
-- resubmit it (it goes back to the moderators before anyone else sees
-- it), or let it go.
-- Moderators also pick a reason for every removal (profanity, low effort,
-- unrelated, ...) and can add a short note; the member is told both.
-- Run in the Supabase SQL Editor AFTER 2026-10-11-moderation-log.sql.
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================


-- ---------- The private copies ----------
create table if not exists public.returned_content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('post', 'review')),
  title text,
  body text not null,
  category text,              -- posts
  product_id uuid,            -- reviews: what it was about, and how it was rated
  rating integer,
  variation text,
  would_repurchase boolean,
  holy_grail boolean,
  removed_at timestamptz not null default now(),
  reason text,                -- why it was removed (see removal_reason_label)
  reason_note text            -- the moderator's short note, if any
);
alter table public.returned_content add column if not exists reason text;
alter table public.returned_content add column if not exists reason_note text;
create index if not exists returned_content_user_idx on public.returned_content (user_id);
alter table public.returned_content enable row level security;

-- Only the author can see their returned content, and let it go
drop policy if exists "Members see what was returned to them" on public.returned_content;
create policy "Members see what was returned to them" on public.returned_content for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Members can let returned content go" on public.returned_content;
create policy "Members can let returned content go" on public.returned_content for delete to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update on public.returned_content from anon, authenticated;


-- ---------- Why something was removed ----------
-- The reasons moderators choose from (the Moderate page shows the same list)
create or replace function public.removal_reason_label(p_reason text) returns text
language sql immutable as $$
  select case p_reason
    when 'profanity' then 'Profanity or slurs'
    when 'harassment' then 'Harassment or personal attacks'
    when 'spam' then 'Spam or self-promotion'
    when 'low_effort' then 'Low effort (too short or not useful)'
    when 'off_topic' then 'Unrelated to the topic or product'
    when 'misleading' then 'Misleading or false claims'
    when 'not_genuine' then 'Not a genuine review (the product wasn''t used)'
    when 'personal_info' then 'Shares someone''s personal information'
    when 'other' then 'Something else'
  end
$$;


-- ---------- Removing content: a reason, and a copy for its author ----------
-- Same as in 2026-10-11-moderation-log.sql, plus: a reason and optional
-- note for removals (both told to the member), and a private copy of
-- removed posts and reviews. (The old version without a reason is
-- replaced, not kept alongside.)
drop function if exists public.moderate_content(text, uuid, text);
create or replace function public.moderate_content(p_kind text, p_id uuid, p_action text,
                                                   p_reason text default null, p_note text default null)
returns text
language plpgsql security definer set search_path to public as $$
declare
  tbl text;
  author uuid;
  label text;
  what text := replace(p_kind, '_', ' ');
  why text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  p_note := nullif(btrim(coalesce(p_note, '')), '');
  if p_action = 'remove' then
    p_reason := coalesce(p_reason, 'other');
    if removal_reason_label(p_reason) is null then raise exception 'Unknown reason: %', p_reason; end if;
    if char_length(p_note) > 200 then raise exception 'Please keep the note to 200 characters'; end if;
    why := ' Reason: ' || removal_reason_label(p_reason) || '.'
        || case when p_note is not null then ' Moderator''s note: "' || p_note || '"' else '' end;
  end if;

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
    -- Posts and reviews: keep a private copy for the author first
    if p_kind = 'post' then
      insert into returned_content (user_id, kind, title, body, category, reason, reason_note)
      select user_id, 'post', title, body, category, p_reason, p_note from posts where id = p_id;
    elsif p_kind = 'review' then
      insert into returned_content (user_id, kind, title, body, product_id, rating, variation, would_repurchase, holy_grail, reason, reason_note)
      select user_id, 'review', title, body, product_id, rating, variation, would_repurchase, holy_grail, p_reason, p_note
      from reviews where id = p_id;
    end if;
    execute format('delete from %I where id = $1', tbl) using p_id;
    perform create_notification(author, null, 'moderation', p_id,
      'A moderator removed your ' || what || '.' || why
      || case when p_kind in ('post', 'review')
              then ' You can revise and resubmit it from your profile, or let it go.' else '' end,
      case when p_kind in ('post', 'review') then 'profile.html' end,
      false, 'negative');
    perform log_moderation('remove', p_kind, p_id, author, 'negative',
      left(coalesce(label, ''), 80) || ' (' || removal_reason_label(p_reason)
      || case when p_note is not null then ': ' || p_note else '' end || ')');
    perform reward_moderator('mod_decision', p_kind, p_id, author);
    return 'removed';
  end if;
  raise exception 'Unknown action: %', p_action;
end $$;


revoke execute on function public.moderate_content(text, uuid, text, text, text) from public, anon;
grant execute on function public.moderate_content(text, uuid, text, text, text) to authenticated;


-- ---------- Reports: removing passes the reason along ----------
-- Same as in 2026-10-11-moderation-log.sql, plus the reason and note.
drop function if exists public.resolve_reports(text, uuid, text);
create or replace function public.resolve_reports(p_kind text, p_id uuid, p_action text,
                                                  p_reason text default null, p_note text default null)
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
    return moderate_content(p_kind, p_id, 'remove', p_reason, p_note);
  end if;
  raise exception 'Unknown action: %', p_action;
end $$;
revoke execute on function public.resolve_reports(text, uuid, text, text, text) from public, anon;
grant execute on function public.resolve_reports(text, uuid, text, text, text) to authenticated;


-- ---------- Revise and resubmit ----------
-- Posts it again with the new wording, held for a moderator no matter
-- what (so nobody else sees it until it's approved), and removes the copy.
create or replace function public.resubmit_returned(p_id uuid, p_title text, p_body text)
returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  r returned_content%rowtype;
  new_id uuid;
  tbl text;
begin
  if me is null then raise exception 'Please log in first'; end if;
  select * into r from returned_content where id = p_id and user_id = me;
  if not found then raise exception 'That isn''t waiting for you anymore'; end if;
  p_title := nullif(btrim(coalesce(p_title, '')), '');
  p_body := btrim(coalesce(p_body, ''));
  if p_body = '' then raise exception 'Please write something first'; end if;

  if r.kind = 'post' then
    insert into posts (user_id, title, body, category) values (me, p_title, p_body, r.category)
    returning id into new_id;
    tbl := 'posts';
  else
    if not exists (select 1 from products where id = r.product_id and status = 'approved') then
      raise exception 'That product isn''t available for reviews anymore';
    end if;
    insert into reviews (user_id, product_id, title, body, rating, variation, would_repurchase, holy_grail)
    values (me, r.product_id, coalesce(p_title, 'Review'), p_body, r.rating, r.variation, r.would_repurchase,
            coalesce(r.holy_grail, false))
    returning id into new_id;
    tbl := 'reviews';
  end if;

  -- Always back to the moderators first
  perform set_config('byome.moderating', 'on', true);
  execute format('update %I set held_at = now() where id = $1', tbl) using new_id;
  perform set_config('byome.moderating', 'off', true);

  delete from returned_content where id = p_id;
  return 'held';
end $$;
revoke execute on function public.resubmit_returned(uuid, text, text) from public, anon;
grant execute on function public.resubmit_returned(uuid, text, text) to authenticated;
