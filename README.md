# byome

Honest beauty reviews, written by the people actually using the products, plus a community feed and a small collecting game: each member grows a **biome**, a shelf of plants and pots shown on their profile.

The site is plain HTML, CSS and JavaScript (no build step). Accounts and data live in [Supabase](https://supabase.com).

## Pages

| Page | What it's for |
|---|---|
| `index.html` | Homepage (members who are logged in get a "Welcome back" with shortcuts, from `home.js`) |
| `signup.html`, `login.html`, `reset-password.html` | Accounts (the reset page handles "forgot password") |
| `feed.html` | Community posts and comments |
| `reviews.html` | Product reviews, with search, category filters and Newest / Most helpful sorting. `reviews.html?product=<id>` is a product's page: average leaves, repurchase rate, holy grails, rating spread, and a skin-type filter |
| `profile.html` | A member's picture, skin & hair details, shelf, achievements, points, reviews and posts. Your own profile lets you arrange your shelf and edit or delete your posts and reviews; others' profiles can be reported |
| `edit-profile.html` | Change your picture, username and skin & hair details, or delete your account |
| `byome-shop.html` | The Byome Shop: spend Byome points on pots, plants, shelves and biomes (`biome-shop.html` just redirects here) |
| `suggest-product.html` | Suggest a product for reviews (flags look-alikes of existing products) |
| `notifications.html` | Your notifications |
| `moderate-products.html` | Moderators only: automod holds, member reports, product suggestions, and the moderation log |
| `terms.html`, `privacy.html` | Terms of use and privacy policy (plain-language drafts) |
| `404.html` | "This page wandered off": shown for any address that doesn't exist |

## Shared scripts

- `supabase-client.js`: the connection to Supabase (used by every page)
- `nav-menu.js`: builds the menu (the same on every page: guests see Reviews, Log in, Sign up), notification and moderation badges, log out
- `biome.js`: draws a shelf; also shows the info box on hover/tap
- `edit-forms.js`: the edit forms for posts and reviews
- `report.js`: the report (flag) button and pop-up
- `product-match.js`: spots products that look like ones already listed
- `profile-fields.js`: the skin & hair options, profile pictures, and how names show (including "Deleted member")
- `ui.js`: the footer, friendly empty states, the pop-up that celebrates new achievements and purchases (and thanks moderators after a visit to the Moderate page), sparkles on rare items, and **biomes**. Set `CONTACT_EMAIL` at the top to show a Contact link in the footer

## Biomes

Community and Reviews are both set in the forest, for a consistent brand (`<body data-biome="...">`); the other biomes, meadow included, are for profiles. Profile pages use the member's chosen biome (Edit profile). Each biome's colors, symbol and drifting particles are in `BIOME_LOOKS` in `ui.js`; its card and border colors are under BIOMES in `style.css`. A new biome needs both, plus a row in `biome_items` with `kind = 'biome'`.

## Logo, icons and link previews

- `logo-wordmark.png` (cream, for the dark header), `logo-wordmark-green.png` (green, used in the emails) and `logo-icon.png` (the sun-and-sprout mark).
- `favicon-badge-32.png` and `favicon.ico` (browser tab) and `apple-touch-icon.png` (phone home screen, on the byome green) are made from the icon.
- `og-image.png` (1200×630) is the picture shown when someone shares a byome link: the wordmark above a row of biome pots and plants.
- `biome-assets/hero-shelf.png` is the homepage picture: the same pots and plants on a strip of the painted shelf. It's built from the biome art, so if a pot or plant drawing changes, it can be rebuilt the same way (or swapped for a drawn scene, about 1400×1100, transparent).

## Biome art (`biome-assets/`)

- Pots and plants are drawn on a 512×512 canvas (50px border). Use `plant-template-small.png` as a guide for plants.
- Each pot has two files: the complete pot (`pot-NAME.png`) and its front overlay (`pot-NAME-front.png`). A plant is drawn between them.
- Plants whose leaves spill over the rim (like the African violet) set `over_pot = true` in `biome_items`, and are drawn in front of the whole pot instead.
- Shelves are 2700×3600.
- When you replace a picture with a new drawing under the **same name**, bump `ART_VERSION` at the top of `biome.js`.
- New items also need a row in the `biome_items` table (see `database/2026-10-03-zebra-haworthia.sql` for an example).

## Database (`database/`)

A backup of the Supabase setup, plus every change that was run in the Supabase SQL Editor, oldest first. See [`database/README.md`](database/README.md).

## Emails (`email-templates/`)

The signup and password-reset emails, kept as a backup of what's pasted into Supabase. See [`email-templates/README.md`](email-templates/README.md).
