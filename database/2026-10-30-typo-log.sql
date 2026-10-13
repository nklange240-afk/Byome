-- =========================================================
-- Byome: a log of the typos members spot, with rewards.
--  - Each typo you credit earns the member 25 Byome points.
--  - 1st typo: "Well Spotted", with Gus the asparagus beetle (a companion
--    that sits on a small pot). 5 typos: "Fresh Eyes". 25 typos: "Typo Hero".
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. (Needs the companion files from before.)
--
-- Credit a typo (the description is optional, just for your records):
--   select public.credit_typo('their-username', 'Recieve on the shop page');
-- Undo the last typo credited to someone (takes the points back; any
-- achievements stay):
--   select public.uncredit_last_typo('their-username');
-- See the log:
--   select p.username, t.note, t.created_at from typo_reports t join profiles p on p.id = t.user_id order by t.created_at desc;
-- Change the points later with, for example:
--   update point_rules set biome_points = 30 where action = 'typo_found';
-- =========================================================


-- ---------- The Asparagus beetle, Gus (sits on small pots, like the Ladybug) ----------
insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values ('spotted-beetle', 'companion', 'small', 'Asparagus beetle',
        'He goes by Gus, and he has sharp eyes for typos, just like you. Thanks for helping keep Byome tidy!',
        'uncommon', null, 'biome-assets/companion-asparagus-beetle.png', 3, 1)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, image = excluded.image, max_per_member = excluded.max_per_member;


-- ---------- Points and achievements ----------
insert into public.point_rules (action, community_points, biome_points, delay_hours, label, notify, description)
values ('typo_found', 0, 25, 0, 'Spotting a typo', true,
        'For each typo you spot and report on the site.')
on conflict (action) do nothing;

insert into public.achievements (key, name, description, reward_item, sort_order) values
  ('well-spotted', 'Well Spotted', 'Spotted a typo on Byome and helped tidy it up.', 'spotted-beetle', 23),
  ('fresh-eyes', 'Fresh Eyes', 'Spotted 5 typos on Byome.', null, 24),
  ('typo-hero', 'Typo Hero', 'Spotted 25 typos on Byome. Every word thanks you!', null, 25)
on conflict (key) do nothing;
update public.achievements set reward_item = 'spotted-beetle' where key = 'well-spotted' and reward_item is null;


-- ---------- The log (private: only the functions below use it) ----------
create table if not exists public.typo_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists typo_reports_user_idx on public.typo_reports (user_id);
alter table public.typo_reports enable row level security;
revoke all on public.typo_reports from anon, authenticated;


-- ---------- Crediting a typo (SQL Editor only) ----------
create or replace function public.credit_typo(p_username text, p_note text default null) returns text
language plpgsql security definer set search_path to public as $$
declare
  uid uuid;
  typo_id uuid;
  total int;
  earned text[] := '{}';
begin
  select id into uid from profiles where lower(username) = lower(trim(p_username)) and deleted_at is null;
  if uid is null then return 'No member called "' || p_username || '". Check the spelling.'; end if;

  -- (the exact time, so "the last one" is always clear, even for several in one go)
  insert into typo_reports (user_id, note, created_at) values (uid, nullif(trim(p_note), ''), clock_timestamp()) returning id into typo_id;
  perform award_points(uid, 'typo_found', 'typo', typo_id);

  select count(*) into total from typo_reports where user_id = uid;
  if total >= 1 and grant_achievement(uid, 'well-spotted') then earned := earned || 'Well Spotted'::text; end if;
  if total >= 5 and grant_achievement(uid, 'fresh-eyes') then earned := earned || 'Fresh Eyes'::text; end if;
  if total >= 25 and grant_achievement(uid, 'typo-hero') then earned := earned || 'Typo Hero'::text; end if;

  return 'Done: ' || p_username || ' has now spotted ' || total || case when total = 1 then ' typo' else ' typos' end
    || ' and earned their points'
    || case when cardinality(earned) > 0 then ', plus "' || array_to_string(earned, '" and "') || '"' else '' end || '.';
end $$;
revoke execute on function public.credit_typo(text, text) from public, anon, authenticated;

create or replace function public.uncredit_last_typo(p_username text) returns text
language plpgsql security definer set search_path to public as $$
declare
  uid uuid;
  last_typo typo_reports%rowtype;
begin
  select id into uid from profiles where lower(username) = lower(trim(p_username));
  if uid is null then return 'No member called "' || p_username || '". Check the spelling.'; end if;
  select * into last_typo from typo_reports where user_id = uid order by created_at desc limit 1;
  if not found then return p_username || ' has no typos in the log.'; end if;

  update point_ledger set revoked_at = now()
  where user_id = uid and action = 'typo_found' and ref_id = last_typo.id and revoked_at is null;
  delete from typo_reports where id = last_typo.id;
  return 'Removed ' || p_username || '''s last typo' || coalesce(' ("' || last_typo.note || '")', '')
    || ' and its points. They now have ' || (select count(*) from typo_reports where user_id = uid) || ' in the log.';
end $$;
revoke execute on function public.uncredit_last_typo(text) from public, anon, authenticated;

select key, name, reward_item from public.achievements where key in ('well-spotted', 'fresh-eyes', 'typo-hero') order by sort_order;
