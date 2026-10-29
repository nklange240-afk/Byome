# Plan: member photos (agreed, not built yet)

Photos on reviews (and later posts). This is the agreed plan, so it can be built carefully when the time comes. **Safety comes first, for members and for the moderator team.** Every safety piece below is part of the first version, not added later.

**Before building:** levels must exist first (see "Who can upload").

---

## Before building
- **Owner:** register Byome with NCMEC's CyberTipline as an electronic service provider, apply for hash matching (PhotoDNA or similar), create the Google Cloud and OpenAI accounts and keys, and ideally upgrade Supabase to Pro (photos are the main bandwidth cost).
- **Terms and Privacy updates:** what's stored, location data removed, automated checks by outside services, and the reporting duty.

## Order of work
1. **Levels** (built) and **restrictions** (next; photo bans are one kind of restriction)
2. **Photos on reviews**, with every safety feature below built in
3. **Photos on posts**, if photos on reviews go well

## The basics
- **Up to 2 photos per review to start** (owner's decision), each with an optional image description (alt text) for people using screen readers, the same setup Byome already uses for product photos.
- **Photos are shrunk in the browser before upload** (about 150–250 KB each, like profile pictures). This also **strips hidden location data** from phone photos.
- **Small previews in lists;** the full photo only when tapped. This keeps bandwidth (the free plan's main limit) low.
- **A Report button on every photo,** with reasons (nudity or sexual content, violence or gore, drugs, harassment, spam, other) and optional details, like text reports today.

## Who can upload
- **Only members above level 1** (level 2 and up). This deters bots and people trying to advertise their own content, explicit or otherwise.
- New members see a friendly note instead, like "Photo uploads unlock at level 2 🌱".
- **Enforced by the database** (storage rules and database functions), not just by hiding the button.

## Automatic checking
Safety is the top priority here (owner), so checking is layered: no single check is trusted alone.
- **Two independent image checks on every upload** (a Supabase Edge Function), and a photo is held if **either** one flags it:
  - **Google Cloud Vision SafeSearch:** long-established image safety rating (adult, racy, violence, medical). About 1,000 checks a month free, then roughly $1.50 per 1,000.
  - **OpenAI's moderation service:** free, a second opinion with its own categories (including self-harm and graphic violence).
  - Confirm current pricing, categories and terms of both when building. Byome's keys stay secret in Supabase, never in the site's code.
- **Hash matching for known child sexual abuse material** (for example Microsoft PhotoDNA, which is free for qualifying services, or Thorn's Safer). This is the industry-standard tool for that specific risk; general image checks aren't designed for it. Apply before photos launch.
- **The checks run before a photo is ever shown to anyone.** If a check can't run (the service is down), the photo waits for a moderator rather than going live.
- **Anything flagged is held for moderators**, like the word filter does for text. The flag records the categories and confidence (for example nudity: likely, violence: possible).
- **A new member's first few photos are also held** for a quick moderator look, whatever the automatic check says.
- No automated check is perfect, so the Report button and moderators stay the backstop.

## AI-generated photos (lower priority)
Reviews should show real products in real use. But automatic "AI detectors" are unreliable: they often flag real phone photos (filters, beauty modes, heavy editing) and miss AI images, so they'd wrongly accuse genuine members. So:
- **No automatic AI blocking.**
- **Content Credentials check:** many AI tools (and some cameras and editors) add a "Content Credentials" label to their images. Before a photo is shrunk (which strips hidden data), the browser checks for it, and a photo labelled as AI-made is held for a moderator with the note "This photo says it was made with AI". There are no false accusations this way, though it won't catch everything.
- **A report reason:** "Not a real photo (AI-made or copied)".
- **Community guidelines:** photos must be your own, of products you actually used.
- A paid AI-detection service can be revisited later if it becomes a real problem.

## How moderators see flagged or reported photos
**Hidden by default.** Nobody on the team should be surprised by an image they don't feel equipped to handle.
- **Flagged and reported photos are hidden completely** behind a plain placeholder card, not just blurred.
- **The card says why:**
  - from automod: "Automod flagged this as: Nudity (likely)"
  - from members: "Reported by 2 members: Nudity or sexual content", plus any details they wrote
- **Revealing is a deliberate two-step choice:**
  1. **Show blurred:** a strong blur, enough to tell "clearly a lipstick swatch" from "not okay" without detail.
  2. **Show photo:** the clear image.

  A moderator can decide at any step, including from the description alone.
- **It re-hides automatically** on leaving or refreshing the page. Nothing stays revealed.
- **Flagged photos never appear in full anywhere else:** not in notifications, previews, the moderation log, or members' feeds while under review.
- **Decisions:** Approve (the photo goes live), Remove (with a reason, and the member is told), or Leave for another moderator.

## Looking after the moderator team
- **Opt-out setting:** "I'd rather not review flagged photos". Those moderators never see photo items in their queue, and they can change it any time, no questions asked.
- **"Leave for another moderator"** on any photo.
- **Moderator guide:** it's always okay to step away, and harmful content can be upsetting even for experienced moderators.

## Banning a member from photos
- **"Ban from photos"** for moderators, on a member's profile and on any reported photo.
- **A reason, and a length:** 7 days, 30 days, or permanent.
- **Optional "also hide their existing photos"** tick box.
- The member is told why, like other moderation actions. It's recorded in the moderation log, and any moderator can lift it.
- **Enforced by the database.**

## Emergency: pause all photo uploads
- **A clearly marked button** at the top of the Moderate page, usable by any moderator. Use it if explicit photos slip past automod, for individual safety concerns, or for any suspected CSAM.
- **It stops all photo uploads site-wide immediately,** enforced by the database.
- **Members see a calm note,** like "Photo uploads are paused for a little while", with no alarming details.
- **Every moderator and the owner are notified straight away.** It's logged with who pressed it, when, and the reason they give.
- **Optional "hide recent photos" tick box** (for example, the last 24 hours) for when the problem images aren't known yet. They're hidden from the site while moderators review them, not deleted.
- **Only the owner can turn uploads back on** (agreed), so it can't be undone by accident or by one moderator alone.

## Suspected child sexual abuse material (CSAM)
- **If automod flags possible sexual content involving a minor,** there's **no reveal button at all**, for anyone, including the owner. Reporting doesn't require viewing it.
- **The card shows only the safety checklist** and one button: **"Remove and preserve for report"**. This:
  - hides the photo from everyone
  - keeps it stored for the legal report (US providers must preserve reported material for a period after reporting; check the current requirements when building)
  - pauses that member's uploads
  - alerts the owner immediately
- **Checklist for anyone who comes across it** (in the moderator guide and on the emergency screen):
  1. Pause uploads if needed.
  2. Hide it with "Remove and preserve for report".
  3. **Don't download, screenshot or share it**, even with other moderators.
  4. Tell the owner.
  5. The owner reports it to the **NCMEC CyberTipline** (report.cybertip.org). US sites are legally required to report it.

## Costs and limits (free plan)
- **Storage:** 1 GB holds roughly 4,000–6,000 photos.
- **Bandwidth:** 5 GB a month, very roughly 25,000 photo views. This is the likely limit, so keep an eye on Supabase's **Usage** page.
- **Upgrade to Pro** when any limit passes 70%. This is one of the agreed upgrade triggers.

## Agreed upgrade threshold (for reference)
Upgrade to Supabase Pro when any one of these is true:
- **About 25 people who aren't friends or family are active weekly,** for 2 weeks in a row.
- **About 50 new reviews and posts a week.**
- **Just before any public promotion push.**
- **Any Supabase usage limit is over 70%.**
- **Tips or ads cover at least half the cost.**
