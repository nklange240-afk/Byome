-- =========================================================
-- Byome: the beta tester list, for "Beta Testing: Sugar and Spice".
--
-- Add a tester by typing their Byome username, either way:
--   - Supabase Table Editor: open beta_testers, Insert row, fill in
--     username (and a note if you like). The rest fills itself in.
--   - SQL Editor: insert into public.beta_testers (username) values ('their-username');
-- Usernames can be typed in any capitals; the list stores them exactly as
-- they are on Byome. If no member has that username, it says so and
-- nothing is added. If a tester changes their username later, the list
-- updates by itself.
-- Remove a tester: delete their row (Table Editor), or
--   delete from public.beta_testers where username = 'their-username';
--
-- Only you see the list (in Supabase). On the site, members can only ask
-- "am I a beta tester?" about themselves.
--
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================

create table if not exists public.beta_testers (
  username text not null,
  user_id uuid primary key references public.profiles(id) on delete cascade,
  wave smallint not null default 1 check (wave between 1 and 9),
  note text check (char_length(note) <= 300),
  added_at timestamptz not null default now()
);
create unique index if not exists beta_testers_username_idx on public.beta_testers (lower(username));
alter table public.beta_testers enable row level security;
-- (no policies: nobody on the site can read or change the list directly)

-- Fill in the member from the username typed in, with their exact spelling
create or replace function public.beta_tester_fill() returns trigger
language plpgsql security definer set search_path to public as $$
declare p profiles%rowtype;
begin
  select * into p from profiles where lower(username) = lower(btrim(new.username)) and deleted_at is null;
  if not found then
    raise exception 'No Byome member is called "%". Check the spelling (it''s the name on their profile).', btrim(new.username);
  end if;
  if tg_op = 'INSERT' and exists (select 1 from beta_testers where user_id = p.id) then
    raise exception '% is already a beta tester.', p.username;
  end if;
  new.user_id := p.id;
  new.username := p.username;
  return new;
end $$;
drop trigger if exists beta_testers_fill on public.beta_testers;
create trigger beta_testers_fill before insert or update of username on public.beta_testers
  for each row execute function public.beta_tester_fill();

-- Keep the list's usernames up to date when a tester changes theirs
create or replace function public.beta_tester_rename() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  update beta_testers set username = new.username where user_id = new.id;
  return new;
end $$;
drop trigger if exists profiles_beta_tester_rename on public.profiles;
create trigger profiles_beta_tester_rename after update of username on public.profiles
  for each row when (old.username is distinct from new.username)
  execute function public.beta_tester_rename();

-- "Am I a beta tester?" (the site uses this to show the beta event)
create or replace function public.is_beta_tester() returns boolean
language sql stable security definer set search_path to public as $$
  select exists (select 1 from beta_testers where user_id = auth.uid())
$$;
revoke execute on function public.is_beta_tester() from public, anon;
grant execute on function public.is_beta_tester() to authenticated;

-- Check: everyone on the list
select username, wave, note, added_at from public.beta_testers order by added_at;
