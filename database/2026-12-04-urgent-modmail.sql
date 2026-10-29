-- =========================================================
-- Byome: urgent mod mail.
-- Members (and visitors sending feedback) can tick "This is urgent" for a
-- safety concern, or when something important on Byome isn't working at
-- all. Urgent conversations are labelled and listed first for moderators,
-- the moderators' notification says it's urgent, and the message is also
-- emailed to the Byome inbox (hello@byome.xyz).
--
-- Emails are sent through Resend (resend.com), from the database itself
-- (Supabase's pg_net extension), using a key kept in Supabase's Vault, never
-- in the site's code. Until that's set up, everything else works and
-- nothing is emailed. Setting it up:
--   1. Make a free Resend account with hello@byome.xyz, and create an API
--      key (API Keys, "Sending access").
--   2. In Supabase: Integrations, Vault (or Project Settings, Vault), add a
--      secret named resend_api_key with the key as its value.
--   3. Send a test email to the inbox:
--        select public.test_urgent_email();
-- Until byome.xyz is verified in Resend, emails come from Resend's test
-- address (onboarding@resend.dev), which can only send to the email the
-- Resend account was made with. To send from your own address later,
-- verify the domain in Resend and add a Vault secret named resend_from,
-- for example: Byome <urgent@byome.xyz>
--
-- Limits, so the inbox can't be flooded: 3 urgent emails a day from any one
-- member or visitor, and 20 a day in total. Past that, messages are still
-- marked urgent on Byome; they just aren't emailed.
-- If automod hid words in an urgent message, the email doesn't include the
-- message, only a link to read it on Byome.
--
-- Run in the Supabase SQL Editor BEFORE publishing the site update that
-- came with it. Safe to run again. Paste the whole file with nothing
-- highlighted.
-- =========================================================

alter table public.modmail_threads add column if not exists urgent boolean not null default false;
alter table public.modmail_threads add column if not exists urgent_emailed_at timestamptz;

-- Sending emails from the database (Supabase has this; it's skipped elsewhere)
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net isn''t available here, so urgent emails will be skipped';
end $$;

-- A Vault secret's value, or null
create or replace function public.vault_secret(p_name text) returns text
language plpgsql stable security definer set search_path to public as $$
declare v text;
begin
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v using p_name;
  return nullif(btrim(v), '');
exception when others then return null;
end $$;
revoke execute on function public.vault_secret(text) from public, anon, authenticated;

-- Email the Byome inbox. Returns what happened (it never stops anything
-- else from saving). The email is sent just after the message is saved.
create or replace function public.email_byome_inbox(p_subject text, p_text text) returns text
language plpgsql security definer set search_path to public as $$
declare
  k text := vault_secret('resend_api_key');
begin
  if to_regproc('net.http_post') is null then
    return 'Not sent: the pg_net extension isn''t turned on (Database, Extensions).';
  end if;
  if k is null then return 'Not sent: add the Resend key to the Vault as resend_api_key.'; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
  using 'https://api.resend.com/emails',
        jsonb_build_object(
          'from', coalesce(vault_secret('resend_from'), 'Byome <onboarding@resend.dev>'),
          'to', jsonb_build_array(coalesce(vault_secret('urgent_email_to'), 'hello@byome.xyz')),
          'subject', left(p_subject, 200),
          'text', p_text),
        jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json');
  return 'Sent to Resend. It should arrive in a minute or two.';
exception when others then
  return 'Not sent: ' || sqlerrm;
end $$;
revoke execute on function public.email_byome_inbox(text, text) from public, anon, authenticated;

-- For the owner, in the SQL Editor
create or replace function public.test_urgent_email() returns text
language sql security definer set search_path to public as $$
  select email_byome_inbox('Byome test: urgent mod mail emails work',
    'This is a test from the Byome database. If you can read this, urgent mod mail will reach this inbox.')
$$;
revoke execute on function public.test_urgent_email() from public, anon, authenticated;

-- Emails one urgent conversation (within the daily limits)
create or replace function public.email_urgent_modmail(p_thread uuid) returns text
language plpgsql security definer set search_path to public as $$
declare
  th modmail_threads%rowtype;
  m modmail_messages%rowtype;
  who text;
  result text;
begin
  select * into th from modmail_threads where id = p_thread;
  if not found or not th.urgent or th.urgent_emailed_at is not null then return 'Not sent: nothing to send.'; end if;
  if (select count(*) from modmail_threads where urgent_emailed_at > now() - interval '1 day') >= 20
     or (select count(*) from modmail_threads where urgent_emailed_at > now() - interval '1 day'
         and ((th.user_id is not null and user_id = th.user_id)
              or (th.from_visitor and th.visitor_key is not null and visitor_key = th.visitor_key))) >= 3 then
    return 'Not sent: over the daily limit.';
  end if;
  select * into m from modmail_messages where thread_id = p_thread order by created_at limit 1;
  who := case when th.from_visitor then 'A visitor (no account)' || coalesce(', contact: ' || th.contact, '')
              else coalesce((select username from profiles where id = th.user_id), 'A member') end;

  result := email_byome_inbox(
    'Urgent mod mail: ' || case when coalesce(array_length(th.subject_flags, 1), 0) > 0 then '(subject hidden by automod)' else th.subject end,
    'Someone marked a mod mail message as urgent on Byome.' || E'\n\n' ||
    'From: ' || who || E'\n' ||
    'Kind: ' || th.kind || E'\n' ||
    coalesce('Sent from: ' || th.page || E'\n', '') ||
    E'\n' ||
    case when coalesce(array_length(m.flags, 1), 0) > 0 or coalesce(array_length(th.subject_flags, 1), 0) > 0
      then 'Automod hid some words in this message, so it isn''t included here. Read it on Byome (link below).'
      else coalesce(m.body, '') end ||
    E'\n\n' || 'Open it on Byome: https://byome.xyz/modmail.html?thread=' || th.id || E'\n\n' ||
    'If someone may be in immediate danger, contact emergency services. For suspected child sexual abuse material, ' ||
    'don''t open, download or forward anything: follow the steps in the moderator guide.');
  if result like 'Sent%' then
    update modmail_threads set urgent_emailed_at = now() where id = p_thread;
  end if;
  return result;
end $$;
revoke execute on function public.email_urgent_modmail(uuid) from public, anon, authenticated;


-- ---------- Starting a conversation, now with "urgent" ----------
drop function if exists public.modmail_start(text, text, text, uuid, text);
create or replace function public.modmail_start(p_kind text, p_subject text, p_body text,
  p_about uuid default null, p_page text default null, p_urgent boolean default false) returns uuid
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  t uuid;
  label text := case p_kind when 'feedback' then 'Feedback' when 'block' then 'A block' else 'Mod mail' end;
  urgent boolean := coalesce(p_urgent, false) and p_kind in ('message', 'feedback');
begin
  if me is null then raise exception 'Please log in first'; end if;
  if p_kind not in ('message', 'block', 'feedback') then raise exception 'Unknown kind: %', p_kind; end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then raise exception 'Please write a message'; end if;
  if char_length(btrim(p_body)) > 2000 then raise exception 'Messages can be up to 2000 characters'; end if;
  if (select count(*) from modmail_threads where user_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve sent a lot of messages today. Please wait a little, or add to one of your conversations.';
  end if;
  insert into modmail_threads (user_id, kind, subject, about_user, page, urgent)
  values (me, p_kind, left(coalesce(nullif(btrim(p_subject), ''), label), 120), p_about, left(p_page, 300), urgent)
  returning id into t;
  insert into modmail_messages (thread_id, sender_id, from_mods, body) values (t, me, false, btrim(p_body));
  perform notify_modmail(me, t, case when urgent then 'Urgent: ' else '' end || label || ' from '
    || (select username from profiles where id = me) || ': ' || left(coalesce(nullif(btrim(p_subject), ''), label), 80));
  if urgent then perform email_urgent_modmail(t); end if;
  return t;
end $$;
revoke execute on function public.modmail_start(text, text, text, uuid, text, boolean) from public, anon;
grant execute on function public.modmail_start(text, text, text, uuid, text, boolean) to authenticated;


-- ---------- Visitors' feedback, now with "urgent" ----------
drop function if exists public.visitor_feedback(text, text, text, text, text);
create or replace function public.visitor_feedback(p_subject text, p_body text, p_contact text default null,
  p_page text default null, p_trap text default null, p_urgent boolean default false) returns void
language plpgsql security definer set search_path to public as $$
declare
  t uuid;
  subj text := left(coalesce(nullif(btrim(p_subject), ''), 'Feedback'), 120);
  ip text;
  who text;
  urgent boolean := coalesce(p_urgent, false);
begin
  if coalesce(btrim(p_trap), '') <> '' then return; end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then raise exception 'Please write a message'; end if;
  if char_length(btrim(p_body)) > 2000 then raise exception 'Messages can be up to 2000 characters'; end if;
  if char_length(btrim(coalesce(p_contact, ''))) > 200 then raise exception 'That contact is a bit long. Please keep it under 200 characters'; end if;

  -- A scrambled fingerprint of the sender's internet address, only for the
  -- daily limit (the address itself is never stored)
  begin
    ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  exception when others then ip := '';
  end;
  who := case when btrim(ip) <> '' then encode(sha256(convert_to('byome-visitor:' || btrim(ip), 'utf8')), 'hex') end;

  if who is not null and (select count(*) from modmail_threads
                          where from_visitor and visitor_key = who and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Thanks for all the feedback! You''ve sent a lot today, so please try again tomorrow, or email us at hello@byome.xyz.';
  end if;
  if (select count(*) from modmail_threads where from_visitor and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'We''re getting a lot of messages right now. Please try again in a little while, or email us at hello@byome.xyz.';
  end if;

  insert into modmail_threads (user_id, kind, subject, page, from_visitor, contact, visitor_key, urgent)
  values (null, 'feedback', subj, left(p_page, 300), true, nullif(btrim(p_contact), ''), who, urgent)
  returning id into t;
  insert into modmail_messages (thread_id, sender_id, from_mods, body) values (t, null, false, btrim(p_body));
  perform notify_modmail(null, t, case when urgent then 'Urgent: ' else '' end || 'Feedback from a visitor: ' || left(subj, 80));
  if urgent then perform email_urgent_modmail(t); end if;
end $$;
revoke execute on function public.visitor_feedback(text, text, text, text, text, boolean) from public;
grant execute on function public.visitor_feedback(text, text, text, text, text, boolean) to anon, authenticated;


-- ---------- The list and one conversation, now with "urgent" ----------
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
      'urgent', t.urgent,
      'subject_flags', t.subject_flags,
      'about', case when mod then (select username from profiles where id = t.about_user) end,
      'count', (select count(*) from modmail_messages m where m.thread_id = t.id))
      order by (t.status = 'open' and t.last_from = 'member' and mod and t.urgent) desc,
               (t.status = 'open' and t.last_from = 'member' and mod) desc, t.updated_at desc)
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
    'urgent', th.urgent,
    'emailed', case when mod then th.urgent_emailed_at is not null end,
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

-- Check: is email set up? (Shows what's missing, without sending anything)
select
  to_regproc('net.http_post') is not null as pg_net_on,
  public.vault_secret('resend_api_key') is not null as resend_key_saved;
