-- =========================================================
-- Byome: opening a notification marks it as read.
-- Clicking a notification (for example, to read a comment) now marks just
-- that one as read, without needing "Mark all as read".
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

create or replace function public.mark_notification_read(p_id uuid) returns void
language sql security definer set search_path to public as $$
  update notifications set read_at = now()
  where id = p_id and user_id = auth.uid() and read_at is null
$$;
revoke execute on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
