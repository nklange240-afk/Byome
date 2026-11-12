-- =========================================================
-- Byome: quick questions. A few optional Yes / No questions about a
-- product, shown in the review form (a warm-up before writing) and on
-- their own from a product page ("Answer quick questions"). The answers add
-- up into "At a glance" on the product page. Written reviews stay the
-- heart of Byome; these are a shortcut and a summary, not a replacement.
--
--   - Each category has its own questions, and some subcategories have
--     their own (tools, sun care, deodorant, nail polish, nail care).
--     They live in quick_questions, so wording can be changed here with SQL:
--       update quick_questions set prompt = 'New wording?' where key = 'sk-texture';
--       update quick_questions set active = false where key = 'sk-texture';
--   - Points: 3 Byome points for answering 3 or more questions about a
--     product, once per product, the same with or without a written review,
--     on up to 5 products a day. Dropping back below 3 answers takes the
--     points back (and answering again gives them back).
--   - Writing a full review later is never penalised: the review earns its
--     usual points, and the form arrives with the earlier answers filled in.
--   - Levels: every 4 products answered (3+ answers, and no written review
--     of that product) count as 1 review, for up to a fifth of a level:
--     5 of Sapling's 25 contributions, 20 of Bloom's 100 reviews. Sprout
--     still needs a real written review.
--   - The answers are private. Everyone else sees only the totals, in "At a
--     glance": how many said Yes and how many answered each question, from
--     the first answer on. They never go in the feed or on a review.
--
-- Run in the Supabase SQL Editor BEFORE merging the site update that came
-- with it. Safe to run again. Paste the whole file with nothing
-- highlighted. Needs 2026-11-28-levels.sql and 2026-11-30-restrictions.sql
-- first.
-- =========================================================

-- ---------- The questions ----------
create table if not exists public.quick_questions (
  key text primary key,
  category text not null,
  subcategories text[],                       -- only these subcategories (null = all)
  except_subcategories text[] not null default '{}',
  parent_key text references public.quick_questions(key) on delete cascade,  -- a follow-up, asked after a Yes
  prompt text not null,                       -- the question
  label text not null,                        -- its short name in "At a glance"
  sort_order integer not null default 0,
  active boolean not null default true
);
alter table public.quick_questions enable row level security;
drop policy if exists "Anyone can see the quick questions" on public.quick_questions;
create policy "Anyone can see the quick questions" on public.quick_questions for select using (true);

-- (follow-ups are listed after the question they follow)
insert into public.quick_questions (key, category, subcategories, except_subcategories, parent_key, prompt, label, sort_order) values
  -- Skincare
  ('sk-texture',   'Skincare', null, '{}', null, 'Did you like the texture?', 'Liked the texture', 10),
  ('sk-better',    'Skincare', null, '{}', null, 'Did your skin look or feel better after using it?', 'Skin looked or felt better', 20),
  ('sk-irritate',  'Skincare', null, '{}', null, 'Did it irritate your skin or cause breakouts?', 'Irritation or breakouts', 30),
  ('sk-scent',     'Skincare', null, '{}', null, 'Did it have a noticeable scent?', 'Noticeable scent', 40),
  ('sk-scent-like','Skincare', null, '{}', 'sk-scent', 'Did you like the scent?', 'Liked the scent', 41),
  ('sk-packaging', 'Skincare', null, '{}', null, 'Was the packaging easy to use?', 'Packaging easy to use', 50),
  ('sk-sun-cast',  'Skincare', '{"Sun Care"}', '{}', null, 'Did it leave a white cast?', 'White cast', 60),
  ('sk-sun-sting', 'Skincare', '{"Sun Care"}', '{}', null, 'Did it sting your eyes?', 'Stung eyes', 61),
  ('sk-value',     'Skincare', null, '{}', null, 'Is it good value for the price?', 'Good value', 90),
  -- Makeup
  ('mk-apply',     'Makeup', null, '{"Tools & Brushes"}', null, 'Was it easy to apply and blend?', 'Easy to apply and blend', 10),
  ('mk-wear',      'Makeup', null, '{"Tools & Brushes"}', null, 'Did it stay put as long as you needed?', 'Stayed put', 20),
  ('mk-shade',     'Makeup', null, '{"Tools & Brushes"}', null, 'Did the shade match what you expected?', 'Shade as expected', 30),
  ('mk-irritate',  'Makeup', null, '{"Tools & Brushes"}', null, 'Did it irritate your skin or eyes?', 'Irritation', 40),
  ('mk-scent',     'Makeup', null, '{"Tools & Brushes"}', null, 'Did it have a noticeable scent?', 'Noticeable scent', 50),
  ('mk-scent-like','Makeup', null, '{"Tools & Brushes"}', 'mk-scent', 'Did you like the scent?', 'Liked the scent', 51),
  ('mk-packaging', 'Makeup', null, '{"Tools & Brushes"}', null, 'Was the packaging easy to use?', 'Packaging easy to use', 60),
  ('mk-tool-comfort', 'Makeup', '{"Tools & Brushes"}', '{}', null, 'Was it comfortable and easy to use?', 'Comfortable and easy to use', 10),
  ('mk-tool-holdup',  'Makeup', '{"Tools & Brushes"}', '{}', null, 'Has it held up well over time?', 'Held up over time', 20),
  ('mk-tool-shed',    'Makeup', '{"Tools & Brushes"}', '{}', null, 'Does it shed?', 'Sheds', 30),
  ('mk-value',     'Makeup', null, '{}', null, 'Is it good value for the price?', 'Good value', 90),
  -- Hair Care
  ('hr-better',    'Hair Care', null, '{"Tools & Accessories"}', null, 'Did your hair look or feel better after using it?', 'Hair looked or felt better', 10),
  ('hr-type',      'Hair Care', null, '{"Tools & Accessories"}', null, 'Did it work well for your hair type?', 'Worked for their hair type', 20),
  ('hr-easy',      'Hair Care', null, '{"Tools & Accessories"}', null, 'Was it easy to use?', 'Easy to use', 30),
  ('hr-scent',     'Hair Care', null, '{"Tools & Accessories"}', null, 'Did it have a noticeable scent?', 'Noticeable scent', 40),
  ('hr-scent-like','Hair Care', null, '{"Tools & Accessories"}', 'hr-scent', 'Did you like the scent?', 'Liked the scent', 41),
  ('hr-irritate',  'Hair Care', null, '{"Tools & Accessories"}', null, 'Did it irritate your scalp?', 'Scalp irritation', 50),
  ('hr-tool-comfort', 'Hair Care', '{"Tools & Accessories"}', '{}', null, 'Was it comfortable and easy to use?', 'Comfortable and easy to use', 10),
  ('hr-tool-holdup',  'Hair Care', '{"Tools & Accessories"}', '{}', null, 'Has it held up well over time?', 'Held up over time', 20),
  ('hr-value',     'Hair Care', null, '{}', null, 'Is it good value for the price?', 'Good value', 90),
  -- Body Care
  ('bd-texture',   'Body Care', null, '{"Deodorant"}', null, 'Did you like the texture?', 'Liked the texture', 10),
  ('bd-deo-fresh', 'Body Care', '{"Deodorant"}', '{}', null, 'Did it keep you fresh all day?', 'Kept them fresh all day', 11),
  ('bd-deo-dry',   'Body Care', '{"Deodorant"}', '{}', null, 'Did it keep you dry? (antiperspirants)', 'Kept them dry', 12),
  ('bd-deo-marks', 'Body Care', '{"Deodorant"}', '{}', null, 'Did it leave marks on clothes?', 'Marks on clothes', 13),
  ('bd-feel',      'Body Care', null, '{}', null, 'Did your skin feel good afterward?', 'Skin felt good afterward', 20),
  ('bd-irritate',  'Body Care', null, '{}', null, 'Did it irritate your skin?', 'Irritation', 30),
  ('bd-scent',     'Body Care', null, '{}', null, 'Did it have a noticeable scent?', 'Noticeable scent', 40),
  ('bd-scent-like','Body Care', null, '{}', 'bd-scent', 'Did you like the scent?', 'Liked the scent', 41),
  ('bd-packaging', 'Body Care', null, '{}', null, 'Was the packaging easy to use?', 'Packaging easy to use', 50),
  ('bd-sun-cast',  'Body Care', '{"Sun Care"}', '{}', null, 'Did it leave a white cast?', 'White cast', 60),
  ('bd-sun-sting', 'Body Care', '{"Sun Care"}', '{}', null, 'Did it sting your eyes?', 'Stung eyes', 61),
  ('bd-value',     'Body Care', null, '{}', null, 'Is it good value for the price?', 'Good value', 90),
  -- Fragrance
  ('fr-smell',     'Fragrance', null, '{}', null, 'Did you like how it smells?', 'Liked how it smells', 10),
  ('fr-last',      'Fragrance', null, '{}', null, 'Did the scent last as long as you wanted?', 'Lasted as long as wanted', 20),
  ('fr-project',   'Fragrance', null, '{}', null, 'Could other people notice it?', 'Others could notice it', 30),
  ('fr-drydown',   'Fragrance', null, '{}', null, 'Did you like how it changed as it wore on?', 'Liked how it changed', 40),
  ('fr-bottle',    'Fragrance', null, '{}', null, 'Do you like the bottle and/or sprayer?', 'Liked the bottle or sprayer', 50),
  ('fr-value',     'Fragrance', null, '{}', null, 'Is it good value for the price?', 'Good value', 90),
  -- Nail Products: polish and nail art
  ('np-apply',     'Nail Products', '{"Polish","Nail Art"}', '{}', null, 'Was it easy to apply?', 'Easy to apply', 10),
  ('np-chip',      'Nail Products', '{"Polish","Nail Art"}', '{}', null, 'Did it last without chipping as long as you wanted?', 'Lasted without chipping', 20),
  ('np-colour',    'Nail Products', '{"Polish","Nail Art"}', '{}', null, 'Did the colour match what you expected?', 'Colour as expected', 30),
  ('np-dry',       'Nail Products', '{"Polish"}', '{}', null, 'Did it dry quickly enough?', 'Dried quickly enough', 40),
  ('np-scent',     'Nail Products', '{"Polish","Nail Art"}', '{}', null, 'Did it have a noticeable scent?', 'Noticeable scent', 50),
  ('np-scent-strong','Nail Products', '{"Polish","Nail Art"}', '{}', 'np-scent', 'Was the scent too strong?', 'Scent too strong', 51),
  -- Nail Products: nail care (cuticle oils, serums, strengtheners, creams)
  ('nc-texture',   'Nail Products', '{"Care & Treatment"}', '{}', null, 'Did you like the texture?', 'Liked the texture', 10),
  ('nc-healthier', 'Nail Products', '{"Care & Treatment"}', '{}', null, 'Did your nails or cuticles look or feel healthier after using it?', 'Nails or cuticles healthier', 20),
  ('nc-absorb',    'Nail Products', '{"Care & Treatment"}', '{}', null, 'Did it absorb without leaving a greasy feel?', 'Absorbed without greasiness', 30),
  ('nc-irritate',  'Nail Products', '{"Care & Treatment"}', '{}', null, 'Did it irritate your skin?', 'Irritation', 40),
  ('nc-scent',     'Nail Products', '{"Care & Treatment"}', '{}', null, 'Did it have a noticeable scent?', 'Noticeable scent', 50),
  ('nc-scent-like','Nail Products', '{"Care & Treatment"}', '{}', 'nc-scent', 'Did you like the scent?', 'Liked the scent', 51),
  ('nc-packaging', 'Nail Products', '{"Care & Treatment"}', '{}', null, 'Was the packaging easy to use?', 'Packaging easy to use', 60),
  -- Nail Products: tools
  ('nt-comfort',   'Nail Products', '{"Tools"}', '{}', null, 'Was it comfortable and easy to use?', 'Comfortable and easy to use', 10),
  ('nt-holdup',    'Nail Products', '{"Tools"}', '{}', null, 'Has it held up well over time?', 'Held up over time', 20),
  ('nail-value',   'Nail Products', null, '{}', null, 'Is it good value for the price?', 'Good value', 90)
on conflict (key) do nothing;

-- The questions for one product, in order (follow-ups after their question)
create or replace function public.quick_questions_for(p_product uuid)
returns table (key text, parent_key text, prompt text, label text)
language sql stable security definer set search_path to public as $$
  select q.key, q.parent_key, q.prompt, q.label
  from products p
  join quick_questions q on q.category = p.category and q.active
  where p.id = p_product
    and (q.subcategories is null or p.subcategory = any (q.subcategories))
    and not (coalesce(p.subcategory, '') = any (q.except_subcategories))
    -- a nail product without a subcategory only gets the shared question
  order by q.sort_order, q.key
$$;
grant execute on function public.quick_questions_for(uuid) to anon, authenticated;


-- ---------- Answers ----------
create table if not exists public.quick_answers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  question_key text not null references public.quick_questions(key) on delete cascade,
  answer boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id, question_key)
);
create index if not exists quick_answers_product on public.quick_answers (product_id);
alter table public.quick_answers enable row level security;
-- Each member sees only their own answers; everyone else sees the totals
drop policy if exists "See your own quick answers" on public.quick_answers;
create policy "See your own quick answers" on public.quick_answers for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.point_rules (action, label, community_points, biome_points, notify, description, daily_cap, delay_hours)
values ('quick_answers', 'Answered quick questions', 0, 3, false,
        'Answering 3 or more quick questions about a product (once per product, up to 5 products a day).', 5, 0)
on conflict (action) do nothing;

-- Save your answers for a product (all of them at once: a question left
-- out is cleared). p_answers is like {"sk-texture": true, "sk-value": false}.
create or replace function public.save_quick_answers(p_product uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  x restrictions%rowtype;
  answered integer;
  earned boolean := false;
  had_points boolean;
  clean jsonb;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if not exists (select 1 from profiles where id = me and deleted_at is null) then raise exception 'Please log in first'; end if;
  if not exists (select 1 from products where id = p_product and status = 'approved') then
    raise exception 'That product isn''t on Byome yet';
  end if;
  x := active_restriction(me, 'reviewing');
  if x.id is not null then raise exception 'Reviewing is paused on your account for now. Reason: %', x.reason; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'Those answers aren''t readable'; end if;
  perform pg_advisory_xact_lock(hashtext('quick-answers'), hashtext(me::text));

  -- Keep only real yes/no answers to this product's questions; a follow-up
  -- only counts after a Yes to the question it follows. (No scratch table:
  -- the site's requests refuse a delete without a where.)
  select coalesce(jsonb_object_agg(q.key, p_answers -> q.key), '{}'::jsonb) into clean
  from quick_questions_for(p_product) q
  where jsonb_typeof(p_answers -> q.key) = 'boolean'
    and (q.parent_key is null or (p_answers ->> q.parent_key) = 'true');

  delete from quick_answers a where a.user_id = me and a.product_id = p_product
    and not (clean ? a.question_key);
  insert into quick_answers (user_id, product_id, question_key, answer, updated_at)
  select me, p_product, e.key, e.value::boolean, now() from jsonb_each_text(clean) e
  on conflict (user_id, product_id, question_key) do update
    set answer = excluded.answer,
        updated_at = case when quick_answers.answer is distinct from excluded.answer then now() else quick_answers.updated_at end;

  select count(*) into answered from quick_answers where user_id = me and product_id = p_product;
  had_points := exists (select 1 from point_ledger where user_id = me and action = 'quick_answers'
                        and ref_id = p_product and revoked_at is null);
  if answered >= 3 and not had_points then
    earned := award_points(me, 'quick_answers', 'product', p_product);
  elsif answered < 3 and had_points then
    update point_ledger set revoked_at = now()
    where user_id = me and action = 'quick_answers' and ref_id = p_product and revoked_at is null;
  end if;

  perform refresh_level(me);
  return jsonb_build_object(
    'answered', answered,
    'earned', earned,
    'has_points', answered >= 3 and (had_points or earned));
end $$;
revoke execute on function public.save_quick_answers(uuid, jsonb) from public, anon;
grant execute on function public.save_quick_answers(uuid, jsonb) to authenticated;

-- "At a glance": the totals for each question, for a product page (how
-- many said Yes, and how many answered)
create or replace function public.quick_answer_stats(p_product uuid) returns jsonb
language sql stable security definer set search_path to public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', q.key, 'parent_key', q.parent_key, 'label', q.label,
      'yes', t.yes, 'answers', t.answers) order by q.n), '[]'::jsonb)
  from (select q.*, row_number() over () as n from quick_questions_for(p_product) q) q
  join lateral (
    select count(*) filter (where a.answer) as yes, count(*) as answers
    from quick_answers a
    join profiles pr on pr.id = a.user_id and pr.deleted_at is null
    where a.product_id = p_product and a.question_key = q.key
  ) t on t.answers >= 1
$$;
grant execute on function public.quick_answer_stats(uuid) to anon, authenticated;


-- ---------- Levels: 4 products answered count as 1 review ----------
-- (the same as in 2026-11-28-levels.sql, plus quick questions: products
-- with 3+ answers and no written review of their own count 4 for 1, for up
-- to 5 of Sapling's 25 contributions and 20 of Bloom's 100 reviews)
create or replace function public.level_stats(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  joined timestamptz;
  reviews_n int;
  posts_n int;
  products_n int;
  standouts_n int;
  helpful_n int;
  marks_n int;
  quick_n int;
begin
  select created_at into joined from profiles where id = p_user;
  select count(*) into reviews_n from reviews where user_id = p_user and held_at is null;
  -- Posts and polls someone else (a Sprout or higher, not blocked either
  -- way) liked, commented on or voted in
  select count(*) into posts_n from posts p
  where p.user_id = p_user and p.held_at is null and (
    exists (select 1 from likes l join profiles e on e.id = l.user_id
            where l.post_id = p.id and l.user_id <> p_user and e.level >= 2 and not blocked_between(p_user, e.id))
    or exists (select 1 from comments c join profiles e on e.id = c.user_id
               where c.post_id = p.id and c.held_at is null and c.user_id <> p_user and e.level >= 2
                 and not blocked_between(p_user, e.id))
    or exists (select 1 from poll_votes v join profiles e on e.id = v.user_id
               where v.post_id = p.id and v.user_id <> p_user and e.level >= 2 and not blocked_between(p_user, e.id)));
  select count(*) into products_n from products where suggested_by = p_user and status = 'approved';
  select count(*) into standouts_n from review_standouts s join reviews r on r.id = s.review_id
  where r.user_id = p_user and r.held_at is null;
  select count(distinct l.user_id), count(*) into helpful_n, marks_n from review_likes l join reviews r on r.id = l.review_id
  where r.user_id = p_user and r.held_at is null and l.user_id <> p_user;
  -- Products answered (3+ answers) without a written review of their own
  select count(*) into quick_n from (
    select a.product_id from quick_answers a
    where a.user_id = p_user
      and not exists (select 1 from reviews r where r.user_id = p_user and r.product_id = a.product_id)
    group by a.product_id having count(*) >= 3) q;

  return jsonb_build_object(
    'joined', joined,
    'days', floor(extract(epoch from now() - coalesce(joined, now())) / 86400),
    'reviews', reviews_n,
    'posts', posts_n,
    'products', products_n,
    'quick', quick_n,
    'quick_contributions', least(quick_n / 4, 5),
    'quick_reviews', least(quick_n / 4, 20),
    'contributions', reviews_n + posts_n + products_n + least(quick_n / 4, 5),
    'bloom_reviews', reviews_n + least(quick_n / 4, 20),
    'standouts', standouts_n,
    'helpful', helpful_n,
    'helpful_marks', marks_n,
    'six_months', coalesce(joined, now()) <= now() - interval '6 months');
end $$;
revoke execute on function public.level_stats(uuid) from public, anon, authenticated;

-- (the same as in 2026-11-28-levels.sql, except that Bloom looks at
-- bloom_reviews: written reviews plus up to 20 from quick questions)
create or replace function public.refresh_level(p_user uuid) returns smallint
language plpgsql security definer set search_path to public as $$
declare
  pr profiles%rowtype;
  s jsonb;
  target smallint;
begin
  select * into pr from profiles where id = p_user;
  if not found or pr.deleted_at is not null then return null; end if;
  s := level_stats(p_user);
  target := level_earned(p_user, pr.level, s);

  -- Ready to Bloom: 100 reviews puts a Sapling on the moderators' list
  if pr.level = 3 and (s->>'bloom_reviews')::int >= 100 and not has_active_restriction(p_user) then
    insert into level_requests (user_id, kind, target_level) values (p_user, 'bloom', 4) on conflict do nothing;
  end if;

  if target <= pr.level or has_active_restriction(p_user) then return pr.level; end if;
  if pr.level_needs_approval then
    insert into level_requests (user_id, kind, target_level) values (p_user, 'level_up', target)
    on conflict (user_id, kind) do update set target_level = excluded.target_level;
    return pr.level;
  end if;
  perform set_member_level(p_user, target);
  return target;
end $$;
revoke execute on function public.refresh_level(uuid) from public, anon, authenticated;

-- Tell the API about the new tables and functions straight away
notify pgrst, 'reload schema';
