-- =========================================================
-- Byome: no links, except from moderators.
--
-- Members can't put links to other websites in posts (headings and text),
-- comments, reviews, review updates, poll options or bios. They're told
-- straight away and nothing is posted. Moderators can still share links,
-- and links to byome.xyz are fine for everyone. Mod mail is left alone,
-- so members can still send moderators a link if they need to.
--
-- What counts as a link: anything starting http:// or https://, anything
-- starting www., and website names like glossier.com or bit.ly/abc (the
-- common endings: .com, .net, .org, .co, .shop and so on, in small
-- letters). Posts that
-- already have links keep them; the check is on new writing and edits.
--
-- Safe to run again. Paste the whole file with nothing highlighted. Run it
-- before publishing the site update that came with it.
-- =========================================================

-- Does this text have a link to somewhere other than Byome?
create or replace function public.has_link(p_text text) returns boolean
language sql immutable set search_path to public as $$
  select coalesce(
    t ~* '(https?://|\mwww\.)'
    -- (website endings in small letters only, so a missed space like
    -- "so good.So" isn't mistaken for a link)
    or t ~ '\m[A-Za-z0-9-]+\.(com|net|org|co|io|xyz|ly|me|shop|store|link|app|gg|tv|us|uk|ca|au|nz|ie|de|fr|es|it|nl|in|ee|info|biz|site|online|bio|club|top|page|blog|ai|to|be|gl|so|cc|fm|beauty|skin|makeup)(\M|/)',
    false)
  from (select regexp_replace(p_text, '(https?://)?(www\.)?byome\.xyz\S*', '', 'gi') as t) x
$$;

create or replace function public.block_links() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  r jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  f text;
begin
  -- the SQL Editor and the site's own jobs, and moderators, can post links
  if auth.uid() is null or is_moderator() then return new; end if;
  foreach f in array array['title', 'body', 'label', 'bio'] loop
    if r ? f and has_link(r->>f) and (o is null or o->>f is distinct from r->>f) then
      raise exception 'Links can''t be posted on Byome. Please take the link out and try again (you can still name the brand or shop).';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.block_links() from public, anon, authenticated;

drop trigger if exists block_links on public.posts;
create trigger block_links before insert or update of title, body on public.posts
  for each row execute function public.block_links();
drop trigger if exists block_links on public.comments;
create trigger block_links before insert or update of body on public.comments
  for each row execute function public.block_links();
drop trigger if exists block_links on public.reviews;
create trigger block_links before insert or update of title, body on public.reviews
  for each row execute function public.block_links();
drop trigger if exists block_links on public.review_updates;
create trigger block_links before insert or update of body on public.review_updates
  for each row execute function public.block_links();
drop trigger if exists block_links on public.poll_options;
create trigger block_links before insert or update of label on public.poll_options
  for each row execute function public.block_links();
drop trigger if exists block_links on public.profiles;
create trigger block_links before update of bio on public.profiles
  for each row execute function public.block_links();

-- Check (should say: true, true, true, true, false, false, false)
select public.has_link('see https://example.com') as https,
       public.has_link('www.sephora.com has it') as www,
       public.has_link('I got it from glossier.com/boy-brow') as website,
       public.has_link('linktr.ee/me') as linktree,
       public.has_link('My post: https://byome.xyz/feed.html?post=1') as byome_link,
       public.has_link('I love e.l.f. and Dr. Jart, i.e. everything') as brand_dots,
       public.has_link('No7 is great.So is St. Ives, so good.It works') as sentences;
