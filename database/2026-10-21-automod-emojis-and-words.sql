-- =========================================================
-- Byome: automod for crude emojis, plus more words.
-- The word list only matches letters, so emojis got through. This adds a
-- second list, of emojis. A post, comment, review, review update or poll
-- with one of them is HELD for a moderator, exactly like a listed word.
-- Every skin tone of an emoji is caught too (🖕🏻 🖕🏿 and so on).
-- It also adds more words to the word list: misspellings people use to
-- dodge the filter, more profanity, sexual terms, less common slurs and
-- threats. Words that are also everyday or beauty words were left off
-- (see the note at the end of that section).
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


-- ---------- More words ----------
-- Caught even inside longer words
insert into public.moderation_words (word, match_inside_words) values
  ('cocksucker', true), ('motherfucker', true), ('fck', true),
  ('phuck', true), ('biatch', true), ('beyotch', true), ('arsehole', true),
  ('dickwad', true), ('assclown', true), ('asswipe', true)
on conflict (word) do nothing;

-- Whole words only
insert into public.moderation_words (word) values
  -- dodging the filter
  ('fuk'), ('fuks'), ('fukk'), ('fuking'), ('fukker'), ('fukked'), ('fuq'), ('fk'), ('fking'), ('fkin'), ('fkn'), ('fukin'), ('fucc'), ('phuk'),
  ('sht'), ('btch'), ('biotch'), ('gtfo'), ('mofo'),
  -- profanity
  ('dipshit'), ('horseshit'), ('shithole'), ('shitholes'), ('shitshow'), ('batshit'),
  ('apeshit'), ('chickenshit'), ('shitbag'), ('shitface'), ('dickface'), ('dickheads'),
  ('asshat'), ('asshats'), ('douchebag'), ('douchebags'), ('wank'), ('wanking'), ('wanked'),
  ('tosser'), ('tossers'), ('bellend'), ('knobhead'), ('pisshead'), ('skank'), ('skanks'),
  ('skanky'), ('slag'), ('slags'), ('thot'), ('thots'), ('cuck'), ('minge'),
  ('jackoff'), ('jerkoff'), ('jack off'), ('jerk off'),
  -- sexual
  ('blowjob'), ('blowjobs'), ('blow job'), ('handjob'), ('hand job'), ('rimjob'),
  ('dildo'), ('dildos'), ('clit'), ('boner'), ('milf'), ('hentai'), ('cumshot'),
  ('onlyfans'),
  -- slurs
  ('nigguh'), ('niggah'), ('nigglet'), ('jigaboo'), ('jiggaboo'), ('porch monkey'),
  ('jungle bunny'), ('sambo'), ('darkie'), ('darky'), ('zipperhead'), ('slanteye'),
  ('slant eye'), ('slant eyes'), ('ching chong'), ('chinky'), ('jap'), ('japs'),
  ('spick'), ('spicks'), ('camel jockey'), ('towel head'), ('rag head'), ('muzzie'),
  ('muzzies'), ('yid'), ('yids'), ('heeb'), ('hebe'), ('kyke'), ('faggy'), ('poofter'),
  ('lesbo'), ('homo'), ('homos'), ('trannie'), ('ladyboy'), ('he she'), ('tard'),
  ('tards'), ('spaz'), ('spastic'), ('mongoloid'), ('gyppo'), ('gippo'), ('wop'),
  ('wops'), ('dago'), ('dagos'), ('polack'), ('squaw'), ('honky'), ('honkey'),
  -- hate
  ('heil hitler'), ('sieg heil'), ('white power'),
  -- threats and harassment
  ('raping'), ('rapes'), ('rapists'), ('pedo'), ('pedos'), ('pedophile'), ('paedo'),
  ('paedophile'), ('nonce'), ('molest'), ('molester'), ('kill yourselves'),
  ('neck yourself'), ('hang yourself'), ('unalive yourself'), ('go die')
on conflict (word) do nothing;
-- Left off on purpose, because they're also everyday or beauty words (add
-- any of them with the line at the top of 2026-10-02-automod.sql if they
-- become a problem): hoe/hoes (garden tool), douche (a hygiene product),
-- slant (slanted brushes and tweezers), redskin (potatoes), cracker, poof,
-- negro, gypsy/gyp, lmfao, fcuk (a fragrance brand), cumming (a surname),
-- nudes (nude palettes), boobs, nipple, anal, horny, orgasm (a blush shade).


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

select (select count(*) from public.moderation_emojis) as emojis,
       (select count(*) from public.moderation_words) as words;
