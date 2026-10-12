-- =========================================================
-- Byome: members can edit their own comments (to fix a typo, say).
-- Edits are checked by automod just like new comments: a comment that
-- gains a blocked word is held for a moderator, and a held comment stays
-- held until a moderator decides. Edited comments show "edited".
-- Only the text can change, never which post or reply it belongs to.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole
-- file with nothing highlighted.
-- =========================================================

alter table public.comments add column if not exists edited_at timestamptz;

-- Members can edit their own comments
drop policy if exists "Members can edit their own comments" on public.comments;
create policy "Members can edit their own comments" on public.comments for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ...but only the text (and when it was edited)
create or replace function public.lock_comment_fields() returns trigger
language plpgsql set search_path to public as $$
begin
  if new.user_id is distinct from old.user_id
     or new.post_id is distinct from old.post_id
     or new.parent_id is distinct from old.parent_id
     or new.created_at is distinct from old.created_at then
    raise exception 'That part of a comment can''t be changed';
  end if;
  return new;
end $$;
drop trigger if exists comments_lock_fields on public.comments;
create trigger comments_lock_fields before update on public.comments
  for each row execute function public.lock_comment_fields();

-- (Automod already checks comments on every insert and update, through
-- the comments_automod trigger, and alerts moderators when one is held.)
