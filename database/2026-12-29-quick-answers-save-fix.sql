-- =========================================================
-- Byome: a fix for saving quick questions. The first version cleared a
-- scratch list with a "delete" that had no "where", and Supabase refuses
-- those for the site's requests ("DELETE requires a WHERE clause"), so no
-- answers could be saved. This is the same function without the scratch
-- list. Nothing else changes, and no answers were lost (none could save).
--
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-12-28-quick-questions.sql first.
-- =========================================================

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

notify pgrst, 'reload schema';
