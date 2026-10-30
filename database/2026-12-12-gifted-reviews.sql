-- =========================================================
-- Byome: a "Gifted" box on reviews.
--
-- When writing or editing a review, members can tick "Gifted" if a brand
-- gave them the product, paid them, or they're connected to the brand in
-- another way. Their review then shows a "Gifted" tag. Existing reviews
-- start unticked.
--
-- Safe to run again. Paste the whole file with nothing highlighted. Run it
-- before publishing the site update that came with it.
-- =========================================================

alter table public.reviews add column if not exists gifted boolean not null default false;

-- Tell the API about the new column straight away
notify pgrst, 'reload schema';

-- Check: how many reviews are marked gifted (0 to begin with)
select count(*) filter (where gifted) as gifted_reviews, count(*) as all_reviews from public.reviews;
