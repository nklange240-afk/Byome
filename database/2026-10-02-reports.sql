-- =========================================================
-- byome: members can report posts, comments and reviews
-- Run this once in the Supabase SQL Editor (after 2026-10-02-automod.sql).
--
-- A report never hides anything. It only adds the item to the
-- "Reported by members" list on the Moderate page, where a moderator
-- keeps it or removes it. (If reporting hid things, anyone could hide
-- posts they disagree with.)
-- =========================================================

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('post', 'comment', 'review')),
  -- exactly one of these is set; deleting the content deletes its reports
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'inappropriate', 'misleading', 'other')),
  details text check (char_length(details) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution text check (resolution in ('kept')),
  check ((kind = 'post') = (post_id is not null)
     and (kind = 'comment') = (comment_id is not null)
     and (kind = 'review') = (review_id is not null)),
  -- one report per person per item
  unique (reporter_id, post_id),
  unique (reporter_id, comment_id),
  unique (reporter_id, review_id)
);
create index content_reports_open_idx on public.content_reports (created_at) where resolved_at is null;

alter table public.content_reports enable row level security;
-- You can see your own reports (so the flag shows as reported); moderators see all.
-- Nobody writes to this table directly: only through the functions below.
create policy "Members see their own reports" on public.content_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_moderator()));


-- ---------- Reporting ----------

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
  if tbl is null then raise exception 'That can''t be reported'; end if;

  execute format('select user_id, held_at from %I where id = $1', tbl) into author, held using p_id;
  if author is null then raise exception 'That % no longer exists', p_kind; end if;
  if author = me then raise exception 'You can''t report your own %', p_kind; end if;
  if held is not null then return 'already'; end if;  -- automod is already holding it for a moderator

  -- stop anyone flooding the moderators
  if (select count(*) from content_reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You''ve sent a lot of reports today. Please try again tomorrow.';
  end if;

  insert into content_reports (kind, post_id, comment_id, review_id, reporter_id, reason, details)
  values (p_kind,
          case when p_kind = 'post' then p_id end,
          case when p_kind = 'comment' then p_id end,
          case when p_kind = 'review' then p_id end,
          me, p_reason, nullif(trim(p_details), ''))
  on conflict do nothing
  returning id into new_id;

  return case when new_id is null then 'already' else 'reported' end;
end $$;
revoke execute on function public.report_content(text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;


-- ---------- Moderators: keep it, or remove it ----------

create or replace function public.resolve_reports(p_kind text, p_id uuid, p_action text) returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  col text := case p_kind when 'post' then 'post_id' when 'comment' then 'comment_id' when 'review' then 'review_id' end;
  r record;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  if col is null then raise exception 'Unknown kind: %', p_kind; end if;

  if p_action = 'keep' then
    execute format('update content_reports set resolved_at = now(), resolved_by = $1, resolution = ''kept''
                    where %I = $2 and resolved_at is null', col) using me, p_id;
    return 'kept';
  elsif p_action = 'remove' then
    -- thank everyone who reported it, then remove it (its reports go with it)
    for r in execute format('select distinct reporter_id from content_reports where %I = $1', col) using p_id loop
      perform create_notification(r.reporter_id, me, 'moderation', p_id,  -- (skips the moderator themself)
        'Thanks for your report. A moderator removed the ' || p_kind || ' you flagged.', null);
    end loop;
    return moderate_content(p_kind, p_id, 'remove');
  end if;
  raise exception 'Unknown action: %', p_action;
end $$;
revoke execute on function public.resolve_reports(text, uuid, text) from public, anon;
grant execute on function public.resolve_reports(text, uuid, text) to authenticated;
