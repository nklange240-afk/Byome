-- =========================================================
-- Byome: feedback from visitors (people without an account).
-- Anyone can send feedback from modmail.html?new=feedback, no account
-- needed, with an optional email or other way to reach them. It arrives in
-- mod mail like members' feedback, marked "From a visitor". Visitors can't
-- see replies on the site, so moderators follow up by email if a contact
-- was given.
-- Spam protection: a hidden "trap" field that only bots fill in, a limit
-- per visitor (5 a day, using a scrambled fingerprint of their internet
-- address, never the address itself) and a site-wide limit (30 an hour).
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Run it before publishing the site update that
-- came with it.
-- =========================================================

alter table public.modmail_threads add column if not exists from_visitor boolean not null default false;
alter table public.modmail_threads add column if not exists contact text check (char_length(contact) <= 200);
alter table public.modmail_threads add column if not exists visitor_key text;
create index if not exists modmail_threads_visitor on public.modmail_threads (visitor_key, created_at) where from_visitor;

-- Send feedback without an account. p_trap is the hidden field: if a bot
-- filled it in, nothing is saved (and the bot isn't told).
create or replace function public.visitor_feedback(p_subject text, p_body text, p_contact text default null,
  p_page text default null, p_trap text default null) returns void
language plpgsql security definer set search_path to public as $$
declare
  t uuid;
  subj text := left(coalesce(nullif(btrim(p_subject), ''), 'Feedback'), 120);
  ip text;
  who text;
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

  insert into modmail_threads (user_id, kind, subject, page, from_visitor, contact, visitor_key)
  values (null, 'feedback', subj, left(p_page, 300), true, nullif(btrim(p_contact), ''), who)
  returning id into t;
  insert into modmail_messages (thread_id, sender_id, from_mods, body) values (t, null, false, btrim(p_body));
  perform notify_modmail(null, t, 'Feedback from a visitor: ' || left(subj, 80));
end $$;
revoke execute on function public.visitor_feedback(text, text, text, text, text) from public;
grant execute on function public.visitor_feedback(text, text, text, text, text) to anon, authenticated;

-- Visitors can't read replies, so moderators can't reply on the site to a
-- visitor's feedback (they email instead, if a contact was given)
create or replace function public.modmail_reply(p_thread uuid, p_body text) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  th modmail_threads%rowtype;
  as_mod boolean;
begin
  if me is null then raise exception 'Please log in first'; end if;
  select * into th from modmail_threads where id = p_thread;
  if not found then raise exception 'Conversation not found'; end if;
  as_mod := is_moderator() and th.user_id is distinct from me;
  if not as_mod and th.user_id is distinct from me then raise exception 'Conversation not found'; end if;
  if th.from_visitor then raise exception 'Visitors can''t see replies here. Use their contact details instead, if they left any.'; end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then raise exception 'Please write a message'; end if;
  if char_length(btrim(p_body)) > 2000 then raise exception 'Messages can be up to 2000 characters'; end if;
  if (select count(*) from modmail_messages where sender_id = me and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'That''s a lot of messages in a short time! Please take a little break and try again later.';
  end if;

  insert into modmail_messages (thread_id, sender_id, from_mods, body) values (p_thread, me, as_mod, btrim(p_body));
  update modmail_threads set updated_at = now(), last_from = case when as_mod then 'mods' else 'member' end,
    status = case when as_mod then status else 'open' end
  where id = p_thread;

  if as_mod then
    if th.user_id is not null then
      insert into notifications (user_id, actor_id, type, ref_id, message, link)
      values (th.user_id, null, 'modmail', p_thread, 'The Byome moderators replied to "' || left(th.subject, 60) || '".',
              'modmail.html?thread=' || p_thread);
    end if;
  else
    perform notify_modmail(me, p_thread, (select username from profiles where id = me) || ' replied in mod mail: ' || left(th.subject, 60));
  end if;
end $$;

-- The list and one conversation, now with visitors' feedback (moderators only)
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
    'contact', case when mod then th.contact end,
    'about', case when mod then (select username from profiles where id = th.about_user) end,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'body', m.body, 'created_at', m.created_at, 'from_mods', m.from_mods,
        'mine', m.sender_id = me,
        'sender', case when m.from_mods and not mod then 'Byome moderators'
                       when m.sender_id is null and th.from_visitor then 'A visitor'
                       else (select username from profiles where id = m.sender_id) end)
        order by m.created_at)
      from modmail_messages m where m.thread_id = th.id), '[]'::jsonb));
end $$;
