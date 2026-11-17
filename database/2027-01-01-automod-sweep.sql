-- =========================================================
-- Byome: a sweep of the automod word list, and fewer ways around it.
--
-- Tricks automod now sees through (all words on the list):
--   - "!" for i and "|" for l ("sh!t")
--   - accented letters and look-alike letters from other alphabets ("fück")
--   - invisible characters hidden inside a word
--   - letters spaced apart ("c u n t"), for single words of 4 or more
--     letters only, so short words don't catch ordinary sentences
--
-- Words added (none of them were caught before):
--   - slurs: more racial and ethnic slurs (including Australian, British
--     and South African ones, and older ones), a full sweep of slurs
--     against disabled people and against LGBTQ+ people, incel slurs and
--     other slurs aimed at women, and hate dog whistles
--   - harmful: also the code words and dog whistles pedophiles use
--   - harmful: "drink bleach", "hope you die" and similar, and words used
--     to share sexual material involving children
--   - explicit: "sex", coarse slang for genitals, and porn terms
--   - strong: c-word variants and a few more
-- Left allowed on purpose: milder slang for genitals (fanny, snatch, muff,
-- beaver, coochie), "bloody" and other mild British words, and beauty
-- words like nude(s), orgasm (a blush) and shiitake (an ingredient).
-- Members can still report anything used to hurt someone.
--
-- Run in the Supabase SQL Editor BEFORE publishing the site update that
-- came with it. Safe to run again. Paste the whole file with nothing
-- highlighted. Needs 2026-12-31-automod-stars-and-preview.sql first.
-- =========================================================

insert into public.moderation_words (word, category) values
  -- ---------- Slurs: racial and ethnic ----------
  ('abo', 'offensive'), ('abos', 'offensive'), ('abbo', 'offensive'), ('abbos', 'offensive'),
  ('boong', 'offensive'), ('boongs', 'offensive'), ('wog', 'offensive'), ('wogs', 'offensive'),
  ('pikey', 'offensive'), ('pikeys', 'offensive'), ('kaffir', 'offensive'), ('kaffirs', 'offensive'),
  ('hottentot', 'offensive'), ('hottentots', 'offensive'), ('chinaman', 'offensive'), ('chinamen', 'offensive'),
  ('yellow peril', 'offensive'), ('redskin', 'offensive'), ('redskins', 'offensive'),
  ('injun', 'offensive'), ('injuns', 'offensive'), ('hymie', 'offensive'), ('hymies', 'offensive'),
  ('sheeny', 'offensive'), ('christ killer', 'offensive'), ('christ killers', 'offensive'),
  ('pickaninny', 'offensive'), ('pickaninnies', 'offensive'), ('golliwog', 'offensive'), ('golliwogs', 'offensive'),
  ('uncle tom', 'offensive'), ('tar baby', 'offensive'), ('spearchucker', 'offensive'), ('spear chucker', 'offensive'),
  ('moon cricket', 'offensive'), ('niglet', 'offensive'), ('niglets', 'offensive'),
  ('greaseball', 'offensive'), ('greaseballs', 'offensive'), ('curry muncher', 'offensive'),
  ('dothead', 'offensive'), ('dot head', 'offensive'), ('coolie', 'offensive'), ('coolies', 'offensive'),
  ('wetbacks', 'offensive'), ('zipperheads', 'offensive'), ('jungle bunnies', 'offensive'),
  ('porch monkeys', 'offensive'), ('jigaboos', 'offensive'), ('sambos', 'offensive'), ('darkies', 'offensive'),
  -- ---------- Slurs: against disabled people ----------
  ('mong', 'offensive'), ('mongs', 'offensive'), ('mongy', 'offensive'), ('mongoloids', 'offensive'),
  ('spacker', 'offensive'), ('spackers', 'offensive'), ('spakka', 'offensive'), ('spazz', 'offensive'),
  ('spazzy', 'offensive'), ('spazzes', 'offensive'), ('spazzing', 'offensive'), ('spastics', 'offensive'),
  ('retarted', 'offensive'), ('retardo', 'offensive'), ('retardation', 'offensive'),
  ('libtard', 'offensive'), ('libtards', 'offensive'),
  ('cripple', 'offensive'), ('cripples', 'offensive'), ('window licker', 'offensive'), ('window lickers', 'offensive'),
  ('downie', 'offensive'), ('downies', 'offensive'), ('cretin', 'offensive'), ('cretins', 'offensive'),
  ('schizo', 'offensive'), ('schizos', 'offensive'), ('autist', 'offensive'), ('autists', 'offensive'),
  ('autismo', 'offensive'), ('midget', 'offensive'), ('midgets', 'offensive'),
  ('gimp', 'offensive'), ('gimps', 'offensive'), ('deaf and dumb', 'offensive'), ('short bus', 'offensive'),
  -- ---------- Slurs: against LGBTQ+ people ----------
  ('poof', 'offensive'), ('poofs', 'offensive'), ('poove', 'offensive'), ('pooftah', 'offensive'),
  ('poofters', 'offensive'), ('batty boy', 'offensive'), ('battyboy', 'offensive'), ('batty man', 'offensive'),
  ('battyman', 'offensive'), ('bumboy', 'offensive'), ('bum boy', 'offensive'),
  ('fudge packer', 'offensive'), ('fudgepacker', 'offensive'), ('pillow biter', 'offensive'),
  ('rug muncher', 'offensive'), ('carpet muncher', 'offensive'), ('muff diver', 'offensive'),
  ('lezza', 'offensive'), ('lezzer', 'offensive'), ('lezzie', 'offensive'), ('lezzies', 'offensive'),
  ('troon', 'offensive'), ('troons', 'offensive'), ('trannys', 'offensive'), ('shemales', 'offensive'), ('ladyboys', 'offensive'),
  ('sodomite', 'offensive'), ('sodomites', 'offensive'), ('nancy boy', 'offensive'),
  ('gaylord', 'offensive'), ('gaylords', 'offensive'), ('chi chi man', 'offensive'),
  ('maricon', 'offensive'), ('maricones', 'offensive'), ('joto', 'offensive'), ('jotos', 'offensive'),
  -- ---------- Slurs and insults aimed at women ----------
  ('foid', 'offensive'), ('foids', 'offensive'), ('femoid', 'offensive'), ('femoids', 'offensive'),
  ('roastie', 'offensive'), ('roasties', 'offensive'), ('slapper', 'offensive'), ('slappers', 'offensive'),
  ('bint', 'offensive'), ('bints', 'offensive'), ('munter', 'offensive'), ('munters', 'offensive'),
  ('minger', 'offensive'), ('mingers', 'offensive'),
  -- ---------- Incel slurs and terms ----------
  ('feminoid', 'offensive'), ('feminoids', 'offensive'), ('landwhale', 'offensive'), ('land whale', 'offensive'),
  ('landwhales', 'offensive'), ('subhuman', 'offensive'), ('subhumans', 'offensive'),
  ('ropefuel', 'harmful'), ('rope fuel', 'harmful'), ('beta uprising', 'harmful'),
  -- ---------- Hate dog whistles ----------
  ('white genocide', 'offensive'), ('race traitor', 'offensive'), ('race traitors', 'offensive'),
  ('dindu', 'offensive'), ('dindus', 'offensive'), ('dindu nuffin', 'offensive'), ('sheboon', 'offensive'),
  ('sheboons', 'offensive'), ('shitskin', 'offensive'), ('shitskins', 'offensive'), ('remove kebab', 'offensive'),
  ('groyper', 'offensive'), ('groypers', 'offensive'), ('zog', 'offensive'),
  -- ---------- Harmful ----------
  ('drink bleach', 'harmful'), ('hope you die', 'harmful'), ('die in a fire', 'harmful'),
  ('end yourself', 'harmful'), ('off yourself', 'harmful'), ('rope yourself', 'harmful'),
  -- (sexual material involving children)
  ('loli', 'harmful'), ('lolis', 'harmful'), ('lolicon', 'harmful'), ('shota', 'harmful'),
  ('shotacon', 'harmful'), ('jailbait', 'harmful'), ('pthc', 'harmful'),
  -- (code words and dog whistles pedophiles use; "map", "lolita" and "boy
  -- love" are left out, as they mean ordinary things too)
  ('toddlercon', 'harmful'), ('cunny', 'harmful'), ('cheese pizza', 'harmful'),
  ('kiddie porn', 'harmful'), ('kiddy porn', 'harmful'), ('kiddieporn', 'harmful'), ('kinderporn', 'harmful'),
  ('child porn', 'harmful'), ('childporn', 'harmful'), ('nomap', 'harmful'), ('nomaps', 'harmful'),
  ('minor attracted', 'harmful'), ('minor attraction', 'harmful'), ('boylover', 'harmful'), ('boylovers', 'harmful'),
  ('girllover', 'harmful'), ('girllovers', 'harmful'), ('childlover', 'harmful'), ('childlovers', 'harmful'),
  ('pedobear', 'harmful'), ('hussyfan', 'harmful'), ('raygold', 'harmful'),
  ('cp links', 'harmful'), ('trade cp', 'harmful'), ('trading cp', 'harmful'), ('sell cp', 'harmful'),
  ('selling cp', 'harmful'), ('buy cp', 'harmful'),
  -- ---------- Explicit ----------
  ('sex', 'explicit'), ('clunge', 'explicit'), ('gash', 'explicit'), ('quim', 'explicit'),
  ('punani', 'explicit'), ('punany', 'explicit'), ('poontang', 'explicit'), ('spunk', 'explicit'),
  ('creampie', 'explicit'), ('gangbang', 'explicit'), ('gang bang', 'explicit'), ('bukkake', 'explicit'),
  ('deepthroat', 'explicit'), ('deep throat', 'explicit'), ('fap', 'explicit'), ('fapping', 'explicit'),
  ('masturbate', 'explicit'), ('masturbating', 'explicit'), ('masturbation', 'explicit'),
  ('pornhub', 'explicit'), ('fansly', 'explicit'), ('xvideos', 'explicit'), ('xhamster', 'explicit'),
  -- ---------- Strong ----------
  ('cunty', 'strong'), ('cunting', 'strong'), ('kunt', 'strong'), ('kunts', 'strong'), ('cnut', 'strong'),
  ('gobshite', 'strong'), ('bollox', 'strong'), ('ffs', 'strong'), ('omfg', 'strong'), ('fml', 'strong'),
  ('shitload', 'strong'), ('shitstorm', 'strong'), ('pissy', 'strong')
on conflict (word) do update set category = excluded.category;

-- What automod reads: lowercase, without invisible characters, with
-- accents and look-alike letters made plain, and common swaps undone
-- (0->o 1->i 3->e 4->a 5->s 7->t @->a $->s !->i |->l)
create or replace function public.automod_normalize(p_text text) returns text
language sql immutable set search_path to public as $$
  select translate(
    regexp_replace(lower(p_text), '[\u200B-\u200D\u2060\uFEFF\u00AD]', '', 'g'),
    '013457@$!|àáâãäåāèéêëēìíîïīòóôõöøōùúûüūýÿñçßаеорсухіјѕһԁӏԝɡοαικντυρ',
    'oieastasilaaaaaaaeeeeeiiiiiooooooouuuuuyyncsaeopcyxijshdlwgoaikvtup')
$$;

-- The pattern for one automod word (as in 2026-12-31, plus: a single word
-- of 4 or more letters is also caught with every letter spaced apart,
-- "c u n t", standing on its own. Every letter has to be spaced, so two
-- ordinary words next to each other, like "s picks", aren't caught.)
create or replace function public.automod_pattern(p_word text, p_inside boolean) returns text
language sql immutable set search_path to public as $$
  with letters as (
    select c, n, char_length(p_word) as len
    from regexp_split_to_table(p_word, '') with ordinality as x(c, n)
  ), parts as (
    select
      -- the usual pattern
      (case when p_inside then '' else '\m' end
        || string_agg(case when c = ' ' then (case when p_inside then '\s+' else '[\s._*-]+' end)
                           when n = 1 or n = len then c || '+'
                           else '(?:' || c || '+|\*)' end,
                      case when p_inside then '' else '[._*-]*' end
                      order by n)
        || case when p_inside then '' else '\M' end) as usual,
      -- spaced apart, standing on its own
      ('\m' || string_agg(c || '+', '[\s._*-]+' order by n) || '\M') as spaced,
      max(len) as len
    from letters
  )
  select case when len >= 4 and strpos(p_word, ' ') = 0
              then '(?:' || usual || '|' || spaced || ')' else usual end
  from parts
$$;

-- (the same as in 2026-12-31-automod-stars-and-preview.sql, reading the
-- text the new way)
create or replace function public.text_is_flagged(p_text text) returns boolean
language plpgsql stable security definer set search_path to public as $$
declare
  t text;
  w record;
begin
  if p_text is null or p_text = '' then return false; end if;
  -- any listed emoji, anywhere
  if exists (select 1 from moderation_emojis where strpos(p_text, emoji) > 0) then
    return true;
  end if;
  t := automod_normalize(p_text);
  for w in select word, match_inside_words from moderation_words loop
    if t ~ automod_pattern(w.word, w.match_inside_words) then return true; end if;
  end loop;
  return text_is_crisis(p_text);
end $$;
revoke execute on function public.text_is_flagged(text) from public, anon, authenticated;

create or replace function public.text_flag_reasons(p_text text) returns text[]
language plpgsql stable security definer set search_path to public as $$
declare
  t text;
  w record;
  found text[] := '{}';
begin
  if p_text is null or p_text = '' then return found; end if;
  select coalesce(array_agg(distinct category), '{}') into found
  from moderation_emojis where strpos(p_text, emoji) > 0;

  t := automod_normalize(p_text);
  for w in select word, match_inside_words, category from moderation_words loop
    continue when w.category = any(found);
    if t ~ automod_pattern(w.word, w.match_inside_words) then found := found || w.category; end if;
  end loop;
  -- (a direct crisis phrase is 'crisis_serious', a broad one 'crisis')
  found := found || case text_crisis_level(p_text) when 'direct' then 'crisis_serious' when 'broad' then 'crisis' end;

  return array(select c from unnest(array['crisis_serious', 'crisis', 'offensive', 'harmful', 'explicit', 'strong']) with ordinality as o(c, n)
               where c = any(found) order by n);
end $$;
revoke execute on function public.text_flag_reasons(text) from public, anon, authenticated;

create or replace function public.automod_check(p_text text) returns text[]
language plpgsql stable security definer set search_path to public as $$
declare
  t text;
  w record;
  m text;
  pos int;
  found text[] := '{}';
begin
  if auth.uid() is null or p_text is null or btrim(p_text) = '' then return found; end if;
  p_text := left(p_text, 5000);
  select coalesce(array_agg(distinct emoji), '{}') into found
  from moderation_emojis where strpos(p_text, emoji) > 0;

  t := automod_normalize(p_text);
  for w in select word, match_inside_words from moderation_words loop
    exit when cardinality(found) >= 5;
    m := substring(t from automod_pattern(w.word, w.match_inside_words));
    continue when m is null;
    -- show it as they wrote it, when the reading kept the length
    pos := strpos(t, m);
    if char_length(t) = char_length(p_text) and pos > 0 then m := substr(p_text, pos, char_length(m)); end if;
    -- (one piece per spot: "f*ck-ing", not "f*ck" as well)
    continue when exists (select 1 from unnest(found) f where strpos(lower(f), lower(m)) > 0);
    found := array(select f from unnest(found) f where strpos(lower(m), lower(f)) = 0) || m;
  end loop;
  return found[1:5];
end $$;
revoke execute on function public.automod_check(text) from public, anon;
grant execute on function public.automod_check(text) to authenticated;

-- Crisis phrases read the text the same way (as in
-- 2026-12-30-crisis-support.sql, with automod_normalize)
create or replace function public.text_crisis_level(p_text text) returns text
language plpgsql stable security definer set search_path to public as $$
declare
  t text;
  w record;
  pattern text;
  found text;
begin
  if p_text is null or p_text = '' then return null; end if;
  -- read like automod does, and drop apostrophes
  t := regexp_replace(automod_normalize(p_text), '[''`’‘]', '', 'g');
  for w in select phrase, level from crisis_phrases order by (level = 'direct') desc loop
    continue when found is not null and w.level <> 'direct';
    -- letters may repeat or have dots, dashes or stars between them;
    -- words may have spaces, dashes or dots between them
    select '\m' || string_agg(case when c = ' ' then '[\s._*-]+' else c || '+' end,
                             '[._*-]*' order by n) || '\M'
      into pattern
      from regexp_split_to_table(w.phrase, '') with ordinality as x(c, n);
    pattern := replace(pattern, '[._*-]*[\s._*-]+[._*-]*', '[\s._*-]+');
    if t ~ pattern then
      if w.level = 'direct' then return 'direct'; end if;
      found := 'broad';
      exit;
    end if;
  end loop;
  return found;
end $$;
revoke execute on function public.text_crisis_level(text) from public, anon, authenticated;

-- Tell the API about the changes straight away
notify pgrst, 'reload schema';
