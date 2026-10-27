# Plan: member photos (agreed, not built yet)

Photos on reviews (and later posts). This is the agreed plan, so it can be built carefully when the time comes. **Safety comes first, for members and for the moderator team.** Every safety piece below is part of the first version, not added later.

**Before building:** levels must exist first (see "Who can upload").

---

## Order of work
1. **Levels** (a separate project; must come first)
2. **Photos on reviews**, with every safety feature below built in
3. **Photos on posts**, if photos on reviews go well

## The basics
- **Up to 3 or 4 photos per review,** each with an image description (the same accessibility setup Byome already uses).
- **Photos are shrunk in the browser before upload** (about 150–250 KB each, like profile pictures). This also **strips hidden location data** from phone photos.
- **Small previews in lists;** the full photo only when tapped. This keeps bandwidth (the free plan's main limit) low.
- **A Report button on every photo,** with reasons (nudity or sexual content, violence or gore, drugs, harassment, spam, other) and optional details, like text reports today.

## Who can upload
- **Only members above level 1** (level 2 and up). This deters bots and people trying to advertise their own content, explicit or otherwise.
- New members see a friendly note instead, like "Photo uploads unlock at level 2 🌱".
- **Enforced by the database** (storage rules and database functions), not just by hiding the button.

## Automatic checking
- **Every upload is checked server-side** (a Supabase Edge Function) by an image-safety service, for example OpenAI's moderation API (free, checks images) or Google Cloud Vision SafeSearch. Confirm current pricing and terms when building.
- **Anything flagged is held for moderators**, like the word filter does for text. The flag records the categories and confidence (for example nudity: likely, violence: possible).
- **A new member's first few photos are also held** for a quick moderator look, whatever the automatic check says.
- No automated check is perfect, so the Report button and moderators stay the backstop.

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
