# Database

byome's database lives in Supabase. These files are a backup and a history of changes.

- `schema-export-YYYY-MM-DD.csv`: a snapshot of every table, security rule, function and trigger.
  To make a new one, run `export-schema-query.sql` in the Supabase SQL Editor and export the result as CSV.
- `YYYY-MM-DD-*.sql`: changes that were run in the SQL Editor, oldest first.
  (The export taken on 2026-10-02 is from *before* `2026-10-02-security-fix.sql` was run.)

## Change log
- `2026-10-02-security-fix.sql`: stop members calling point/notification functions directly; lock review/post fields after posting.
- `2026-10-02-automod.sql`: word filter that holds flagged posts, comments, reviews and review updates for moderator review; username rules. **Run this before publishing the site update that came with it**, because the pages now ask the database for `held_at`.
- `2026-10-02-biome-shop.sql`: biome item catalogue, inventories, the Biome shop (buy with biome points) and arranging your shelf; balances made private. **Run before publishing** the site update that came with it (biome-shop.html, the profile shelf).
- `2026-10-02-reports.sql`: members can report posts, comments and reviews (nothing is hidden; reports go to the Moderate page). **Run before publishing** the site update that came with it.
- `2026-10-02-achievements.sql`: achievements system; "Welcome to byome" gives every member (new and existing) a Welcome sprout, placed on their shelf in a terra cotta pot. Choosing a plant for an empty spot uses the terra cotta pot by default.
- `2026-10-02-sprout-story.sql`: the Welcome sprout's description (shown in the shelf info box).
- `2026-10-03-zebra-haworthia.sql`: adds the Zebra haworthia to the shop (uncommon, 120 points).
- `2026-10-03-moderator-alerts.sql`: moderators get a notification for new product suggestions, automod holds and reports; `moderation_counts()` powers the badge on the Moderate link.
- `2026-10-03-profiles.sql`: optional skin & hair profile, profile pictures (the `avatars` storage bucket), reporting profiles (moderators can remove a picture or reset a username), and deleting your account (reviews, posts and comments stay as "Deleted member" unless you choose to delete them).
- `2026-10-03-african-violet.sql`: plants can be marked `over_pot` (drawn in front of the pot); adds the African violet to the shop (uncommon, 150 points).
- `2026-10-03-terry-and-sweetheart.sql`: "one per member" limit for shop items (`max_per_member`); the Terry pot (rare, 200 points, 1 per member); the Sweetheart pot, earned with the "Spread the love" achievement (give 50 likes to other members' posts, comments and reviews).
- `2026-10-03-avatar-ring.sql`: a colored ring around profile pictures (gold by default; members pick from 7 colors on Edit profile).
- `2026-10-03-first-bloom.sql`: the "First bloom" achievement (first review that passes the quality check), rewarded with a Bunch of daisies.
- `2026-10-10-moderator-rewards.sql`: moderators earn 5 Byome points for each moderation action: approving or removing held content, keeping or removing reported content, acting on a reported profile, and approving, rejecting or editing a product suggestion. Each counts once per item, and never for your own things. Point messages now say "Byome points" and skip zero amounts.
- `2026-10-10-profile-biomes.sql`: profile biomes. Members choose the biome their profile page is set in (Forest and Meadow free; Desert and Snowy tundra 300, Open ocean 400, Coral reef 500 in the shop, one each), and can show its symbol next to their username. Run after the moderator rewards file.
- `2026-10-10-helpful-reviews.sql`: reviews keep a `helpful_count` (the leaf on reviews now reads "Helpful"), so the Reviews page can sort by most helpful. Members can't change their own count.
- `2026-10-11-moderation-log.sql`: the moderation log (every moderation action, readable by moderators only, shown on the Moderate page); moderation notifications marked positive or negative (green or red flag); and members can no longer tell which moderator acted (reports and standout marks stop storing the moderator, moderation notifications never name one).
- `2026-10-11-helpful-wording.sql`: the notification for "Helpful" on reviews reads "found your review of … helpful" (existing ones reworded too).

- `2026-10-11-profiles-catch-up.sql`: adds the parts of `2026-10-03-profiles.sql` that never reached the live database (reporting profiles, deleting your account, picture storage rules). Skips anything already there. Run it before the moderation log file.
- `2026-10-11-returned-content.sql`: moderators pick a reason (and can add a short note) for every removal, and the member is told both; removed posts and reviews also leave the author a private copy ("Returned to you" on their profile) to revise and resubmit (held for a moderator first) or let go. Run after the moderation log file.

**Not sure what's been run?** `check-what-has-run.sql` is read-only: run it in the SQL Editor and it lists every update above as "yes" or "MISSING".
- `2026-10-11-capital-byome.sql`: "Byome" with a capital B in text stored in the database (the "Welcome to Byome" achievement, the sprout's story, and notifications already sent). Web and email addresses stay lowercase.
- `2026-10-12-byome-shop.sql`: the Biome shop is now the Byome Shop (renames purchases in points activity).
