-- =========================================================
-- Byome: automod for crude emojis.
-- The word list only matches letters, so emojis got through. This adds a
-- second list, of emojis. A post, comment, review, review update or poll
-- with one of them is HELD for a moderator, exactly like a listed word.
-- Every skin tone of an emoji is caught too (🖕🏻 🖕🏿 and so on).
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
--
-- Managing the emoji list later (SQL Editor):
--   insert into moderation_emojis (emoji, note) values ('🍑', 'peach');
--   delete from moderation_emojis where emoji = '🍆';
-- =========================================================


-- ---------- The emoji list ----------
create table if not exists public.moderation_emojis (
  emoji text primary key check (emoji <> '' and emoji !~ '[A-Za-z0-9 ]'),
  note text,                      -- what it is, so the list is readable
  added_at timestamptz not null default now()
);
alter table public.moderation_emojis enable row level security;
drop policy if exists "Moderators can read the emoji list" on public.moderation_emojis;
create policy "Moderators can read the emoji list" on public.moderation_emojis
  for select to authenticated using ((select public.is_moderator()));
drop policy if exists "Moderators can add emojis" on public.moderation_emojis;
create policy "Moderators can add emojis" on public.moderation_emojis
  for insert to authenticated with check ((select public.is_moderator()));
drop policy if exists "Moderators can remove emojis" on public.moderation_emojis;
create policy "Moderators can remove emojis" on public.moderation_emojis
  for delete to authenticated using ((select public.is_moderator()));

insert into public.moderation_emojis (emoji, note) values
  ('🖕', 'middle finger'),
  ('🍆', 'eggplant')
on conflict (emoji) do nothing;


-- ---------- The check (the same as before, plus the emoji list) ----------
create or replace function public.text_is_flagged(p_text text) returns boolean
language plpgsql stable security definer set search_path to public as $$
declare
  t text;
  w record;
  pattern text;
begin
  if p_text is null or p_text = '' then return false; end if;

  -- any listed emoji, anywhere (skin-tone versions start with the same
  -- emoji, so they're caught too)
  if exists (select 1 from moderation_emojis where strpos(p_text, emoji) > 0) then
    return true;
  end if;

  -- lowercase, and undo common swaps: 0->o 1->i 3->e 4->a 5->s 7->t @->a $->s
  t := translate(lower(p_text), '013457@$', 'oieastas');

  for w in select word, match_inside_words from moderation_words loop
    -- "shit" becomes s+h+i+t+ (repeats allowed). Whole words also allow
    -- dots, dashes, underscores and stars between letters.
    select string_agg(case when c = ' ' then '\s+' else c || '+' end,
                      case when w.match_inside_words then '' else '[._*-]*' end
                      order by n)
      into pattern
      from regexp_split_to_table(w.word, '') with ordinality as x(c, n);

    if not w.match_inside_words then
      pattern := '\m' || pattern || '\M';
    end if;
    if t ~ pattern then return true; end if;
  end loop;
  return false;
end $$;
revoke execute on function public.text_is_flagged(text) from public, anon, authenticated;

select emoji, note from public.moderation_emojis order by added_at;
