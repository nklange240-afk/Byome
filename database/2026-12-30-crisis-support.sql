-- =========================================================
-- Byome: support for members who may be in crisis.
--
-- When someone writes a phrase that can mean they're in a mental health
-- crisis ("I want to die", "kms", "sewer slide"...):
--   - Posts, comments, reviews and review updates are held, as automod
--     does with other words. The author sees "Paused while a moderator
--     checks in. You're not in trouble." instead of the usual note.
--   - A new bio is held too, and stays hidden until a moderator approves
--     it (the profile keeps showing the old one). From now on this goes
--     for ANY bio automod flags, not only crisis phrases: before, those
--     bios were simply refused.
--   - Mod mail is never held, but the member gets the same support.
--   - The member gets a mod mail message, "Some support, in case you need
--     it", with free helplines (US and Canada 988, UK and Ireland
--     Samaritans 116 123, Australia Lifeline 13 11 14, findahelpline.com
--     for everywhere else). It stays in their mod mail history, so
--     moderators can see it was sent, and the member can reply.
--   - The conversation is marked urgent, moderators get an urgent
--     notification, and the Byome inbox is emailed (once Resend is set
--     up, with the same daily limits as urgent mod mail). The email never
--     includes what the member wrote.
--   - At most one support message a day per member; moderators are told
--     every time.
--   - For moderators' sake, what was written is shown behind its own
--     warning on the Moderate page and in mod mail: a calm one for broad
--     phrases that are often said casually (likely a false alarm), and a
--     red, serious one for direct language or a specific method. The
--     notifications and email say which.
--
-- Managing the phrase list (SQL Editor). Letters and spaces only; leave out
-- apostrophes ("dont", not "don't"). Capitals, repeated letters, number
-- swaps ("su1c1dal"), apostrophes and dots or dashes between letters are
-- all handled when matching. Each phrase is 'broad' (often casual, likely
-- a false alarm) or 'direct' (serious):
--   insert into crisis_phrases (phrase, level) values ('new phrase', 'direct');
--   update crisis_phrases set level = 'broad' where phrase = 'some phrase';
--   delete from crisis_phrases where phrase = 'some phrase';
--   select phrase from crisis_phrases order by phrase;
-- Changing the message's subject:
--   update crisis_settings set subject = 'New subject';
--
-- Run in the Supabase SQL Editor BEFORE publishing the site update that
-- came with it. Safe to run again. Paste the whole file with nothing
-- highlighted.
-- =========================================================

-- ---------- The phrases ----------
-- Two levels, so moderators can tell them apart at a glance:
--   broad   often said casually ("kms", "I want to die, this shade..."),
--           so likely a false alarm
--   direct  direct language about suicide or self-harm, or a specific
--           method: treated as serious
create table if not exists public.crisis_phrases (
  phrase text primary key check (phrase ~ '^[a-z]+( [a-z]+)*$'),
  added_at timestamptz not null default now()
);
alter table public.crisis_phrases add column if not exists level text not null default 'broad';
alter table public.crisis_phrases drop constraint if exists crisis_phrases_level_check;
alter table public.crisis_phrases add constraint crisis_phrases_level_check check (level in ('broad', 'direct'));
alter table public.crisis_phrases enable row level security;
drop policy if exists "Moderators can read the crisis phrases" on public.crisis_phrases;
create policy "Moderators can read the crisis phrases" on public.crisis_phrases
  for select to authenticated using ((select public.is_moderator()));

insert into public.crisis_phrases (phrase, level) values
  -- direct
  ('kill myself', 'direct'), ('killing myself', 'direct'), ('end my life', 'direct'), ('ending my life', 'direct'),
  ('take my own life', 'direct'), ('taking my own life', 'direct'), ('suicidal', 'direct'),
  ('commit suicide', 'direct'), ('committing suicide', 'direct'), ('thinking about suicide', 'direct'),
  ('thoughts of suicide', 'direct'), ('considering suicide', 'direct'), ('attempt suicide', 'direct'),
  ('attempted suicide', 'direct'), ('suicide attempt', 'direct'),
  ('self harm', 'direct'), ('self harming', 'direct'), ('selfharm', 'direct'),
  ('cut myself', 'direct'), ('cutting myself', 'direct'), ('better off without me', 'direct'),
  ('dont want to live', 'direct'), ('dont want to be alive', 'direct'), ('no reason to live', 'direct'),
  ('nothing to live for', 'direct'),
  -- direct, coded ("unalive" only about yourself; "unalive yourself" is in automod's harmful list)
  ('unalive myself', 'direct'), ('unaliving myself', 'direct'), ('want to unalive', 'direct'),
  ('wanna unalive', 'direct'), ('going to unalive', 'direct'), ('gonna unalive', 'direct'),
  ('thinking about unaliving', 'direct'), ('sewer slide', 'direct'), ('sewerslide', 'direct'),
  ('self delete', 'direct'), ('self deleting', 'direct'), ('toaster bath', 'direct'),
  -- direct, methods
  ('slit my wrists', 'direct'), ('slit my wrist', 'direct'), ('slitting my wrists', 'direct'),
  ('cut my wrists', 'direct'), ('cutting my wrists', 'direct'), ('slash my wrists', 'direct'),
  ('hang myself', 'direct'), ('hanging myself', 'direct'), ('noose', 'direct'),
  ('shoot myself', 'direct'), ('shooting myself', 'direct'), ('gun to my head', 'direct'),
  ('drown myself', 'direct'), ('drowning myself', 'direct'), ('poison myself', 'direct'),
  ('overdose on pills', 'direct'), ('going to overdose', 'direct'), ('gonna overdose', 'direct'),
  ('want to overdose', 'direct'), ('planning to overdose', 'direct'),
  ('take all my pills', 'direct'), ('take all of my pills', 'direct'),
  ('swallow all my pills', 'direct'), ('swallow all of my pills', 'direct'),
  ('down a bottle of pills', 'direct'), ('downing a bottle of pills', 'direct'),
  ('take a bottle of pills', 'direct'), ('swallow a bottle of pills', 'direct'),
  ('jump off a bridge', 'direct'), ('jump off of a bridge', 'direct'), ('jump off the bridge', 'direct'),
  ('jumping off a bridge', 'direct'), ('jumping off of a bridge', 'direct'),
  ('jump off a building', 'direct'), ('jump off the roof', 'direct'), ('throw myself off', 'direct'),
  ('jump in front of a train', 'direct'), ('step in front of a train', 'direct'),
  ('drive off a cliff', 'direct'), ('crash my car on purpose', 'direct'), ('starve myself to death', 'direct'),
  -- broad (often casual)
  ('kms', 'broad'), ('want to die', 'broad'), ('wanna die', 'broad'),
  ('wish i was dead', 'broad'), ('wish i were dead', 'broad'), ('better off dead', 'broad'),
  ('hurt myself', 'broad'), ('hurting myself', 'broad'), ('walk into traffic', 'broad'),
  ('dont want to be here anymore', 'broad'), ('dont want to be here any more', 'broad'),
  ('whats the point of living', 'broad'), ('whats the point of anything', 'broad'), ('cant go on', 'broad'),
  ('want to disappear forever', 'broad'), ('wish id never been born', 'broad'), ('wish i had never been born', 'broad'),
  ('wish i was never born', 'broad'), ('dont want to wake up', 'broad')
on conflict (phrase) do update set level = excluded.level;

-- Said TO someone, it's harassment, not a crisis: automod's harmful list
insert into public.moderation_words (word, category) values
  ('slit your wrists', 'harmful'), ('slit ur wrists', 'harmful')
on conflict (word) do update set category = excluded.category;

-- The subject of the support message
create table if not exists public.crisis_settings (
  id boolean primary key default true check (id),
  subject text not null default 'Some support, in case you need it' check (char_length(subject) between 1 and 120)
);
insert into public.crisis_settings (id) values (true) on conflict (id) do nothing;
alter table public.crisis_settings enable row level security;

-- How serious a crisis phrase in this text is: 'direct', 'broad', or
-- null if there's none
create or replace function public.text_crisis_level(p_text text) returns text
language plpgsql stable security definer set search_path to public as $$
declare
  t text;
  w record;
  pattern text;
  found text;
begin
  if p_text is null or p_text = '' then return null; end if;
  -- lowercase, undo number swaps like automod does, and drop apostrophes
  t := regexp_replace(translate(lower(p_text), '013457@$', 'oieastas'), '[''`’‘]', '', 'g');
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

-- Does this text contain a crisis phrase?
create or replace function public.text_is_crisis(p_text text) returns boolean
language sql stable security definer set search_path to public as $$
  select text_crisis_level(p_text) is not null
$$;
revoke execute on function public.text_is_crisis(text) from public, anon, authenticated;


-- ---------- Crisis phrases count as automod flags ----------
-- (the same as in 2026-10-21-automod-emojis-and-words.sql, plus crisis
-- phrases, so they're held like other flagged words)
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
  return text_is_crisis(p_text);
end $$;
revoke execute on function public.text_is_flagged(text) from public, anon, authenticated;

-- (the same as in 2026-11-25-modmail-automod.sql, plus "crisis_serious"
-- or "crisis", listed first, so mod mail hides it behind its own warning)
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
  -- (a direct crisis phrase is 'crisis_serious', a broad one 'crisis')
  found := found || case text_crisis_level(p_text) when 'direct' then 'crisis_serious' when 'broad' then 'crisis' end;

  return array(select c from unnest(array['crisis_serious', 'crisis', 'offensive', 'harmful', 'explicit', 'strong']) with ordinality as o(c, n)
               where c = any(found) order by n);
end $$;
revoke execute on function public.text_flag_reasons(text) from public, anon, authenticated;

-- Mod mail already sent: mark any crisis messages
update public.modmail_messages set flags = text_flag_reasons(body) where text_is_crisis(body);


-- ---------- What was caught, and the support sent ----------
create table if not exists public.crisis_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('post', 'comment', 'review', 'review_update', 'bio', 'modmail')),
  ref_id uuid not null,               -- the post, comment... (for a bio, the member; for mod mail, the conversation)
  thread_id uuid references public.modmail_threads(id) on delete set null,
  message_sent boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.crisis_alerts add column if not exists level text not null default 'broad';
alter table public.crisis_alerts drop constraint if exists crisis_alerts_level_check;
alter table public.crisis_alerts add constraint crisis_alerts_level_check check (level in ('broad', 'direct'));
create index if not exists crisis_alerts_user on public.crisis_alerts (user_id, created_at desc);
create index if not exists crisis_alerts_ref on public.crisis_alerts (ref_id);
alter table public.crisis_alerts enable row level security;
-- (members see their own, so their held post shows the gentler note)
drop policy if exists "See your own crisis alerts" on public.crisis_alerts;
create policy "See your own crisis alerts" on public.crisis_alerts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_moderator()));

-- The support message
create or replace function public.crisis_support_message(p_name text, p_kind text) returns text
language sql immutable set search_path to public as $$
  select 'Hi ' || coalesce(p_name, 'there') || ', something you wrote on Byome made us want to check in. '
    || 'We''re not mental health professionals, but if you''re going through a hard time, these services are. '
    || 'They''re free, confidential and open any time:' || E'\n'
    || '• US and Canada: call or text 988' || E'\n'
    || '• UK and Ireland: Samaritans, call 116 123' || E'\n'
    || '• Australia: Lifeline, call 13 11 14' || E'\n'
    || '• Anywhere else: www.findahelpline.com lists free helplines in your country' || E'\n\n'
    || 'If you''re in danger right now, please call your local emergency number (911, 999, 112 or 000).' || E'\n\n'
    || case when p_kind = 'modmail'
         then 'This message was sent automatically, and you''re not in any trouble. '
         else 'Your ' || w.what || ' is paused while a moderator takes a look. This isn''t a punishment, and you''re not in any trouble. '
              || 'If we''ve got it wrong, we''ll approve the ' || w.what || '. ' end
    || 'Byome''s moderators aren''t online around the clock, but you''re always welcome to reply here.' || E'\n\n'
    || 'The Byome moderators'
  from (select case p_kind when 'review_update' then 'update' when 'bio' then 'new bio' else p_kind end as what) w
$$;

-- Send the support (or, if it was sent in the last day, just tell the
-- moderators again). p_level is 'direct' or 'broad'. Never stops the post
-- or message from saving.
drop function if exists public.crisis_respond(uuid, text, uuid);
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
      then 'Serious: automod caught direct language about suicide or self-injury in ' || what || ' from ' || name || '. '
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
        then 'Automod caught direct language about suicide, self-harm or a specific method, in ' || what || ' from ' || name || '. '
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


-- ---------- Watching posts, comments, reviews, updates and mod mail ----------
create or replace function public.crisis_check_content() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  content text := coalesce(to_jsonb(new)->>'title', '') || ' ' || coalesce(to_jsonb(new)->>'body', '');
  kind text := case tg_table_name when 'posts' then 'post' when 'comments' then 'comment'
                                  when 'reviews' then 'review' else 'review_update' end;
  level text;
begin
  if new.held_at is null then return null; end if;
  if tg_op = 'UPDATE' and content = coalesce(to_jsonb(old)->>'title', '') || ' ' || coalesce(to_jsonb(old)->>'body', '') then
    return null;  -- nothing new written
  end if;
  level := text_crisis_level(content);
  if level is not null then perform crisis_respond(new.user_id, kind, new.id, level); end if;
  return null;
end $$;

drop trigger if exists posts_crisis on public.posts;
create trigger posts_crisis after insert or update on public.posts
  for each row execute function public.crisis_check_content();
drop trigger if exists comments_crisis on public.comments;
create trigger comments_crisis after insert or update on public.comments
  for each row execute function public.crisis_check_content();
drop trigger if exists reviews_crisis on public.reviews;
create trigger reviews_crisis after insert or update on public.reviews
  for each row execute function public.crisis_check_content();
drop trigger if exists review_updates_crisis on public.review_updates;
create trigger review_updates_crisis after insert or update on public.review_updates
  for each row execute function public.crisis_check_content();

create or replace function public.crisis_check_modmail() returns trigger
language plpgsql security definer set search_path to public as $$
declare level text;
begin
  if new.from_mods or new.sender_id is null then return null; end if;
  level := text_crisis_level(new.body);
  if level is not null then
    perform crisis_respond(new.sender_id, 'modmail', new.thread_id, level);
  end if;
  return null;
end $$;
drop trigger if exists modmail_messages_crisis on public.modmail_messages;
create trigger modmail_messages_crisis after insert on public.modmail_messages
  for each row execute function public.crisis_check_modmail();


-- ---------- Bios: held instead of refused ----------
create table if not exists public.held_bios (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  bio text not null check (char_length(bio) <= 160),
  held_at timestamptz not null default now()
);
alter table public.held_bios enable row level security;
drop policy if exists "See your own held bio" on public.held_bios;
create policy "See your own held bio" on public.held_bios for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_moderator()));

-- (the same as in 2026-11-16-starter-checklist.sql, except that a flagged
-- bio waits for a moderator instead of being refused: 'held')
create or replace function public.set_my_bio(p_bio text) returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  clean text;
begin
  if me is null then raise exception 'Please log in first'; end if;
  -- trim, and no more than one blank line in a row
  clean := nullif(btrim(regexp_replace(coalesce(p_bio, ''), '\n\s*\n(\s*\n)+', E'\n\n', 'g')), '');
  if char_length(clean) > 160 then return 'too_long'; end if;
  if clean ~* '(https?://|www\.|\.(com|net|org|co|io|ly|xyz|shop|link)\M)' then return 'no_links'; end if;
  if clean is not null and text_is_flagged(clean) then
    insert into held_bios (user_id, bio, held_at) values (me, clean, now())
    on conflict (user_id) do update set bio = excluded.bio, held_at = now();
    if text_is_crisis(clean) then perform crisis_respond(me, 'bio', me, text_crisis_level(clean)); end if;
    return 'held';
  end if;
  delete from held_bios where user_id = me;
  update profiles set bio = clean where id = me;
  return 'ok';
end $$;
revoke execute on function public.set_my_bio(text) from public, anon;
grant execute on function public.set_my_bio(text) to authenticated;

-- Moderators: approve or remove a held bio
create or replace function public.moderate_bio(p_user uuid, p_action text) returns text
language plpgsql security definer set search_path to public as $$
declare
  h held_bios%rowtype;
  name text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  select * into h from held_bios where user_id = p_user;
  if not found then return 'gone'; end if;
  select username into name from profiles where id = p_user;
  if p_action = 'approve' then
    update profiles set bio = h.bio where id = p_user;
    delete from held_bios where user_id = p_user;
    perform create_notification(p_user, null, 'moderation', p_user,
      'A moderator approved your new bio. Everyone can see it now.', 'profile.html', false, 'positive');
    perform log_moderation('approve', 'profile', p_user, p_user, 'positive', 'bio: ' || left(h.bio, 60));
    perform reward_moderator('mod_decision', 'profile', p_user, p_user);
    return 'approved';
  elsif p_action = 'remove' then
    delete from held_bios where user_id = p_user;
    perform create_notification(p_user, null, 'moderation', p_user,
      'A moderator didn''t approve your new bio because it didn''t follow the community guidelines. You can write a new one on Edit profile.',
      'edit-profile.html', false, 'negative');
    perform log_moderation('remove', 'profile', p_user, p_user, 'negative', 'bio: ' || left(h.bio, 60));
    perform reward_moderator('mod_decision', 'profile', p_user, p_user);
    return 'removed';
  end if;
  raise exception 'Unknown action: %', p_action;
end $$;
revoke execute on function public.moderate_bio(uuid, text) from public, anon;
grant execute on function public.moderate_bio(uuid, text) to authenticated;

-- Tell the API about the new tables and functions straight away
notify pgrst, 'reload schema';
