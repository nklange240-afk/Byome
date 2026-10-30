-- =========================================================
-- Byome tests: everyday member actions, as real members would do them
-- (through the same permissions and triggers as the site; nothing is
-- switched off). Run on a test database built by tests/build-db.sh;
-- never on the real database. Fails if any action is refused.
-- =========================================================

\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ---------- Test members and things to act on ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'tester-one@example.com', '{"username": "testerone"}'),
  ('00000000-0000-4000-8000-000000000002', 'tester-two@example.com', '{"username": "testertwo"}'),
  ('00000000-0000-4000-8000-000000000003', 'tester-mod@example.com', '{"username": "testermod"}');
update public.profiles set is_moderator = true where id = '00000000-0000-4000-8000-000000000003';
-- (member one is a beta tester, so the beta event's task counting runs
-- alongside everything they do)
insert into public.beta_testers (username) values ('testerone');
-- (accounts a few days old, so new-account limits don't apply)
update public.profiles set created_at = now() - interval '10 days';

insert into public.products (id, name, brand, category, subcategory, variations, status) values
  ('00000000-0000-4000-9000-000000000001', 'Test Mascara', 'Test Brand', 'Makeup', 'Eyes', array['Black'], 'approved'),
  ('00000000-0000-4000-9000-000000000002', 'Test Lip Oil', 'Test Brand', 'Makeup', 'Lips', array['Clear'], 'approved');

-- The results of each action, as the member
create temp table results (label text, outcome text);
grant all on results to authenticated;
create function pg_temp.try(label text, q text) returns void language plpgsql as $$
begin
  execute q;
  insert into results values (label, 'ok');
exception when others then
  insert into results values (label, 'REFUSED: ' || sqlerrm);
end $$;

-- Acting as a member: their role and their login
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

-- ---------- Member two posts, makes a poll and reviews ----------
select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select pg_temp.try('setup: post', $q$insert into posts (title, body, category, user_id) values ('My favourite mascara', 'This one has lasted me all week without smudging.', 'Makeup', auth.uid())$q$);
select pg_temp.try('setup: poll', $q$select create_poll_post('Lip oil or balm?', 'Which do you reach for more in winter?', 'Makeup', array['Oil', 'Balm'], 3)$q$);
select pg_temp.try('setup: review', $q$insert into reviews (product_id, user_id, rating, title, body) values ('00000000-0000-4000-9000-000000000002', auth.uid(), 5, 'Lovely lip oil', 'Glossy without being sticky, and it lasts through coffee.')$q$);
reset role;

-- ---------- Member one does the everyday things ----------
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select pg_temp.try('post', $q$insert into posts (title, body, category, user_id) values ('Testing a post', 'Just checking that posting works fine here.', 'Makeup', auth.uid())$q$);
select pg_temp.try('poll', $q$select create_poll_post('Which one?', 'Tell me your favourite please', 'Makeup', array['A', 'B'], 3)$q$);
select pg_temp.try('comment', $q$insert into comments (post_id, user_id, body) select id, auth.uid(), 'Lovely post, thank you!' from posts where user_id <> auth.uid() limit 1$q$);
select pg_temp.try('like', $q$insert into likes (post_id, user_id) select id, auth.uid() from posts where user_id <> auth.uid() limit 1$q$);
select pg_temp.try('review', $q$insert into reviews (product_id, user_id, rating, title, body) values ('00000000-0000-4000-9000-000000000001', auth.uid(), 4, 'Decent mascara', 'Lengthens nicely and stays put most of the day for me.')$q$);
select pg_temp.try('review update', $q$insert into review_updates (review_id, user_id, body) select id, auth.uid(), 'Still using it a month later, still good.' from reviews where user_id = auth.uid() limit 1$q$);
select pg_temp.try('helpful mark', $q$insert into review_likes (review_id, user_id) select id, auth.uid() from reviews where user_id <> auth.uid() limit 1$q$);
select pg_temp.try('suggest a product', $q$insert into products (name, brand, category, subcategory, suggested_by) values ('Test Cleanser', 'Another Brand', 'Skincare', 'Cleansers', auth.uid())$q$);
select pg_temp.try('suggest a shade', $q$select suggest_variation('00000000-0000-4000-9000-000000000002', 'Rose')$q$);
select pg_temp.try('poll vote', $q$select vote_poll(o.post_id, o.id) from poll_options o join posts p on p.id = o.post_id where p.user_id <> auth.uid() limit 1$q$);
select pg_temp.try('daily surprise', $q$select claim_daily_gift()$q$);
select pg_temp.try('mod mail', $q$select modmail_start('message', 'A question', 'How do I change my shelf?')$q$);
select pg_temp.try('feedback', $q$select modmail_start('feedback', 'An idea', 'It would be lovely to sort reviews by rating.')$q$);
reset role;

-- ---------- A moderator handles things ----------
select pg_temp.act_as('00000000-0000-4000-8000-000000000003');
select pg_temp.try('moderator: approve a suggestion', $q$update products set status = 'approved' where name = 'Test Cleanser'$q$);
reset role;

-- ---------- Every action, as the site saw it ----------
select label as action, outcome from results;

do $$
declare refused text;
begin
  select string_agg(label || ' (' || outcome || ')', '; ') into refused from results where outcome <> 'ok';
  if refused is not null then raise exception 'Some everyday actions were refused: %', refused; end if;
  if (select count(*) from results) < 17 then raise exception 'Some actions didn''t run'; end if;
  -- (a refused update changes nothing without an error, so check the result)
  if not exists (select 1 from products where name = 'Test Cleanser' and status = 'approved') then
    raise exception 'The moderator''s approval didn''t take effect';
  end if;
end $$;
