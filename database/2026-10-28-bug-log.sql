-- =========================================================
-- Byome: a log of the bugs members spot, with rewards.
--  - Each bug you credit earns the member 50 Byome points.
--  - 1st bug: "Bug Finder" (and its Ladybug). 5 bugs: "Bug Watcher".
--    10 bugs: "Entomologist". (Their reward items come later.)
--  - Anyone already given Bug Finder has that bug added to the log, and
--    gets their 50 points now.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
--
-- Credit a bug (the description is optional, just for your records):
--   select public.credit_bug('their-username', 'Product dropdown jumped to the bottom');
-- Undo the last bug credited to someone (takes the points back; any
-- achievements stay):
--   select public.uncredit_last_bug('their-username');
-- See the log:
--   select p.username, b.note, b.created_at from bug_reports b join profiles p on p.id = b.user_id order by b.created_at desc;
-- Change the points later with, for example:
--   update point_rules set biome_points = 75 where action = 'bug_found';
-- =========================================================


-- ---------- Points and achievements ----------
insert into public.point_rules (action, community_points, biome_points, delay_hours, label, notify, description)
values ('bug_found', 0, 50, 0, 'Spotting a bug', true,
        'For each bug you spot and report that a moderator confirms.')
on conflict (action) do nothing;

insert into public.achievements (key, name, description, sort_order) values
  ('bug-watcher', 'Bug Watcher', 'Spotted 5 bugs and helped make Byome better for everyone.', 21),
  ('entomologist', 'Entomologist', 'Spotted 10 bugs. A true expert in Byome''s creepy-crawlies!', 22)
on conflict (key) do nothing;


-- ---------- The log (private: only the functions below use it) ----------
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists bug_reports_user_idx on public.bug_reports (user_id);
alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from anon, authenticated;


-- ---------- Crediting a bug (SQL Editor only) ----------
create or replace function public.credit_bug(p_username text, p_note text default null) returns text
language plpgsql security definer set search_path to public as $$
declare
  uid uuid;
  bug_id uuid;
  total int;
  earned text[] := '{}';
begin
  select id into uid from profiles where lower(username) = lower(trim(p_username)) and deleted_at is null;
  if uid is null then return 'No member called "' || p_username || '". Check the spelling.'; end if;

  insert into bug_reports (user_id, note) values (uid, nullif(trim(p_note), '')) returning id into bug_id;
  perform award_points(uid, 'bug_found', 'bug', bug_id);

  select count(*) into total from bug_reports where user_id = uid;
  if total >= 1 and grant_achievement(uid, 'bug-finder') then earned := earned || 'Bug Finder'::text; end if;
  if total >= 5 and grant_achievement(uid, 'bug-watcher') then earned := earned || 'Bug Watcher'::text; end if;
  if total >= 10 and grant_achievement(uid, 'entomologist') then earned := earned || 'Entomologist'::text; end if;

  return 'Done: ' || p_username || ' has now spotted ' || total || case when total = 1 then ' bug' else ' bugs' end
    || ' and earned their points'
    || case when cardinality(earned) > 0 then ', plus "' || array_to_string(earned, '" and "') || '"' else '' end || '.';
end $$;
revoke execute on function public.credit_bug(text, text) from public, anon, authenticated;

create or replace function public.uncredit_last_bug(p_username text) returns text
language plpgsql security definer set search_path to public as $$
declare
  uid uuid;
  last_bug bug_reports%rowtype;
begin
  select id into uid from profiles where lower(username) = lower(trim(p_username));
  if uid is null then return 'No member called "' || p_username || '". Check the spelling.'; end if;
  select * into last_bug from bug_reports where user_id = uid order by created_at desc limit 1;
  if not found then return p_username || ' has no bugs in the log.'; end if;

  update point_ledger set revoked_at = now()
  where user_id = uid and action = 'bug_found' and ref_id = last_bug.id and revoked_at is null;
  delete from bug_reports where id = last_bug.id;
  return 'Removed ' || p_username || '''s last bug' || coalesce(' ("' || last_bug.note || '")', '')
    || ' and its points. They now have ' || (select count(*) from bug_reports where user_id = uid) || ' in the log.';
end $$;
revoke execute on function public.uncredit_last_bug(text) from public, anon, authenticated;


-- ---------- Members already given Bug Finder by hand ----------
-- Their bug goes in the log (dated when they got the achievement) and they
-- get its 50 points now.
do $$
declare
  r record;
  bug_id uuid;
begin
  for r in
    select ua.user_id, ua.earned_at from user_achievements ua
    join profiles p on p.id = ua.user_id and p.deleted_at is null
    where ua.achievement_key = 'bug-finder'
      and not exists (select 1 from bug_reports b where b.user_id = ua.user_id)
  loop
    insert into bug_reports (user_id, note, created_at)
    values (r.user_id, 'Spotted before the bug log started', r.earned_at)
    returning id into bug_id;
    perform award_points(r.user_id, 'bug_found', 'bug', bug_id);
  end loop;
end $$;

select p.username, count(*) as bugs_spotted
from public.bug_reports b join public.profiles p on p.id = b.user_id
group by p.username order by bugs_spotted desc;
