# byome

Honest beauty reviews, written by the people actually using the products, plus a community feed and a small collecting game: each member grows a **biome**, a shelf of plants and pots shown on their profile.

The site is plain HTML, CSS and JavaScript (no build step). Accounts and data live in [Supabase](https://supabase.com).

## Pages

| Page | What it's for |
|---|---|
| `index.html` | Homepage |
| `signup.html`, `login.html`, `reset-password.html` | Accounts (the reset page handles "forgot password") |
| `feed.html` | Community posts and comments |
| `reviews.html` | Product reviews, with search and category filters |
| `profile.html` | A member's picture, skin & hair details, shelf, achievements, points, reviews and posts. Your own profile lets you arrange your shelf and edit or delete your posts and reviews; others' profiles can be reported |
| `edit-profile.html` | Change your picture, username and skin & hair details, or delete your account |
| `biome-shop.html` | Spend biome points on pots, plants and shelves |
| `suggest-product.html` | Suggest a product for reviews (flags look-alikes of existing products) |
| `notifications.html` | Your notifications |
| `moderate-products.html` | Moderators only: automod holds, member reports, product suggestions |

## Shared scripts

- `supabase-client.js`: the connection to Supabase (used by every page)
- `nav-menu.js`: the menu, notification and moderation badges, log out
- `biome.js`: draws a shelf; also shows the info box on hover/tap
- `edit-forms.js`: the edit forms for posts and reviews
- `report.js`: the report (flag) button and pop-up
- `product-match.js`: spots products that look like ones already listed
- `profile-fields.js`: the skin & hair options, profile pictures, and how names show (including "Deleted member")

When you change a page's JS or CSS, bump the `?v=` number in the HTML files so browsers load the new version.

## Biome art (`biome-assets/`)

- Pots and plants are drawn on a 512×512 canvas (50px border). Use `plant-template-small.png` as a guide for plants.
- Each pot has two files: the complete pot (`pot-NAME.png`) and its front overlay (`pot-NAME-front.png`). A plant is drawn between them.
- Shelves are 2700×3600.
- When you replace a picture with a new drawing under the **same name**, bump `ART_VERSION` at the top of `biome.js`.
- New items also need a row in the `biome_items` table (see `database/2026-10-03-zebra-haworthia.sql` for an example).

## Database (`database/`)

A backup of the Supabase setup, plus every change that was run in the Supabase SQL Editor, oldest first. See [`database/README.md`](database/README.md).
