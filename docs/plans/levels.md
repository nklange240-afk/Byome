# Plan: member levels (agreed, not built yet)

Levels show how much a member has grown with Byome. They have to exist **before member photos** (see `photos.md`), because photo uploads unlock at level 2.

## The levels

| Level | Name | To reach it |
|---|---|---|
| 1 | 🌰 Seed | Join Byome |
| 2 | 🌱 Sprout | Account at least **3 days** old, and at least **1 published review** |
| 3 | 🪴 Sapling | At least **25 contributions** (see below) |
| 4 | 🌸 Bloom | At least **100 published reviews**, then **approved by a moderator** |
| 5 | 🌳 Evergreen | Everything for Bloom, plus at least **25 standout reviews** |

There's no "Seedling" level, since it's too easy to confuse with Sprout.

**For every level up:** the member has **no active account restrictions**.

## Contributions (for Sapling)
Each of these counts as one contribution:
- a **published review**
- a **Community post or poll that someone else has engaged with**: a like, a comment, or a poll vote
- an **approved product suggestion**

**What doesn't count:**
- comments on their own (too easy to spam; good commenters reach Sapling through posts and reviews)
- engagement from the poster themselves
- engagement from members who have blocked, or are blocked by, the poster
- engagement from Seed (level 1) accounts. It has to come from a **Sprout or higher**, so a brand-new second account can't boost someone.

## What "published" means
- **Live on the site.** Anything a moderator removed never counts toward any level.
- **Held by automod:** doesn't count while held, but counts once a moderator approves it. The word filter is strict on purpose, so an innocent word mustn't permanently cost anyone.

## Bloom: the moderator check
- **When a member reaches 100 published reviews,** they appear in a **"Ready to Bloom"** list on the Moderate page.
- **"Thoughtful" is left to the moderators.** They scroll through the member's reviews, read a few at random, and check that the overall quality is decent. There's no minimum length: a thoughtful reviewer can say more in 90 characters than others say in 200.
- **The list shows each member's:**
  - published review count
  - standout count
  - account age
  - **helpful stats:** how many different people found their reviews helpful, and the total helpful marks
- **Moderators can:**
  - **Approve** them to Bloom (with a celebration for the member)
  - **Not yet**, with a private note for the team, and they can be looked at again later
- **While waiting,** the member sees "Bloom: your reviews are being looked at by our team 🌸".

## Evergreen
- **Everything for Bloom, plus 25 standout reviews.** Standouts are given by moderators, so this is "moderator-recognised quality, sustained over time": a long road, on purpose, for the top level.
- **May need more thought** before building (agreed with the owner).

## Rules
- **Levels never go down on their own.**
- **A moderator can demote someone** if they feel it's appropriate. It's logged, and the member is told kindly.
- **Moderation isn't tied to levels,** so moderators never hesitate to moderate carefully and err on the side of caution. Content being held or removed doesn't take a level away.
- **Active restrictions pause progress:** a restricted member doesn't level up until the restriction ends, but keeps their current level.
- **Level badges are public:** a small badge next to every username, seen by everyone.

## Restrictions (built alongside levels)
Levels depend on "no active account restrictions", so restrictions are built with them. Moderators can restrict a member from:
- posting in the Community
- commenting
- uploading photos (when photos exist)

Each restriction has:
- a **reason**, and the member is told why
- a **length**: 7 days, 30 days, or permanent
- an entry in the moderation log
- a way for any moderator to lift it

Banning a member from the site entirely stays a separate, more serious action.

## Already built (October 2026)
- **Helpful stats** (`database/2026-11-21-helpful-stats.sql`): each profile shows "54 people found AliceB's reviews helpful". It counts different people, not votes, only live reviews, and never the member's own marks. It'll also appear in the Bloom list.

## Still to design before building
- Perks for each level, beyond photos at Sprout. Ideas so far: level-only pots or plants in the shop, a level-up celebration with a shelf item, and something special at Evergreen.
- The badge design, the level-up pop-up, and where progress shows (for example "12 of 25 contributions to Sapling" on your own profile).
- Evergreen's final requirements.
