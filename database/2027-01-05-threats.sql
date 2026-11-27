-- =========================================================
-- Byome: threats and urges to hurt other people.
--
--   - Threats aimed at someone ("I'm going to kill you", "I'll hurt you",
--     "I know where you live") are harmful words: held for moderators.
--   - Urges to hurt others ("I want to hurt somebody", "I want to kill
--     someone") are serious crisis phrases: held, the writer gets the
--     support message (helplines like 988 help with urges to harm others
--     too), and moderators get the red "Serious" alert, notification and
--     email, which now mention hurting others.
--   - Automod now drops apostrophes when reading, as the crisis list
--     already did, so "I'll" and "I'm" can be matched.
--   - Kept first-person on purpose: a bare "hurt someone" would catch
--     beauty talk like "this could hurt someone with sensitive skin".
--
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2027-01-01-automod-sweep.sql first.
-- =========================================================

-- Threats aimed at someone (apostrophes left out: "ill", "im")
insert into public.moderation_words (word, category) values
  ('i will kill you', 'harmful'), ('ill kill you', 'harmful'), ('im going to kill you', 'harmful'),
  ('im gonna kill you', 'harmful'), ('going to kill you', 'harmful'), ('gonna kill you', 'harmful'),
  ('want to kill you', 'harmful'), ('i could kill you', 'harmful'),
  ('i will hurt you', 'harmful'), ('ill hurt you', 'harmful'), ('im going to hurt you', 'harmful'),
  ('im gonna hurt you', 'harmful'), ('going to hurt you', 'harmful'), ('gonna hurt you', 'harmful'),
  ('want to hurt you', 'harmful'), ('i know where you live', 'harmful'), ('watch your back', 'harmful')
on conflict (word) do update set category = excluded.category;

-- Urges to hurt others: serious crisis phrases
insert into public.crisis_phrases (phrase, level) values
  ('want to hurt somebody', 'direct'), ('want to hurt someone', 'direct'), ('want to hurt people', 'direct'),
  ('wanna hurt somebody', 'direct'), ('wanna hurt someone', 'direct'), ('wanna hurt people', 'direct'),
  ('going to hurt somebody', 'direct'), ('going to hurt someone', 'direct'), ('going to hurt people', 'direct'),
  ('gonna hurt somebody', 'direct'), ('gonna hurt someone', 'direct'), ('gonna hurt people', 'direct'),
  ('want to kill somebody', 'direct'), ('want to kill someone', 'direct'), ('want to kill people', 'direct'),
  ('want to kill everyone', 'direct'), ('wanna kill somebody', 'direct'), ('wanna kill someone', 'direct'),
  ('wanna kill people', 'direct'), ('wanna kill everyone', 'direct'),
  ('going to kill somebody', 'direct'), ('going to kill someone', 'direct'), ('going to kill people', 'direct'),
  ('going to kill everyone', 'direct'), ('gonna kill somebody', 'direct'), ('gonna kill someone', 'direct'),
  ('gonna kill people', 'direct'), ('gonna kill everyone', 'direct'),
  ('urge to hurt', 'direct'), ('urges to hurt', 'direct'), ('thoughts of hurting', 'direct'),
  ('thoughts of killing', 'direct'), ('shoot up the school', 'direct'), ('shoot up a school', 'direct'),
  ('shoot up my school', 'direct')
on conflict (phrase) do update set level = excluded.level;

-- (as in 2027-01-01-automod-sweep.sql, plus: apostrophes are dropped, so
-- "I'll" reads as "ill" and "I'm" as "im")
-- What automod reads: lowercase, without invisible characters, with
-- accents and look-alike letters made plain, and common swaps undone
-- (0->o 1->i 3->e 4->a 5->s 7->t @->a $->s !->i |->l)
create or replace function public.automod_normalize(p_text text) returns text
language sql immutable set search_path to public as $$
  select translate(
    regexp_replace(lower(p_text), '[\u200B-\u200D\u2060\uFEFF\u00AD''`\u2019\u2018]', '', 'g'),
    '013457@$!|àáâãäåāèéêëēìíîïīòóôõöøōùúûüūýÿñçßаеорсухіјѕһԁӏԝɡοαικντυρ',
    'oieastasilaaaaaaaeeeeeiiiiiooooooouuuuuyyncsaeopcyxijshdlwgoaikvtup')
$$;

-- (the same as in 2026-12-30-crisis-support.sql, except that the
-- notification and email also mention hurting others)
-- Send the support (or, if it was sent in the last day, just tell the
-- moderators again). p_level is 'direct' or 'broad'. Never stops the post
-- or message from saving.
create or replace function public.crisis_respond(p_user uuid, p_kind text, p_ref uuid, p_level text) returns void
language plpgsql security definer set search_path to public as $$
declare
  name text;
  recent crisis_alerts%rowtype;
  t uuid;
  what text := case p_kind when 'review_update' then 'a review update' when 'bio' then 'their bio'
                           when 'modmail' then 'mod mail' else 'a ' || p_kind end;
  sent boolean := false;
  serious boolean := p_level = 'direct';
  result text;
begin
  if p_user is null then return; end if;
  select username into name from profiles where id = p_user and deleted_at is null;
  if not found then return; end if;

  select * into recent from crisis_alerts
  where user_id = p_user and message_sent and created_at > now() - interval '1 day'
  order by created_at desc limit 1;

  if recent.id is null then
    if p_kind = 'modmail' then
      t := p_ref;   -- answered in the same conversation
    else
      insert into modmail_threads (user_id, kind, subject, urgent, last_from)
      values (p_user, 'message', (select subject from crisis_settings), true, 'member')
      returning id into t;
    end if;
    -- (a moment after whatever was just written, so it shows below it.
    -- The conversation still counts as the member's turn, so it stays at
    -- the top of the moderators' list as "Needs a reply" until one of them
    -- replies or closes it.)
    insert into modmail_messages (thread_id, sender_id, from_mods, body, created_at)
    values (t, null, true, crisis_support_message(name, p_kind), clock_timestamp());
    update modmail_threads set urgent = true, status = 'open', updated_at = now(), last_from = 'member' where id = t;
    insert into notifications (user_id, actor_id, type, ref_id, message, link)
    values (p_user, null, 'modmail', t, 'The Byome moderators sent you a message: "' || left((select subject from crisis_settings), 60) || '".',
            'modmail.html?thread=' || t);
    sent := true;
  else
    t := coalesce(recent.thread_id, p_ref);
    update modmail_threads set urgent = true, status = 'open', updated_at = now(), last_from = 'member' where id = t;
  end if;

  insert into crisis_alerts (user_id, kind, ref_id, thread_id, message_sent, level)
  values (p_user, p_kind, p_ref, t, sent, case when serious then 'direct' else 'broad' end);

  perform notify_modmail(null, t,
    case when serious
      -- (worded so the notification itself doesn't trip the crisis list)
      then 'Serious: automod caught direct language about suicide, self-injury or hurting others in ' || what || ' from ' || name || '. '
      else 'Urgent, but often a false alarm: automod caught a phrase that can mean someone is struggling in ' || what || ' from ' || name || '. ' end
    || case when sent then 'Support resources were sent to them.' else 'Support resources were already sent today.' end);

  -- Email the inbox (same daily limits as urgent mod mail, except that a
  -- serious one isn't held back by the 3-a-day limit for one member).
  -- Never what they wrote.
  if (select count(*) from modmail_threads where urgent_emailed_at > now() - interval '1 day') < 20
     and (serious or (select count(*) from modmail_threads where urgent_emailed_at > now() - interval '1 day' and user_id = p_user) < 3) then
    result := email_byome_inbox(
      case when serious then 'SERIOUS: possible crisis on Byome' else 'Possible crisis on Byome (often a false alarm)' end,
      case when serious
        then 'Automod caught direct language about suicide, self-harm or hurting others, or a specific method, in ' || what || ' from ' || name || '. '
             || 'Please treat this as serious.'
        else 'Automod caught a phrase that can mean someone is struggling, in ' || what || ' from ' || name || '. '
             || 'Phrases like this are often said casually, so this is likely a false alarm, but it may be someone who is really struggling.' end
      || E'\n\n'
      || case when sent then 'They were sent support resources in mod mail.' else 'They were already sent support resources today.' end
      || case when p_kind not in ('modmail') then ' What they wrote is held until a moderator reviews it.' else '' end || E'\n\n'
      || 'What they wrote isn''t included here. Read it on Byome only if you''re prepared to:' || E'\n'
      || 'https://byome.xyz/modmail.html?thread=' || t || E'\n\n'
      || 'If someone may be in immediate danger, contact emergency services.');
    if result like 'Sent%' then update modmail_threads set urgent_emailed_at = now() where id = t; end if;
  end if;
exception when others then
  -- (support is a bonus: never block what the member wrote)
  raise warning 'crisis_respond: %', sqlerrm;
end $$;
revoke execute on function public.crisis_respond(uuid, text, uuid, text) from public, anon, authenticated;

-- Tell the API about the changes straight away
notify pgrst, 'reload schema';
