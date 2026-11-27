-- =========================================================
-- Byome: automod catches stars used in place of letters, a few more
-- spellings, and members see a heads-up while they write.
--
--   - A star can stand in for a letter: "f*ck", "sh*t", "b*tch" are
--     caught like the full words (the first and last letters still have
--     to be there, so "****" isn't). Stars, dots and dashes between
--     letters were already caught.
--   - New words (swearing, "strong"): eff you, eff off, effing, effin,
--     f you, f off, fvck, fvcking.
--   - automod_check(text): which words in what a member is writing
--     automod will flag, so the site can say so before they post. It only
--     returns words from their own text, never the list itself. Crisis
--     phrases are left out on purpose: someone in crisis shouldn't be
--     nudged to reword what they wrote, or they'd miss the support
--     message (2026-12-30-crisis-support.sql).
--
-- Run in the Supabase SQL Editor BEFORE publishing the site update that
-- came with it. Safe to run again. Paste the whole file with nothing
-- highlighted. Needs 2026-12-30-crisis-support.sql first.
-- =========================================================

insert into public.moderation_words (word, category) values
  ('eff you', 'strong'), ('eff off', 'strong'), ('effing', 'strong'), ('effin', 'strong'),
  ('f you', 'strong'), ('f off', 'strong'), ('fvck', 'strong'), ('fvcking', 'strong')
on conflict (word) do nothing;

-- The pattern for one automod word: repeated letters allowed ("shiiit"),
-- dots, dashes, underscores and stars between letters ("s.h.i.t", whole
-- words only), and now a star in place of any letter but the first and
-- last ("sh*t", "f**k"), and dashes or dots between words ("f-off").
create or replace function public.automod_pattern(p_word text, p_inside boolean) returns text
language sql immutable set search_path to public as $$
  select case when p_inside then '' else '\m' end
      || string_agg(case when c = ' ' then (case when p_inside then '\s+' else '[\s._*-]+' end)
                         when n = 1 or n = len then c || '+'
                         else '(?:' || c || '+|\*)' end,
                    case when p_inside then '' else '[._*-]*' end
                    order by n)
      || case when p_inside then '' else '\M' end
  from (select c, n, char_length(p_word) as len
        from regexp_split_to_table(p_word, '') with ordinality as x(c, n)) s
$$;

-- (the same as in 2026-12-30-crisis-support.sql, with the shared pattern)
create or replace function public.text_is_flagged(p_text text) returns boolean
language plpgsql stable security definer set search_path to public as $$
declare
  t text;
  w record;
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
    if t ~ automod_pattern(w.word, w.match_inside_words) then return true; end if;
  end loop;
  return text_is_crisis(p_text);
end $$;
revoke execute on function public.text_is_flagged(text) from public, anon, authenticated;

-- (the same as in 2026-12-30-crisis-support.sql, with the shared pattern)
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

  t := translate(lower(p_text), '013457@$', 'oieastas');
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

-- While writing: the words in this text that automod will flag, as the
-- member wrote them (at most 5). Crisis phrases are left out on purpose.
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

  t := translate(lower(p_text), '013457@$', 'oieastas');
  for w in select word, match_inside_words from moderation_words loop
    exit when cardinality(found) >= 5;
    m := substring(t from automod_pattern(w.word, w.match_inside_words));
    continue when m is null;
    -- show it as they wrote it (lowercasing and the swaps keep the length)
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

-- Tell the API about the new function straight away
notify pgrst, 'reload schema';
