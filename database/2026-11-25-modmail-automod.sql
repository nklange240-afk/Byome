-- =========================================================
-- Byome: automod in mod mail.
-- Mod mail is never held (moderators need to see everything), but a
-- message or subject with automod words is hidden behind a note like
-- "This message may contain strong language" and a "Show message" button.
-- To say which kind, each automod word now has a category:
--   strong     swearing ("may contain strong language")
--   explicit   sexual words ("may contain explicit language")
--   offensive  slurs and hateful words ("may contain offensive language")
--   harmful    threats, self-harm and abuse ("may contain harmful language")
-- New words are "strong" unless you say otherwise:
--   insert into moderation_words (word, category) values ('newword', 'explicit');
-- Run in the Supabase SQL Editor AFTER 2026-11-24-visitor-feedback.sql.
-- Safe to run again. Paste the whole file with nothing highlighted. Run it
-- before publishing the site update that came with it.
-- =========================================================

alter table public.moderation_words add column if not exists category text not null default 'strong';
alter table public.moderation_emojis add column if not exists category text not null default 'strong';
alter table public.moderation_words drop constraint if exists moderation_words_category_check;
alter table public.moderation_words add constraint moderation_words_category_check
  check (category in ('strong', 'explicit', 'offensive', 'harmful'));
alter table public.moderation_emojis drop constraint if exists moderation_emojis_category_check;
alter table public.moderation_emojis add constraint moderation_emojis_category_check
  check (category in ('strong', 'explicit', 'offensive', 'harmful'));

-- Sort the existing list (anything not named here stays "strong")
update public.moderation_words set category = 'offensive' where word in (
  'beaner', 'beaners', 'camel jockey', 'ching chong', 'chink', 'chinks', 'chinky', 'coon', 'coons',
  'dago', 'dagos', 'darkie', 'darky', 'dyke', 'dykes', 'fag', 'faggot', 'faggy', 'fags', 'gippo',
  'gook', 'gooks', 'gyppo', 'he she', 'hebe', 'heeb', 'heil hitler', 'homo', 'homos', 'honkey',
  'honky', 'jap', 'japs', 'jigaboo', 'jiggaboo', 'jungle bunny', 'kike', 'kikes', 'kyke', 'ladyboy',
  'lesbo', 'mongoloid', 'muzzie', 'muzzies', 'nigga', 'niggah', 'niggas', 'niggaz', 'nigger',
  'niggers', 'nigglet', 'nigguh', 'paki', 'pakis', 'polack', 'poofter', 'porch monkey', 'rag head',
  'raghead', 'retard', 'retarded', 'retards', 'sambo', 'shemale', 'sieg heil', 'slant eye',
  'slant eyes', 'slanteye', 'spastic', 'spaz', 'spic', 'spick', 'spicks', 'spics', 'squaw', 'tard',
  'tards', 'towel head', 'towelhead', 'trannie', 'trannies', 'tranny', 'wetback', 'white power',
  'wop', 'wops', 'yid', 'yids', 'zipperhead',
  'slut', 'sluts', 'slutty', 'whore', 'thot', 'thots', 'skank', 'skanks', 'skanky', 'slag', 'slags');
update public.moderation_words set category = 'explicit' where word in (
  'blow job', 'blowjob', 'blowjobs', 'boner', 'clit', 'cock', 'cocks', 'cocksucker', 'cum', 'cumshot',
  'dildo', 'dildos', 'hand job', 'handjob', 'hentai', 'jack off', 'jackoff', 'jerk off', 'jerkoff',
  'jizz', 'milf', 'minge', 'onlyfans', 'porn', 'pussies', 'pussy', 'rimjob', 'tit', 'tits', 'titties',
  'wank', 'wanked', 'wanking');
update public.moderation_words set category = 'harmful' where word in (
  'go die', 'hang yourself', 'kill urself', 'kill yourself', 'kill yourselves', 'kys', 'neck yourself',
  'unalive yourself', 'molest', 'molester', 'paedo', 'paedophile', 'pedo', 'pedophile', 'pedos', 'nonce',
  'rape', 'raped', 'rapes', 'raping', 'rapist', 'rapists');
update public.moderation_emojis set category = 'explicit' where emoji = '🍆';

-- Which kinds of automod words a text contains (most serious first), e.g.
-- {offensive,strong}. Empty if none. Matches words exactly the way
-- text_is_flagged() does.
create or replace function public.text_flag_reasons(p_text text) returns text[]
language plpgsql stable security definer set search_path to public as $$
declare
  t text;
  w record;
  pattern text;
  found text[] := '{}';
begin
  if p_text is null or p_text = '' then return found; end if;
  select coalesce(array_agg(distinct category), '{}') into found
  from moderation_emojis where strpos(p_text, emoji) > 0;

  t := translate(lower(p_text), '013457@$', 'oieastas');
  for w in select word, match_inside_words, category from moderation_words loop
    continue when w.category = any(found);
    select string_agg(case when c = ' ' then '\s+' else c || '+' end,
                      case when w.match_inside_words then '' else '[._*-]*' end
                      order by n)
      into pattern
      from regexp_split_to_table(w.word, '') with ordinality as x(c, n);
    if not w.match_inside_words then
      pattern := '\m' || pattern || '\M';
    end if;
    if t ~ pattern then found := found || w.category; end if;
  end loop;

  return array(select c from unnest(array['offensive', 'harmful', 'explicit', 'strong']) with ordinality as o(c, n)
               where c = any(found) order by n);
end $$;
revoke execute on function public.text_flag_reasons(text) from public, anon, authenticated;

-- "may contain offensive and strong language"
create or replace function public.flag_phrase(p_flags text[]) returns text
language sql immutable set search_path to public as $$
  select case
    when coalesce(cardinality(p_flags), 0) = 0 then null
    when cardinality(p_flags) = 1 then 'may contain ' || p_flags[1] || ' language'
    else 'may contain ' || array_to_string(p_flags[1:cardinality(p_flags) - 1], ', ')
         || ' and ' || p_flags[cardinality(p_flags)] || ' language' end
$$;


-- ---------- Mod mail remembers what automod found ----------
alter table public.modmail_messages add column if not exists flags text[] not null default '{}';
alter table public.modmail_threads add column if not exists subject_flags text[] not null default '{}';

create or replace function public.modmail_message_flags() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  new.flags := text_flag_reasons(new.body);
  return new;
end $$;
drop trigger if exists modmail_messages_flags on public.modmail_messages;
create trigger modmail_messages_flags before insert or update of body on public.modmail_messages
for each row execute function public.modmail_message_flags();

create or replace function public.modmail_subject_flags() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  new.subject_flags := text_flag_reasons(new.subject);
  return new;
end $$;
drop trigger if exists modmail_threads_subject_flags on public.modmail_threads;
create trigger modmail_threads_subject_flags before insert or update of subject on public.modmail_threads
for each row execute function public.modmail_subject_flags();

-- Messages already sent
update public.modmail_messages set flags = text_flag_reasons(body);
update public.modmail_threads set subject_flags = text_flag_reasons(subject);

-- Notifications about mod mail don't repeat a flagged subject
create or replace function public.notify_modmail(p_actor uuid, p_thread uuid, p_message text) returns void
language plpgsql security definer set search_path to public as $$
declare
  m uuid;
  phrase text := flag_phrase(text_flag_reasons(p_message));
  msg text := case when phrase is null then p_message
                   else 'New mod mail. Its subject ' || phrase || ', so it''s hidden here.' end;
begin
  for m in select id from profiles where is_moderator and deleted_at is null loop
    if m is distinct from p_actor then
      insert into notifications (user_id, actor_id, type, ref_id, message, link)
      values (m, p_actor, 'modmail', p_thread, msg, 'modmail.html?thread=' || p_thread);
    end if;
  end loop;
end $$;
revoke execute on function public.notify_modmail(uuid, uuid, text) from public, anon, authenticated;

-- The list and one conversation, now with what automod found
create or replace function public.modmail_list(p_mine boolean default false) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  mod boolean := is_moderator() and not p_mine;
begin
  if me is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'kind', t.kind, 'subject', t.subject, 'status', t.status, 'last_from', t.last_from,
      'created_at', t.created_at, 'updated_at', t.updated_at,
      'member', case when mod then (select username from profiles where id = t.user_id) end,
      'from_visitor', t.from_visitor,
      'mine', t.user_id = me,
      'subject_flags', t.subject_flags,
      'about', case when mod then (select username from profiles where id = t.about_user) end,
      'count', (select count(*) from modmail_messages m where m.thread_id = t.id))
      order by (t.status = 'open' and t.last_from = 'member' and mod) desc, t.updated_at desc)
    from modmail_threads t
    where (mod or t.user_id = me)
  ), '[]'::jsonb);
end $$;

create or replace function public.modmail_thread(p_thread uuid) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  th modmail_threads%rowtype;
  mod boolean;
begin
  if me is null then return null; end if;
  select * into th from modmail_threads where id = p_thread;
  if not found then return null; end if;
  mod := is_moderator();
  if not mod and th.user_id is distinct from me then return null; end if;
  return jsonb_build_object(
    'id', th.id, 'kind', th.kind, 'subject', th.subject, 'status', th.status, 'page', th.page,
    'created_at', th.created_at, 'mine', th.user_id = me, 'as_mod', mod and th.user_id is distinct from me,
    'member', (select username from profiles where id = th.user_id),
    'from_visitor', th.from_visitor,
    'subject_flags', th.subject_flags,
    'contact', case when mod then th.contact end,
    'about', case when mod then (select username from profiles where id = th.about_user) end,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'body', m.body, 'created_at', m.created_at, 'from_mods', m.from_mods,
        'mine', m.sender_id = me,
        'flags', m.flags,
        'sender', case when m.from_mods and not mod then 'Byome moderators'
                       when m.sender_id is null and th.from_visitor then 'A visitor'
                       else (select username from profiles where id = m.sender_id) end)
        order by m.created_at)
      from modmail_messages m where m.thread_id = th.id), '[]'::jsonb));
end $$;
