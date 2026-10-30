-- =========================================================
-- Byome tests: the starting point for a test database.
-- Stand-ins for the parts Supabase provides (the anon and authenticated
-- roles, auth.uid(), auth.users, storage), then Byome's original tables
-- as they were before the files in database/ (structure only, no data).
-- Used by the automatic checks (.github/workflows/checks.yml); never run
-- this on the real database.
-- =========================================================

set check_function_bodies = off;
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit password 'pw'; end if;
end $$;
grant anon, authenticated to authenticator;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, created_at timestamptz default now(), email_confirmed_at timestamptz, last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claims', true)::jsonb->>'sub', current_setting('test.uid', true)), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets(id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:greatest(cardinality(string_to_array(name, '/')) - 1, 0)] $$;
create schema if not exists extensions;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

create table public.biome_slots (
  user_id uuid not null,
  slot integer not null,
  pot_key text not null,
  updated_at timestamp with time zone not null default now()
);
create table public.comment_likes (
  comment_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);
create table public.comments (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  parent_id uuid,
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone not null default now()
);
create table public.likes (
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);
create table public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid,
  type text not null,
  ref_id uuid,
  message text not null,
  link text,
  created_at timestamp with time zone not null default now(),
  read_at timestamp with time zone
);
create table public.point_ledger (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  community_points integer not null,
  biome_points integer not null,
  ref_type text,
  ref_id uuid,
  created_at timestamp with time zone not null default now(),
  available_at timestamp with time zone not null default now(),
  revoked_at timestamp with time zone
);
create table public.point_rules (
  action text not null,
  label text not null,
  community_points integer not null default 0,
  biome_points integer not null default 0,
  delay_hours integer not null default 0,
  daily_cap integer,
  min_chars integer,
  threshold integer,
  description text
);
create table public.posts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone not null default now(),
  title text,
  edited_at timestamp with time zone,
  category text
);
create table public.products (
  id uuid not null default gen_random_uuid(),
  name text not null,
  brand text not null,
  photo_url text,
  variations text[],
  status text not null default 'pending'::text,
  suggested_by uuid,
  created_at timestamp with time zone default now(),
  rejection_reason text,
  category text,
  subcategory text
);
create table public.profiles (
  id uuid not null,
  username text not null,
  created_at timestamp with time zone default now(),
  is_moderator boolean not null default false
);
create table public.review_likes (
  review_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);
create table public.review_standouts (
  review_id uuid not null,
  granted_by uuid,
  created_at timestamp with time zone not null default now()
);
create table public.review_updates (
  id uuid not null default gen_random_uuid(),
  review_id uuid not null,
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone not null default now()
);
create table public.reviews (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  user_id uuid not null,
  rating integer not null,
  title text not null,
  body text not null,
  variation text,
  created_at timestamp with time zone not null default now(),
  would_repurchase boolean,
  holy_grail boolean not null default false,
  edited_at timestamp with time zone
);
alter table public.biome_slots add constraint biome_slots_pkey PRIMARY KEY (user_id, slot);
alter table public.comment_likes add constraint comment_likes_pkey PRIMARY KEY (comment_id, user_id);
alter table public.comments add constraint comments_pkey PRIMARY KEY (id);
alter table public.likes add constraint likes_pkey PRIMARY KEY (post_id, user_id);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.point_ledger add constraint point_ledger_pkey PRIMARY KEY (id);
alter table public.point_rules add constraint point_rules_pkey PRIMARY KEY (action);
alter table public.posts add constraint posts_pkey PRIMARY KEY (id);
alter table public.products add constraint products_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_username_key UNIQUE (username);
alter table public.review_likes add constraint review_likes_pkey PRIMARY KEY (review_id, user_id);
alter table public.review_standouts add constraint review_standouts_pkey PRIMARY KEY (review_id);
alter table public.review_updates add constraint review_updates_pkey PRIMARY KEY (id);
alter table public.reviews add constraint reviews_pkey PRIMARY KEY (id);
alter table public.biome_slots add constraint biome_slots_slot_check CHECK (((slot >= 0) AND (slot <= 10)));
alter table public.biome_slots add constraint biome_slots_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.comment_likes add constraint comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE;
alter table public.comment_likes add constraint comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.comments add constraint comments_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500)));
alter table public.comments add constraint comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
alter table public.comments add constraint comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table public.comments add constraint comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.likes add constraint likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table public.likes add constraint likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.point_ledger add constraint point_ledger_action_fkey FOREIGN KEY (action) REFERENCES point_rules(action);
alter table public.point_ledger add constraint point_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.posts add constraint posts_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1000)));
alter table public.posts add constraint posts_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 100)));
alter table public.posts add constraint posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.products add constraint products_rejection_reason_check CHECK ((char_length(rejection_reason) <= 500));
alter table public.products add constraint products_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.products add constraint products_suggested_by_fkey FOREIGN KEY (suggested_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.review_likes add constraint review_likes_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
alter table public.review_likes add constraint review_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.review_standouts add constraint review_standouts_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.review_standouts add constraint review_standouts_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
alter table public.review_updates add constraint review_updates_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1000)));
alter table public.review_updates add constraint review_updates_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
alter table public.review_updates add constraint review_updates_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.reviews add constraint holy_grail_needs_five CHECK (((NOT holy_grail) OR (rating = 5)));
alter table public.reviews add constraint reviews_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)));
alter table public.reviews add constraint reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.reviews add constraint reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
alter table public.reviews add constraint reviews_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 100)));
alter table public.reviews add constraint reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX comments_post_id_idx ON public.comments USING btree (post_id);
CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX point_ledger_once ON public.point_ledger USING btree (user_id, action, ref_id) WHERE ((revoked_at IS NULL) AND (ref_id IS NOT NULL));
CREATE INDEX point_ledger_user_idx ON public.point_ledger USING btree (user_id, created_at DESC);
CREATE INDEX reviews_created_at_idx ON public.reviews USING btree (created_at DESC);
create view public.user_points as  SELECT user_id,
    (COALESCE(sum(community_points) FILTER (WHERE (available_at <= now())), (0)::bigint))::integer AS community,
    (COALESCE(sum(biome_points) FILTER (WHERE (available_at <= now())), (0)::bigint))::integer AS biome,
    (COALESCE(sum(community_points) FILTER (WHERE (available_at > now())), (0)::bigint))::integer AS pending_community,
    (COALESCE(sum(biome_points) FILTER (WHERE (available_at > now())), (0)::bigint))::integer AS pending_biome
   FROM point_ledger
  WHERE (revoked_at IS NULL)
  GROUP BY user_id;
CREATE OR REPLACE FUNCTION public.award_points(p_user uuid, p_action text, p_ref_type text, p_ref uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rule point_rules%rowtype;
  today_count int;
  new_id uuid;
  msg text;
begin
  select * into rule from point_rules where action = p_action;
  if not found then return false; end if;

  if rule.daily_cap is not null then
    select count(*) into today_count from point_ledger
    where user_id = p_user and action = p_action and revoked_at is null
      and created_at >= date_trunc('day', now());
    if today_count >= rule.daily_cap then return false; end if;
  end if;

  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id, available_at)
  values (p_user, p_action, rule.community_points, rule.biome_points, p_ref_type, p_ref,
          now() + make_interval(hours => rule.delay_hours))
  on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
  returning id into new_id;

  if new_id is null then return false; end if;

  msg := 'You earned ' || rule.community_points || ' community points and ' || rule.biome_points
      || ' biome points: ' || rule.label || '.';
  if rule.delay_hours > 0 then
    msg := msg || ' They''ll be available in ' || rule.delay_hours || ' hours.';
  end if;
  perform create_notification(p_user, null, 'points', new_id, msg, 'profile.html');
  return true;
end $function$;
CREATE OR REPLACE FUNCTION public.check_comment_engagement(p_comment uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare author uuid; rule point_rules%rowtype; engaged int;
begin
  select user_id into author from comments where id = p_comment;
  if author is null then return; end if;
  select * into rule from point_rules where action = 'comment_liked';
  if not found then return; end if;

  select count(distinct user_id) into engaged from comment_likes
  where comment_id = p_comment and user_id <> author;

  if engaged >= coalesce(rule.threshold, 3) then
    perform award_points(author, 'comment_liked', 'comment', p_comment);
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.check_post_engagement(p_post uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  author uuid;
  rule point_rules%rowtype;
  engaged int;
begin
  select user_id into author from posts where id = p_post;
  if author is null then return; end if;
  select * into rule from point_rules where action = 'post_engaged';
  if not found then return; end if;

  -- different people who liked or commented (you can't engage with your own post)
  select count(distinct u) into engaged from (
    select user_id as u from likes where post_id = p_post
    union
    select user_id from comments where post_id = p_post
  ) s where u <> author;

  if engaged >= coalesce(rule.threshold, 5) then
    perform award_points(author, 'post_engaged', 'post', p_post);
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.check_review_engagement(p_review uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare author uuid; rule point_rules%rowtype; engaged int;
begin
  select user_id into author from reviews where id = p_review;
  if author is null then return; end if;
  select * into rule from point_rules where action = 'review_liked';
  if not found then return; end if;

  -- only reviews that earned points for quality are eligible
  if not exists (select 1 from point_ledger
                 where action = 'review' and ref_type = 'review' and ref_id = p_review and revoked_at is null) then
    return;
  end if;

  select count(distinct user_id) into engaged from review_likes
  where review_id = p_review and user_id <> author;

  if engaged >= coalesce(rule.threshold, 5) then
    perform award_points(author, 'review_liked', 'review', p_review);
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.create_notification(p_user uuid, p_actor uuid, p_type text, p_ref uuid, p_message text, p_link text, p_once boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user is null then return; end if;
  if p_actor is not null and p_user = p_actor then return; end if;   -- never notify yourself
  if p_once and exists (
    select 1 from notifications
    where user_id = p_user and actor_id = p_actor and type = p_type and ref_id = p_ref
  ) then return; end if;                                              -- like/unlike/like won't spam
  insert into notifications (user_id, actor_id, type, ref_id, message, link)
  values (p_user, p_actor, p_type, p_ref, p_message, p_link);
end $function$;
CREATE OR REPLACE FUNCTION public.grant_standout(p_review_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare author uuid; is_mod boolean;
begin
  select is_moderator into is_mod from profiles where id = auth.uid();
  if not coalesce(is_mod, false) then raise exception 'Moderators only'; end if;

  select user_id into author from reviews where id = p_review_id;
  if author is null then raise exception 'Review not found'; end if;
  if author = auth.uid() then raise exception 'You can''t mark your own review as standout'; end if;
  if exists (select 1 from review_standouts where review_id = p_review_id) then return 'already'; end if;

  insert into review_standouts (review_id, granted_by) values (p_review_id, auth.uid());
  perform award_points(author, 'review_standout', 'review', p_review_id);
  return 'granted';
end $function$;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.handle_product_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      perform create_notification(new.suggested_by, null, 'moderation', new.id,
        'Your product suggestion "' || new.brand || ' — ' || new.name || '" was approved. You can review it now!', 'reviews.html');
      perform award_points(new.suggested_by, 'product_approved', 'product', new.id);
    elsif new.status = 'rejected' then
      perform create_notification(new.suggested_by, null, 'moderation', new.id,
        'Your product suggestion "' || new.brand || ' — ' || new.name || '" wasn''t approved.'
        || case when coalesce(new.rejection_reason, '') <> '' then ' Reason: ' || new.rejection_reason else '' end,
        'suggest-product.html');
    end if;
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.handle_review_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rule point_rules%rowtype; dup boolean; first_one boolean;
begin
  select * into rule from point_rules where action = 'review';
  if not found then return new; end if;

  if review_is_quality(new.body, coalesce(rule.min_chars, 0)) then
    select exists (
      select 1 from point_ledger l join reviews r2 on r2.id = l.ref_id
      where l.user_id = new.user_id and l.action = 'review' and l.ref_type = 'review'
        and l.revoked_at is null and r2.product_id = new.product_id and r2.id <> new.id
    ) into dup;

    if not dup then
      if award_points(new.user_id, 'review', 'review', new.id) then
        select not exists (
          select 1 from reviews r2
          where r2.product_id = new.product_id and r2.id <> new.id and r2.created_at < new.created_at
        ) into first_one;
        if first_one then perform award_points(new.user_id, 'first_review', 'review', new.id); end if;
      end if;
    end if;
  else
    update point_ledger set revoked_at = now()
    where ref_type = 'review' and ref_id = new.id and revoked_at is null
      and action in ('review', 'first_review', 'review_liked', 'review_update', 'review_standout');
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.mark_notifications_read()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null
$function$;
CREATE OR REPLACE FUNCTION public.on_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare post_author uuid; parent_author uuid; t text;
begin
  select user_id, title into post_author, t from posts where id = new.post_id;
  if new.parent_id is not null then
    select user_id into parent_author from comments where id = new.parent_id;
    perform create_notification(parent_author, new.user_id, 'reply', new.id,
      username_of(new.user_id) || ' replied to your comment', 'feed.html');
  end if;
  if post_author is distinct from parent_author then   -- avoid two notices for one reply
    perform create_notification(post_author, new.user_id, 'comment', new.id,
      username_of(new.user_id) || ' commented on your post' || coalesce(' "' || t || '"', ''), 'feed.html');
  end if;
  perform check_post_engagement(new.post_id);
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.on_comment_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare author uuid;
begin
  select user_id into author from comments where id = new.comment_id;
  perform create_notification(author, new.user_id, 'comment_like', new.comment_id,
    username_of(new.user_id) || ' liked your comment', 'feed.html', true);
  perform check_comment_engagement(new.comment_id);
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.on_post_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare author uuid; t text;
begin
  select user_id, title into author, t from posts where id = new.post_id;
  perform create_notification(author, new.user_id, 'post_like', new.post_id,
    username_of(new.user_id) || ' liked your post' || coalesce(' "' || t || '"', ''), 'feed.html', true);
  perform check_post_engagement(new.post_id);
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.on_profile_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    perform award_points(new.id, 'welcome', 'profile', new.id);
  exception when others then
    null;
  end;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.on_review_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare author uuid; pname text;
begin
  select r.user_id, p.brand || ' — ' || p.name into author, pname
  from reviews r join products p on p.id = r.product_id where r.id = new.review_id;
  perform create_notification(author, new.user_id, 'review_like', new.review_id,
    username_of(new.user_id) || ' liked your review of ' || coalesce(pname, 'a product'), 'reviews.html', true);
  perform check_review_engagement(new.review_id);
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.on_review_update_added()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rule point_rules%rowtype;
begin
  select * into rule from point_rules where action = 'review_update';
  if not found then return new; end if;
  if char_length(trim(new.body)) < coalesce(rule.min_chars, 0) then return new; end if;
  if new.body ~ '(.)\1{9,}' then return new; end if;   -- keyboard-mashing
  if not exists (select 1 from point_ledger
                 where action = 'review' and ref_type = 'review' and ref_id = new.review_id and revoked_at is null) then
    return new;
  end if;
  perform award_points(new.user_id, 'review_update', 'review', new.review_id);   -- once per review
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.review_is_quality(p_body text, p_min integer)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select char_length(trim(p_body)) >= p_min
     and p_body !~ '(.)\1{9,}'
     and (select count(distinct w) from regexp_split_to_table(lower(p_body), '\s+') w) >= 20
$function$;
CREATE OR REPLACE FUNCTION public.revoke_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update point_ledger set revoked_at = now()
  where ref_id = old.id and ref_type = tg_argv[0] and revoked_at is null;
  return old;
end $function$;
CREATE OR REPLACE FUNCTION public.username_of(p uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select username from profiles where id = p
$function$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER comment_likes_notify AFTER INSERT ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.on_comment_like();
CREATE TRIGGER comments_notify AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.on_comment();
CREATE TRIGGER comments_revoke BEFORE DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.revoke_on_delete('comment');
CREATE TRIGGER likes_notify AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.on_post_like();
CREATE TRIGGER posts_revoke BEFORE DELETE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.revoke_on_delete('post');
CREATE TRIGGER products_status AFTER UPDATE OF status ON public.products FOR EACH ROW EXECUTE FUNCTION public.handle_product_status();
CREATE TRIGGER profiles_welcome AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.on_profile_created();
CREATE TRIGGER review_likes_notify AFTER INSERT ON public.review_likes FOR EACH ROW EXECUTE FUNCTION public.on_review_like();
CREATE TRIGGER review_updates_points AFTER INSERT ON public.review_updates FOR EACH ROW EXECUTE FUNCTION public.on_review_update_added();
CREATE TRIGGER reviews_points AFTER INSERT OR UPDATE OF body ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.handle_review_points();
CREATE TRIGGER reviews_revoke BEFORE DELETE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.revoke_on_delete('review');
alter table public.biome_slots enable row level security;
alter table public.comment_likes enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.notifications enable row level security;
alter table public.point_ledger enable row level security;
alter table public.point_rules enable row level security;
alter table public.posts enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.review_likes enable row level security;
alter table public.review_standouts enable row level security;
alter table public.review_updates enable row level security;
alter table public.reviews enable row level security;
create policy "Members can view biomes" on public.biome_slots as PERMISSIVE for SELECT to authenticated using (true);
create policy "Members can like comments as themselves" on public.comment_likes as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Members can read comment likes" on public.comment_likes as PERMISSIVE for SELECT to authenticated using (true);
create policy "Members can remove their own comment likes" on public.comment_likes as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Members can delete their own comments" on public.comments as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Members can read comments" on public.comments as PERMISSIVE for SELECT to authenticated using (true);
create policy "Members can write their own comments" on public.comments as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Members can like as themselves" on public.likes as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Members can read likes" on public.likes as PERMISSIVE for SELECT to authenticated using (true);
create policy "Members can remove their own likes" on public.likes as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Members can read their notifications" on public.notifications as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Members can read their own ledger" on public.point_ledger as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Moderators can read the whole ledger" on public.point_ledger as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_moderator))));
create policy "Members can read point rules" on public.point_rules as PERMISSIVE for SELECT to authenticated using (true);
create policy "Members can delete their own posts" on public.posts as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Members can edit their own posts" on public.posts as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Members can read posts" on public.posts as PERMISSIVE for SELECT to authenticated using (true);
create policy "Members can write their own posts" on public.posts as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Logged-in users can suggest a product" on public.products as PERMISSIVE for INSERT to public with check (((auth.uid() = suggested_by) AND (status = 'pending'::text)));
create policy "Members can read approved products" on public.products as PERMISSIVE for SELECT to authenticated using ((status = 'approved'::text));
create policy "Moderators can update product status" on public.products as PERMISSIVE for UPDATE to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_moderator = true)))));
create policy "Moderators can update products" on public.products as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_moderator)))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND p.is_moderator))));
create policy "View approved products, or your own pending ones" on public.products as PERMISSIVE for SELECT to public using (((status = 'approved'::text) OR (suggested_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_moderator = true))))));
create policy "Members can read profiles" on public.profiles as PERMISSIVE for SELECT to authenticated using (true);
create policy "Profiles are viewable by everyone" on public.profiles as PERMISSIVE for SELECT to public using (true);
create policy "Members can like reviews as themselves" on public.review_likes as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Members can read review likes" on public.review_likes as PERMISSIVE for SELECT to authenticated using (true);
create policy "Members can remove their own review likes" on public.review_likes as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Review likes are publicly readable" on public.review_likes as PERMISSIVE for SELECT to public using (true);
create policy "Members can read standouts" on public.review_standouts as PERMISSIVE for SELECT to authenticated using (true);
create policy "Review standouts are publicly readable" on public.review_standouts as PERMISSIVE for SELECT to public using (true);
create policy "Authors can add updates to their reviews" on public.review_updates as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM reviews r
  WHERE ((r.id = review_updates.review_id) AND (r.user_id = auth.uid()))))));
create policy "Authors can delete their review updates" on public.review_updates as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Members can read review updates" on public.review_updates as PERMISSIVE for SELECT to authenticated using (true);
create policy "Review updates are publicly readable" on public.review_updates as PERMISSIVE for SELECT to public using (true);
create policy "Members can delete their own reviews" on public.reviews as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Members can edit their own reviews" on public.reviews as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Members can read reviews" on public.reviews as PERMISSIVE for SELECT to authenticated using (true);
create policy "Members can review approved products" on public.reviews as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = reviews.product_id) AND (p.status = 'approved'::text))))));
create policy "Reviews are publicly readable" on public.reviews as PERMISSIVE for SELECT to public using (true);
grant all on all tables in schema public to anon, authenticated;
