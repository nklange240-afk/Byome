-- A colored ring around each member's profile picture. Gold unless they
-- pick another color on Edit profile. Run once in the Supabase SQL Editor
-- (after 2026-10-03-profiles.sql). The color list must match RING_COLORS
-- in profile-fields.js.
alter table public.profiles add column avatar_ring text not null default 'gold'
  check (avatar_ring in ('gold', 'leaf', 'cream', 'rose', 'lavender', 'sky', 'terracotta'));

create or replace function public.set_my_avatar_ring(p_color text) returns void
language plpgsql security definer set search_path to public as $$
begin
  if auth.uid() is null then raise exception 'Please log in first'; end if;
  update profiles set avatar_ring = p_color where id = auth.uid();
end $$;
revoke execute on function public.set_my_avatar_ring(text) from public, anon;
grant execute on function public.set_my_avatar_ring(text) to authenticated;
