# Plan: member levels (agreed, not built yet)

Levels show how much a member has grown with Byome. They have to exist **before member photos** (see `photos.md`), because photo uploads unlock at level 2.

## The levels

| Level | Name | To reach it |
|---|---|---|
| 1 | 🌰 Seed | Join Byome |
| 2 | 🌱 Sprout | Account at least **3 days** old, and at least **1 published review** |
| 3 | 🪴 Sapling | At least **25 contributions** (see below) |
| 4 | 🌸 Bloom | At least **100 published reviews**, then **approved by a moderator** |
| 5 | 🌳 Evergreen | Everything for Bloom, plus at least **5 standout reviews**, at least **50 different people** have found their reviews helpful, and a member for at least **6 months** |

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
- **Everything for Bloom, plus:**
  - at least **5 standout reviews** (moderator-recognised quality)
  - at least **50 different people** have found their reviews helpful (the community's recognition, using the helpful stats already built)
  - a member for at least **6 months** (it can't be rushed, which suits an evergreen)
- **Why 6 months:** it gives the top level prestige from the start, since nobody can reach it before about spring 2027, and time to see how the earlier levels feel. Lowering it later is a one-line change; raising it after people have qualified would feel unfair.

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

## Perks
Levels also act as a built-in trust filter: features that are harder to moderate can open only to members who've already shown they're here in good faith, which keeps spammers and pests out.

- **Sprout:** photo uploads (see `photos.md`).
- **Level-exclusive drops:**
  - Byome Shop items (and eventually real beauty products) can require a minimum level.
  - **Anyone at that level or higher** can get them. For example, an Evergreen can buy a Bloom-exclusive drop.
  - Members below the level still see the item, locked, with a friendly "Unlocks at 🌸 Bloom" note.
- **A level-only Community space:** a section only members at a given level or higher can see and post in (for example "Bloom & up"). It has the same moderation as the rest of the Community: automod, reports and blocking.
- **Private messages (future idea),** locked to higher levels. This needs its own safety plan before building, like `photos.md`, covering:
  - blocking also stopping messages
  - a Report button on messages
  - a daily message limit
  - clear rules on when moderators can see messages (for example, only reported ones)
  - a privacy policy update

## Real beauty products (future)
Physical drops or giveaways bring real-world rules that digital items don't:
- **Giveaway law:** US giveaways have legal rules (usually "no purchase necessary", official rules, and state-specific requirements). Check with a lawyer, under the LLC, before the first one.
- **Shipping:** collecting addresses needs a privacy policy update and careful, limited storage.
- **Free products:** reviews of products given by brands must say so (already required by the Terms).

## Badges (agreed)
- **The owner's hand-drawn icons,** in small round tokens with **pale cream circles**, so the drawings stand out at about 20 px. Each token has a thin border in its level's colour, and Evergreen gets a soft gold rim and glow.
- **On posts, comments and reviews:** the icon only, next to the name. Tapping or hovering shows "Sprout · level 2".
- **On profiles:** the icon and the level name, in a pill.
- **Art files** (128 × 128 transparent PNG):
  - `biome-assets/level-seed.png` (an almond-shaped seed)
  - `biome-assets/level-sprout.png`
  - `biome-assets/level-sapling.png`
  - `biome-assets/level-bloom.png`
  - `biome-assets/level-evergreen.png` (the tree; the pine branch could become an Evergreen shelf decoration)
- **Level colours** (borders and name text): Seed warm brown, Sprout light green, Sapling green, Bloom pink, Evergreen teal with gold.

## Still to design before building
- The level-up pop-up, and where progress shows (for example "12 of 25 contributions to Sapling" on your own profile).
- Which levels get the first exclusive drops and Community space.
