// Shared bits of the interface, used on every page:
//   - the footer
//   - friendly "nothing here yet" messages with a little plant art
//   - the pop-up that celebrates a new achievement or purchase
//   - sparkles on rare items
const UI = (function () {
  // Shown in the footer as "Contact" once there's an inbox to send to,
  // e.g. "hello@byome.xyz". Left empty, the Contact link doesn't show.
  const CONTACT_EMAIL = "hello@byome.xyz";

  // Rarities that get sparkles
  const SPARKLY = ["rare", "heirloom"];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Art paths with the cache-busting number when biome.js is on the page
  function art(path) {
    return typeof BIOME !== "undefined" ? BIOME.src(path) : path;
  }

  // ---------- Footer ----------

  function buildFooter() {
    let footer = document.querySelector(".site-footer");
    if (!footer) {
      footer = el("footer", "site-footer");
      document.body.insertBefore(footer, document.querySelector("body > script"));
    }
    footer.replaceChildren();
    footer.appendChild(el("p", "footer-tagline", "Byome — built by the community, for the community."));
    const links = el("nav", "footer-links");
    links.setAttribute("aria-label", "About Byome");
    const items = [["index.html#about", "About"], ["terms.html", "Terms"], ["privacy.html", "Privacy"]];
    if (CONTACT_EMAIL) items.push(["mailto:" + CONTACT_EMAIL, "Contact"]);
    items.forEach(([href, text]) => {
      const a = el("a", null, text);
      a.href = href;
      links.appendChild(a);
    });
    if (typeof A11Y !== "undefined") {
      const settings = el("button", "footer-link-btn", "Accessibility");
      settings.type = "button";
      settings.setAttribute("aria-haspopup", "dialog");
      settings.addEventListener("click", openAccessibility);
      links.appendChild(settings);
    }
    footer.appendChild(links);

    // Byome on social media
    const social = el("nav", "footer-social");
    social.setAttribute("aria-label", "Byome on social media");
    SOCIAL_LINKS.forEach(([href, label, icon]) => {
      const a = el("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "me noopener";
      a.setAttribute("aria-label", "Byome on " + label);
      a.innerHTML = icon; // our own icon markup, not user content
      a.appendChild(el("span", null, label));
      social.appendChild(a);
    });
    footer.appendChild(social);
  }

  // ---------- Accessibility settings ----------
  // A small panel (from the footer's "Accessibility" link) for the settings
  // in a11y.js. Changes apply straight away and are saved on this device.
  const A11Y_GROUPS = [
    { name: "motion", legend: "Motion", options: [["device", "Match my device"], ["reduce", "Reduce motion"]],
      note: "Reduce motion keeps the biomes still and makes pop-ups appear without animation." },
    { name: "text", legend: "Text size", options: [["default", "Standard"], ["large", "Large"], ["xlarge", "Extra large"]] },
    { name: "contrast", legend: "Contrast", options: [["default", "Standard"], ["high", "Higher contrast"]],
      note: "Higher contrast shows all text at full strength, outlines fields and buttons more clearly, underlines links and quiets the background art." },
    { name: "background", legend: "Backgrounds", options: [["full", "Full biomes"], ["calm", "Calm"]],
      note: "Calm hides the biome art and the drifting specks, keeping just the colors. Easier on busy minds, tired eyes and older phones." },
    { name: "font", legend: "Font", options: [["default", "Standard"], ["readable", "Easy-reading"]],
      note: "Easy-reading uses Atkinson Hyperlegible, a font designed so similar letters are easy to tell apart." },
  ];

  function openAccessibility() {
    const current = A11Y.get();
    const dialog = el("dialog", "celebrate a11y-dialog");
    dialog.setAttribute("aria-labelledby", "a11y-heading");
    const h = el("h2", null, "Accessibility");
    h.id = "a11y-heading";
    dialog.append(h, el("p", "a11y-intro", "Make Byome easier to see and use."));

    A11Y_GROUPS.forEach((group) => {
      const set = el("fieldset", "a11y-group");
      set.appendChild(el("legend", null, group.legend));
      const choices = el("div", "a11y-choices");
      group.options.forEach(([value, label]) => {
        const choice = el("label", "a11y-choice");
        const input = el("input");
        input.type = "radio";
        input.name = "a11y-" + group.name;
        input.value = value;
        input.checked = current[group.name] === value;
        input.addEventListener("change", () => { if (input.checked) A11Y.set(group.name, value); });
        choice.append(input, el("span", null, label));
        choices.appendChild(choice);
      });
      set.appendChild(choices);
      if (group.note) set.appendChild(el("p", "a11y-note", group.note));
      dialog.appendChild(set);
    });

    dialog.appendChild(el("p", "a11y-saved", "Saved on this device. Your phone or computer's own settings (like text size) work alongside these."));
    const actions = el("div", "celebrate-actions");
    const done = el("button", "btn btn-solid", "Done");
    done.type = "button";
    done.addEventListener("click", () => dialog.close());
    actions.appendChild(done);
    dialog.appendChild(actions);

    dialog.addEventListener("close", () => dialog.remove());
    // Clicking the dim background (outside the panel) closes it too
    dialog.addEventListener("click", (e) => {
      const r = dialog.getBoundingClientRect();
      if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    const first = dialog.querySelector("input:checked");
    if (first) first.focus();
  }

  // Simple line icons, drawn in the text color
  const SOCIAL_LINKS = [
    ["https://www.instagram.com/joinbyome/", "Instagram",
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle class="dot" cx="17.3" cy="6.7" r="1.1"/></svg>'],
    ["https://www.tiktok.com/@joinbyome", "TikTok",
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 3v11.6a3.6 3.6 0 1 1-3.6-3.6"/><path d="M13.5 3c.4 2.6 2.2 4.3 5 4.6"/></svg>'],
  ];

  // ---------- Why something was removed ----------
  // Must match removal_reason_label() in database/2026-10-11-returned-content.sql
  const REMOVAL_REASONS = [
    ["profanity", "Profanity or slurs"],
    ["harassment", "Harassment or personal attacks"],
    ["spam", "Spam or self-promotion"],
    ["low_effort", "Low effort (too short or not useful)"],
    ["off_topic", "Unrelated to the topic or product"],
    ["misleading", "Misleading or false claims"],
    ["not_genuine", "Not a genuine review (the product wasn't used)"],
    ["personal_info", "Shares someone's personal information"],
    ["other", "Something else"],
  ];

  function removalReasonLabel(key) {
    const found = REMOVAL_REASONS.find(([k]) => k === key);
    return found ? found[1] : null;
  }

  // ---------- Friendly dates ----------

  // "just now", "5 minutes ago", "yesterday", "3 days ago"; older than a
  // week shows the date ("Oct 2, 2026")
  function friendlyDate(iso) {
    const then = new Date(iso);
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + (mins === 1 ? " minute ago" : " minutes ago");
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return days + " days ago";
    return then.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  // A <time> showing a friendly date, with the full date on hover
  function timeTag(iso, className) {
    const t = el("time", className, friendlyDate(iso));
    t.dateTime = iso;
    t.title = new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    return t;
  }

  // ---------- Empty states ----------

  // options: { image, text, linkText, href }
  function emptyState(options) {
    const box = el("div", "empty-state");
    if (options.image) {
      const img = document.createElement("img");
      img.src = art(options.image);
      img.alt = "";
      img.className = "empty-state-art";
      box.appendChild(img);
    }
    const p = el("p", null, options.text);
    if (options.linkText) {
      const a = el("a", "inline-link", options.linkText);
      a.href = options.href;
      p.append(" ", a);
    }
    box.appendChild(p);
    return box;
  }

  // ---------- Sparkles ----------

  // A few twinkling stars over a picture. The container needs
  // position: relative (the CSS for .has-sparkles sets it).
  function sparkles(container, rarity) {
    if (SPARKLY.indexOf(rarity) === -1) return;
    container.classList.add("has-sparkles");
    for (let i = 0; i < 3; i++) container.appendChild(el("span", "sparkle sparkle-" + (i + 1)));
  }

  // ---------- Celebrations ----------

  // The item's picture: plants are shown growing in the starter pot,
  // since that's where reward plants are placed
  // Plants drawn with their own soil (plant-<key>-soil.png, on the plant's
  // canvas): the soil sits inside the pot, under the pot's front, while the
  // plant can hang over the rim
  const PLANTS_WITH_SOIL = ["venus-flytrap"];
  function soilImage(item) {
    return item && PLANTS_WITH_SOIL.indexOf(item.key) !== -1 ? item.image.replace(/\.png$/, "-soil.png") : null;
  }

  function itemArt(item, className) {
    if (item.kind === "biome") {
      const swatch = biomeSwatch(item.key, (className || "celebrate-art") + " is-biome biome-swatch");
      sparkles(swatch, item.rarity);
      return swatch;
    }
    const box = el("div", className || "celebrate-art");
    if (item.kind === "plant") {
      box.classList.add("is-potted");
      const pot = "biome-assets/pot-terra-cotta.png";
      const front = pot.replace(/\.png$/, "-front.png");
      const plant = el("img", "biome-plant plant-" + item.key + (className ? "" : " celebrate-grow") + (item.over_pot ? " is-over-pot" : ""));
      plant.src = art(item.image);
      plant.alt = "";
      const potImg = el("img", "biome-pot");
      potImg.src = art(pot);
      potImg.alt = "";
      const frontImg = el("img", "biome-pot-front");
      frontImg.src = art(front);
      frontImg.alt = "";
      const soil = soilImage(item);
      if (soil) {
        const soilImg = el("img", "biome-plant biome-soil plant-" + item.key);
        soilImg.src = art(soil);
        soilImg.alt = "";
        box.append(potImg, soilImg);
        if (item.over_pot) box.append(frontImg, plant);
        else box.append(plant, frontImg);
      } else {
        box.append(potImg, plant, frontImg);
      }
    } else if (item.kind === "shelf_overlay") {
      // A shelf decoration, shown on the wooden shelf
      box.classList.add("is-decorated-shelf");
      const shelf = el("img", (className ? "" : "celebrate-grow") + " is-shelf");
      shelf.src = art("biome-assets/shelf-default.png");
      shelf.alt = "";
      const deco = el("img", "celebrate-decoration");
      deco.src = art(item.image);
      deco.alt = "";
      box.append(shelf, deco);
    } else if (item.kind === "companion") {
      // A companion's canvas is mostly empty space above the pot, so show
      // its close-up (saved next to it with "-icon" added to the name).
      // Companions don't twinkle; only pots do.
      const img = el("img", (className ? "" : "celebrate-grow") + " is-companion");
      img.src = art(item.image.replace(/\.png$/, "-icon.png"));
      img.alt = "";
      box.appendChild(img);
      return box;
    } else {
      const img = el("img", (className ? "" : "celebrate-grow") + (item.kind === "shelf" ? " is-shelf" : ""));
      img.src = art(item.image);
      img.alt = "";
      box.appendChild(img);
    }
    sparkles(box, item.rarity);
    return box;
  }

  const queue = [];
  let showing = false;

  // options: { label, heading, text, item }
  function celebrate(options) {
    queue.push(options);
    if (!showing) showNext();
  }

  function showNext() {
    const options = queue.shift();
    if (!options) { showing = false; return; }
    showing = true;

    const dialog = el("dialog", "celebrate");
    dialog.setAttribute("aria-labelledby", "celebrate-heading");
    if (options.label) dialog.appendChild(el("p", "celebrate-label", options.label));
    if (options.item) dialog.appendChild(itemArt(options.item));
    const h = el("h2", null, options.heading);
    h.id = "celebrate-heading";
    dialog.appendChild(h);
    if (options.text) dialog.appendChild(el("p", "celebrate-text", options.text));

    const actions = el("div", "celebrate-actions");
    if (options.item && options.item.kind === "biome") {
      const choose = el("a", "btn btn-ghost", "Choose my biome");
      choose.href = "edit-profile.html";
      actions.appendChild(choose);
    } else if (options.item && !options.placed) {
      // Opens your profile with the shelf editor ready
      const place = el("a", "btn btn-ghost", "Put it on my shelf");
      place.href = "profile.html?shelf=edit";
      actions.appendChild(place);
    } else if (!/profile\.html$/.test(window.location.pathname) || window.location.search) {
      const see = el("a", "btn btn-ghost", "See my shelf");
      see.href = "profile.html";
      actions.appendChild(see);
    }
    const ok = el("button", "btn btn-solid", "Lovely!");
    ok.type = "button";
    ok.addEventListener("click", () => dialog.close());
    actions.appendChild(ok);
    dialog.appendChild(actions);

    dialog.addEventListener("close", () => { dialog.remove(); showNext(); });
    // Clicking the dim background closes it too
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    document.body.appendChild(dialog);
    dialog.showModal();
    ok.focus();
  }

  // New achievements pop up once, on whichever page you're on when they
  // arrive. Each device remembers which ones it has already celebrated;
  // anything older than a few days is skipped, so nobody gets a pile of
  // old ones at once.
  const RECENT_DAYS = 3;

  function seenKey(userId) {
    return "byome-celebrated-" + userId;
  }

  function readSeen(userId) {
    try { return JSON.parse(localStorage.getItem(seenKey(userId)) || "[]"); }
    catch (e) { return []; }
  }

  function writeSeen(userId, keys) {
    try { localStorage.setItem(seenKey(userId), JSON.stringify(keys)); }
    catch (e) { /* private browsing: celebrations may repeat, which is harmless */ }
  }

  async function checkAchievements() {
    if (typeof supabaseClient === "undefined") return;
    const { data } = await supabaseClient.auth.getSession();
    if (!data.session) return;
    const userId = data.session.user.id;
    const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();

    const load = (columns) => supabaseClient.from("user_achievements").select(columns)
      .eq("user_id", userId).gte("earned_at", since).order("earned_at");
    const base = "achievement_key, earned_at, achievements!achievement_key(name, description, biome_items!reward_item(key, kind, name, image, rarity, over_pot)";
    // (event achievements come from database/2026-10-29-events-halloween.sql)
    let { data: rows, error } = await load(base + ", event_points, events!event_key(name))");
    if (error) ({ data: rows, error } = await load(base + ")"));
    if (error || !rows) return;

    const seen = readSeen(userId);
    const fresh = rows.filter((r) => seen.indexOf(r.achievement_key) === -1);
    if (!fresh.length) return;
    writeSeen(userId, seen.concat(fresh.map((r) => r.achievement_key)));

    // Reward plants are planted for you when there's a free spot of their
    // size; check which ones actually made it onto the shelf
    const plantKeys = fresh.map((r) => (r.achievements || {}).biome_items).filter((it) => it && it.kind === "plant").map((it) => it.key);
    const planted = {};
    if (plantKeys.length) {
      const { data: slots } = await supabaseClient.from("biome_slots").select("plant_key").eq("user_id", userId).in("plant_key", plantKeys);
      (slots || []).forEach((s) => { planted[s.plant_key] = true; });
    }

    fresh.forEach((r) => {
      const a = r.achievements || {};
      const item = a.biome_items;
      const event = a.events;
      const placed = Boolean(item && planted[item.key]);
      celebrate({
        label: event ? event.name + " achievement" : "Achievement unlocked",
        heading: a.name || "New achievement",
        text: (a.description ? a.description + " " : "") +
          (item ? "Your reward: " + item.name + (placed ? ", already on your shelf." : ".") : "") +
          (event && a.event_points ? " Plus " + a.event_points + " Byome points!" : ""),
        item: item,
        placed: placed,
      });
    });
  }

  // ---------- Events ----------
  // The event that's on right now, if any (from the events table; the
  // database decides what counts, this just decides what to show)
  let liveEventPromise = null;
  function liveEvent() {
    if (!liveEventPromise) {
      const now = new Date().toISOString();
      liveEventPromise = typeof supabaseClient === "undefined" ? Promise.resolve(null)
        : supabaseClient.from("events").select("key, name, tagline, starts_at, ends_at, grace_until, badge_image, story_post_id")
          .lte("starts_at", now).gte("ends_at", now).order("starts_at").limit(1)
          .then(({ data, error }) => (error || !data || !data.length ? null : data[0]), () => null);
    }
    return liveEventPromise;
  }

  // "Sunday, November 1 at 11:59 PM Central Time"
  function centralTime(iso, withTime) {
    const opts = { timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric" };
    let text = new Date(iso).toLocaleDateString("en-US", opts);
    if (withTime !== false) {
      text += " at " + new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
    }
    return text + " Central Time";
  }

  // A small picture with words to fall back on: the picture once its art
  // exists, the words (in a pill) until then
  function iconOrLabel(src, label, className, shortLabel) {
    const img = document.createElement("img");
    img.className = className;
    img.src = src;
    img.alt = label;
    img.title = label;
    img.addEventListener("error", () => {
      const pill = el("span", className + " is-text", shortLabel || label);
      pill.title = label;
      img.replaceWith(pill);
    });
    return img;
  }

  // While an event is on, a banner at the top of a page pointing to it
  // (after: put it just after this element, like the page's heading)
  async function eventBanner(container, after) {
    const event = await liveEvent();
    if (!event || !container) return;
    const banner = el("a", "event-banner");
    banner.href = "events.html";
    if (event.badge_image) {
      const badge = document.createElement("img");
      badge.src = event.badge_image;
      badge.alt = "";
      badge.addEventListener("error", () => badge.remove());
      banner.appendChild(badge);
    }
    const end = new Date(event.ends_at).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric" });
    const text = el("span");
    text.append(el("strong", null, event.name + " is on!"), " Earn achievements, Byome points and limited-edition treats until " + end + ". ",
      el("span", "inline-link", "See the event"));
    banner.appendChild(text);
    if (after) after.after(banner); else container.prepend(banner);
  }

  // The little icons by a review's heading: a cobweb for "no longer using
  // this", a leaf for a fall favorite (words until the icons' art is in)
  function reviewIcons(r) {
    const icons = [];
    if (r.no_longer_using) icons.push(iconOrLabel("biome-assets/icon-no-longer-using.png", "No longer using this product", "review-icon", "No longer using"));
    if (r.seasonal) icons.push(iconOrLabel("biome-assets/icon-fall-favorite.png", "Fall favorite", "review-icon"));
    return icons;
  }

  // ---------- Biomes ----------
  // A page picks its biome with <body data-biome="...">; profile pages use
  // the member's chosen biome (UI.setBiome). Each biome has:
  //   symbol: shown next to usernames (if the member turns it on)
  //   top / deep: the background color at the top of the page, and at
  //     its deepest point (the bottom of the page); it shifts slowly
  //     between them as you scroll down
  //   particles: what drifts in the margins, and how many
  //   rays: light from the surface (water)
  //   shadeFrom: if set, the color reaches its deepest at the bottom of
  //     the page (however long), starting this far down (0 to 1)
  //   overlay: hand-drawn art down both sides of the page (empty in the
  //     middle, behind the content); it repeats downward and scrolls a
  //     little slower than the page
  //   overlays: several layers of art instead, back to front, each with
  //     its own speed (0.5 = half the page's speed; slower feels farther
  //     away) and strength (opacity); far: drawn smaller; sparse: a few
  //     small things (like insects) that phones show without a faint copy
  //   stops: more than two colors to pass through, top to bottom
  //   light: a light biome (dark text), which uses the dark green logo
  //   shadeFrom: when set, the colors follow how far down the page you are
  //     (from this fraction on), instead of a fixed scrolling distance
  // The colors of cards and borders for each biome are in style.css.
  const BIOME_LOOKS = {
    forest: { name: "Forest", symbol: "\u{1F332}", top: [36, 64, 47], deep: [15, 31, 22], particles: [["firefly", 16]],
              overlay: "biome-assets/overlay-forest.webp" },
    // Meadow is the light biome (dark text; its colors are in style.css):
    // bright, fresh green at the top, deepening to rich meadow green by the
    // bottom of the page, however long the page is
    meadow: { name: "Meadow", symbol: "\u{1F33C}", top: [238, 248, 221], deep: [159, 203, 126], particles: [],
              // hand-drawn wildflowers down both sides, with bees and butterflies
              // among them (moving together; no faint copy of the bugs on phones)
              overlays: [
                { image: "biome-assets/overlay-meadow-flowers.webp", speed: 0.5, opacity: 0.75 },
                { image: "biome-assets/overlay-meadow-bugs.webp", speed: 0.5, opacity: 0.95, sparse: true },
              ],
              stops: [[238, 248, 221], [203, 230, 170], [159, 203, 126]],
              shadeFrom: 0, light: true,
              // its preview tile hints at spring green and petals
              preview: { top: [238, 248, 221], deep: [159, 203, 126], dots: "petal" } },
    desert: { name: "Desert", symbol: "☀️", top: [128, 90, 30], deep: [58, 36, 38], particles: [["glint", 34]],
              shadeFrom: 0.65, // golden most of the way; dusk only near the bottom
              // its preview tile is brighter, like sand in the sun
              preview: { top: [184, 132, 54], deep: [128, 90, 30] } },
    tundra: { name: "Snowy tundra", symbol: "❄️", top: [84, 104, 124], deep: [14, 24, 42], particles: [["snow", 34]],
              throughContent: [["snow", 16]], // a little snow falls faintly over the posts too
              shadeFrom: 0.15 }, // pale dusty blue, deepening to dark blue by the bottom
    // Autumn woodland: golden light at the top, deepening through rust to
    // maple red by the bottom of the page, with leaves drifting down, and
    // hand-drawn autumn branches down both sides
    autumn: { name: "Autumn woodland", symbol: "\u{1F342}", top: [164, 100, 32], deep: [62, 22, 24],
              stops: [[164, 100, 32], [150, 68, 34], [62, 22, 24]], shadeFrom: 0,
              particles: [["leaf", 22]], overlay: "biome-assets/overlay-autumn.webp" },
    ocean: { name: "Open ocean", symbol: "\u{1F30A}", top: [20, 52, 78], deep: [4, 12, 26], particles: [["bubble", 16], ["biolum", 26]], rays: true,
             // the "biolum" specks only glow once you're deep down; a few
             // more glow very faintly through the posts and cards
             throughContent: [["biolum", 14]],
             overlays: [
               { image: "biome-assets/overlay-ocean-fish.webp", speed: 0.25, opacity: 0.8, far: true }, // fish, far off
               { image: "biome-assets/overlay-ocean-kelp.webp", speed: 0.5, opacity: 0.85 },            // kelp, nearer
             ] },
    reef: { name: "Coral reef", symbol: "\u{1F420}", top: [16, 60, 64], deep: [8, 30, 42], particles: [["plankton", 18], ["bubble", 8], ["biolum", 26]], rays: true,
            // like the ocean: a glow in the depths, faintly over the posts too
            throughContent: [["biolum", 14]] },
  };
  // Pixels of scrolling to reach the deepest point: the bottom of the page,
  // but at least MIN_DEPTH (so short pages only darken a little) and at
  // most MAX_DEPTH
  const MIN_DEPTH = 2500, MAX_DEPTH = 9000;

  // A biome's layers of hand-drawn art, back to front
  function overlayLayers(look) {
    if (look.overlays) return look.overlays;
    return look.overlay ? [{ image: look.overlay, speed: 0.5 }] : [];
  }

  function makeOverlay(o) {
    const overlay = el("div", "biome-overlay" + (o.far ? " is-far" : "") + (o.sparse ? " is-sparse" : ""));
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.setProperty("--ov-img", "url(" + art(o.image) + ")");
    if (o.opacity !== undefined) overlay.style.setProperty("--ov-opacity", String(o.opacity));
    overlay._speed = o.speed;
    return overlay;
  }

  function biomeLook(key) {
    return BIOME_LOOKS[key] || null;
  }

  // The little symbol shown after a username, or null
  function biomeSymbol(profile) {
    if (!profile || !profile.show_biome_symbol) return null;
    const look = biomeLook(profile.profile_biome);
    if (!look) return null;
    const span = el("span", "biome-symbol", look.symbol);
    span.setAttribute("role", "img");
    span.setAttribute("aria-label", look.name + " biome");
    span.title = look.name;
    return span;
  }

  // The badge after a username: "Founder" for the founder, "Mod" for
  // moderators, or null. Needs the profile's is_moderator and badge.
  function memberBadge(profile) {
    if (!profile || profile.deleted_at) return null;
    const kind = profile.badge === "founder" ? "founder" : profile.is_moderator ? "mod" : null;
    if (!kind) return null;
    const badge = el("span", "member-badge is-" + kind, kind === "founder" ? "Founder" : "Mod");
    badge.title = kind === "founder" ? "Byome's founder" : "Byome moderator";
    return badge;
  }

  // A small preview of a biome (shop cards, Edit profile, pop-ups)
  function biomeSwatch(key, className) {
    const look = biomeLook(key) || BIOME_LOOKS.forest;
    const preview = look.preview || {};
    const box = el("div", (className || "biome-swatch") + " swatch-" + key);
    box.style.background = "linear-gradient(170deg, rgb(" + (preview.top || look.top).join(",") + "), rgb(" + (preview.deep || look.deep).join(",") + "))";
    box.setAttribute("aria-hidden", "true");
    if (look.rays) box.appendChild(el("span", "swatch-rays"));
    const kind = preview.dots || (look.particles.length ? look.particles[0][0] : null);
    for (let i = 0; kind && i < 7; i++) {
      const p = el("span", "swatch-dot dot-" + kind);
      p.style.left = (8 + ((i * 37) % 84)) + "%";
      p.style.top = (10 + ((i * 53) % 78)) + "%";
      box.appendChild(p);
    }
    box.appendChild(el("span", "swatch-symbol", look.symbol));
    return box;
  }

  // One drifting particle; each moves on its own slow rhythm
  function particle(kind) {
    const bit = el("span", "particle p-" + kind);
    bit.style.setProperty("--dur", (14 + Math.random() * 16).toFixed(1) + "s");
    bit.style.setProperty("--blink", (3 + Math.random() * 4).toFixed(1) + "s");
    bit.style.setProperty("--delay", (-Math.random() * 30).toFixed(1) + "s");
    bit.style.setProperty("--dx", ((Math.random() - 0.5) * 60).toFixed(0) + "px");
    bit.style.setProperty("--dy", ((Math.random() - 0.5) * 80).toFixed(0) + "px");
    bit.style.setProperty("--size", (3 + Math.random() * 4).toFixed(1) + "px");
    bit.style.setProperty("--hue", String(Math.floor(Math.random() * 4)));
    return bit;
  }

  // ---------- Biome previews ----------
  // A little profile set in the biome, with its colors and what drifts
  // there, so members can see a biome before they buy or choose it.
  // size: "small" for the hover preview
  function biomePreview(key, size) {
    const look = biomeLook(key) || BIOME_LOOKS.forest;
    const box = el("div", "biome-preview biome-" + key + (size ? " is-" + size : ""));
    box.setAttribute("aria-hidden", "true");
    box.style.background = "linear-gradient(180deg, rgb(" + look.top.join(",") + "), rgb(" + look.deep.join(",") + "))";

    const layer = el("div", "biome-layer");
    overlayLayers(look).forEach((o) => layer.appendChild(makeOverlay(o)));
    if (look.rays) layer.appendChild(el("div", "light-rays"));
    look.particles.forEach(([kind, count]) => {
      for (let i = 0; i < Math.ceil(count * 0.6); i++) {
        const bit = particle(kind);
        bit.style.left = (3 + Math.random() * 94).toFixed(1) + "%";
        bit.style.top = (5 + Math.random() * 88).toFixed(1) + "%";
        layer.appendChild(bit);
      }
    });
    box.appendChild(layer);

    // A pretend profile: name, shelf, and a review
    const page = el("div", "preview-page");
    const head = el("div", "preview-head");
    head.appendChild(el("span", "preview-avatar"));
    const name = el("span", "preview-name", "Your profile");
    name.appendChild(el("span", "biome-symbol", look.symbol));
    head.appendChild(name);
    page.appendChild(head);
    const shelf = el("div", "preview-card preview-shelf");
    const img = el("img");
    img.src = art("biome-assets/hero-shelf.png");
    img.alt = "";
    shelf.appendChild(img);
    page.appendChild(shelf);
    const review = el("div", "preview-card preview-review");
    review.appendChild(el("span", "preview-stars", "\u2605\u2605\u2605\u2605\u2605"));
    for (let i = 0; i < 2; i++) review.appendChild(el("span", "preview-line"));
    review.appendChild(el("span", "preview-chip", "Holy grail"));
    page.appendChild(review);
    box.appendChild(page);
    return box;
  }

  // The full preview, in a pop-up. item: { key, name, description, rarity, price }
  function openBiomePreview(item) {
    const look = biomeLook(item.key) || BIOME_LOOKS.forest;
    const dialog = el("dialog", "celebrate biome-preview-dialog");
    dialog.setAttribute("aria-labelledby", "biome-preview-heading");
    dialog.appendChild(el("p", "celebrate-label", "Biome preview"));
    dialog.appendChild(biomePreview(item.key));
    const h = el("h2", null, item.name || look.name);
    h.id = "biome-preview-heading";
    dialog.appendChild(h);
    if (item.description) dialog.appendChild(el("p", "celebrate-text", item.description));
    const ok = el("button", "btn btn-solid", "Close");
    ok.type = "button";
    ok.addEventListener("click", () => dialog.close());
    const actions = el("div", "celebrate-actions");
    actions.appendChild(ok);
    dialog.appendChild(actions);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    document.body.appendChild(dialog);
    dialog.showModal();
    ok.focus();
  }

  // On computers with a mouse, resting the pointer on a biome's picture
  // shows a smaller preview beside it
  let hoverBox = null;
  function previewOnHover(target, item) {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let timer = null;
    target.addEventListener("mouseenter", () => {
      timer = setTimeout(() => {
        hidePreview();
        hoverBox = el("div", "biome-hover");
        hoverBox.appendChild(biomePreview(item.key, "small"));
        hoverBox.appendChild(el("p", "biome-hover-name", item.name || item.key));
        document.body.appendChild(hoverBox);
        const r = target.getBoundingClientRect();
        const w = hoverBox.offsetWidth, h = hoverBox.offsetHeight;
        // Beside the picture if there's room, otherwise on the other side
        let left = r.right + 12;
        if (left + w > window.innerWidth - 8) left = r.left - w - 12;
        left = Math.max(8, left);
        const top = Math.min(Math.max(8, r.top + r.height / 2 - h / 2), window.innerHeight - h - 8);
        hoverBox.style.left = Math.round(left) + "px";
        hoverBox.style.top = Math.round(top) + "px";
      }, 350);
    });
    target.addEventListener("mouseleave", () => { clearTimeout(timer); hidePreview(); });
    target.addEventListener("click", () => { clearTimeout(timer); hidePreview(); });
  }
  function hidePreview() {
    if (hoverBox) { hoverBox.remove(); hoverBox = null; }
  }
  window.addEventListener("scroll", hidePreview, { passive: true });

  // A "Preview" button for a biome
  function previewButton(item) {
    const btn = el("button", "btn btn-ghost btn-preview", "Preview");
    btn.type = "button";
    btn.setAttribute("aria-label", "Preview the " + (item.name || item.key) + " biome");
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openBiomePreview(item); });
    return btn;
  }

  let biomeStarted = false;

  function setBiome(key) {
    const look = biomeLook(key);
    if (!look || biomeStarted) return;
    biomeStarted = true;
    document.body.dataset.biome = key;
    document.body.classList.add("biome-page", "biome-" + key);
    // A light biome gets the dark green logo, and the phone's browser bar
    // matches the top of the page
    if (look.light) {
      const logo = document.querySelector(".site-header .logo img");
      if (logo) logo.src = "logo-wordmark-green.png";
      const bar = document.querySelector('meta[name="theme-color"]');
      if (bar) bar.content = "rgb(" + look.top.join(",") + ")";
    }

    // The slow shift in color as you go deeper
    // (the device's setting, or Reduce motion in the Accessibility panel)
    const stillMotion = () => (typeof A11Y !== "undefined" ? A11Y.reducedMotion() : window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let overlays = [];
    let ticking = false;
    function shade() {
      ticking = false;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      // Biomes that only change near the bottom always reach it there
      const depth = look.shadeFrom !== undefined ? Math.max(1, room) : Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, room));
      const from = look.shadeFrom || 0;
      const t = Math.max(0, (Math.min(1, window.scrollY / depth) - from) / (1 - from));
      const eased = t * t * (3 - 2 * t); // gentle at both ends
      // Most biomes blend from top to deep; some pass through more colors (stops)
      const stops = look.stops || [look.top, look.deep];
      const at = eased * (stops.length - 1);
      const seg = Math.min(stops.length - 2, Math.floor(at));
      const rgb = stops[seg].map((c, i) => Math.round(c + (stops[seg + 1][i] - c) * (at - seg)));
      document.body.style.backgroundColor = "rgb(" + rgb.join(",") + ")";
      document.body.style.setProperty("--biome-depth", eased.toFixed(3));
      // How far down the page you are (0 at the top, 1 at the bottom), for
      // things that only appear in the depths, however long the page is.
      // (iPhones can report a little above 0 while bouncing at the top.)
      const bottom = Math.min(1, Math.max(0, window.scrollY / Math.max(1, room)));
      document.body.style.setProperty("--biome-bottom", bottom.toFixed(3));
      // The ocean's glow lights up from halfway down (fully lit at 90%);
      // its bubbles stay until 60% and are gone by 95%
      const clamp01 = (n) => Math.min(1, Math.max(0, n));
      document.body.style.setProperty("--deep-glow", clamp01((bottom - 0.5) * 2.5).toFixed(3));
      document.body.style.setProperty("--shallow", clamp01((0.95 - bottom) * 2.86).toFixed(3));
      // The hand-drawn art drifts up slower than the page, so it feels further
      // back (the slower, the farther)
      overlays.forEach((o) => o.style.setProperty("--ov-y", stillMotion() ? "0px" : Math.round(-window.scrollY * o._speed) + "px"));
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(shade); }
    }, { passive: true });
    document.addEventListener("a11y-change", () => shade());

    // What drifts in the margins, kept beside the page content
    const layer = el("div", "biome-layer");
    layer.setAttribute("aria-hidden", "true");
    if (look.rays) layer.appendChild(el("div", "light-rays"));
    document.body.insertBefore(layer, document.body.firstChild);
    // The hand-drawn art sits behind the particles
    overlays = overlayLayers(look).map(makeOverlay);
    overlays.forEach((o) => document.body.insertBefore(o, layer));
    shade();
    // The slow fades (the ocean's glow and bubbles) only switch on once the
    // page has drawn, so things meant to be hidden start hidden instead of
    // fading out after the page loads
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("biome-settled")));
    const bits = [];
    look.particles.forEach(([kind, count]) => {
      for (let i = 0; i < count; i++) {
        const bit = particle(kind);
        bit._side = i % 2;   // left or right margin
        bit._x = Math.random();
        bit._y = Math.random();
        layer.appendChild(bit);
        bits.push(bit);
      }
    });
    // A few that glow (or fall) very faintly through the page content: their own
    // see-through layer just above the posts and cards (but under the
    // footer), so they show through the boxes without hiding anything
    const middle = [];
    const main = document.querySelector("body > main");
    if (look.throughContent && main) {
      const front = el("div", "biome-layer is-through");
      front.setAttribute("aria-hidden", "true");
      look.throughContent.forEach(([kind, count]) => {
        for (let i = 0; i < count; i++) {
          const bit = particle(kind);
          // mostly toward the content's edges, where they can be seen
          const r = Math.random() * 0.5;
          bit._x = i % 2 ? 0.5 - r : 0.5 + r;
          bit._y = Math.random();
          front.appendChild(bit);
          middle.push(bit);
        }
      });
      main.after(front);
    }
    function place() {
      const main = document.querySelector("main");
      const w = window.innerWidth;
      const content = main ? main.getBoundingClientRect() : { left: w * 0.2, width: w * 0.6 };
      // Room on each side of the content (at least a thin strip on phones)
      const margin = Math.max(18, content.left - 12);
      bits.forEach((bit) => {
        const x = bit._side === 0 ? bit._x * margin : w - margin + bit._x * margin;
        bit.style.left = Math.round(x) + "px";
        bit.style.top = Math.round(6 + bit._y * 86) + "%";
      });
      // These fade out toward the middle of the page: faint near the
      // content's edges, gone at its center
      middle.forEach((bit) => {
        bit.style.left = Math.round(content.left + bit._x * content.width) + "px";
        bit.style.top = Math.round(6 + bit._y * 86) + "%";
        const fromCenter = Math.abs(bit._x - 0.5) * 2; // 0 in the middle, 1 at the edges
        bit.style.setProperty("--through", (0.3 * fromCenter * fromCenter).toFixed(3));
      });
    }
    window.addEventListener("resize", place);
    place();
  }

  // ---------- Moderator thank-you ----------
  // Moderators earn Byome points quietly while they work. When they leave
  // the Moderate page, one pop-up thanks them with the total for that visit.
  const MOD_SESSION = "byome-mod-session";
  const MOD_ACTIONS = ["mod_decision", "mod_edit"];

  // Called by the Moderate page: remembers the newest moderator reward so
  // far, so later we can count only what was earned during this visit
  async function startModSession(userId) {
    try { if (sessionStorage.getItem(MOD_SESSION)) return; } catch (e) { return; }
    const { data } = await supabaseClient.from("point_ledger").select("created_at")
      .eq("user_id", userId).in("action", MOD_ACTIONS).order("created_at", { ascending: false }).limit(1);
    try {
      sessionStorage.setItem(MOD_SESSION, JSON.stringify({ since: data && data.length ? data[0].created_at : null }));
    } catch (e) { /* storage blocked: no thank-you pop-up, nothing else changes */ }
  }

  async function thankModerator() {
    if (/moderate-products\.html$/.test(window.location.pathname)) return;
    let session = null;
    try {
      session = JSON.parse(sessionStorage.getItem(MOD_SESSION) || "null");
      sessionStorage.removeItem(MOD_SESSION);
    } catch (e) { return; }
    if (!session || typeof supabaseClient === "undefined") return;
    const { data: auth } = await supabaseClient.auth.getSession();
    if (!auth.session) return;

    let query = supabaseClient.from("point_ledger").select("biome_points")
      .eq("user_id", auth.session.user.id).in("action", MOD_ACTIONS).is("revoked_at", null);
    if (session.since) query = query.gt("created_at", session.since);
    const { data: rows } = await query;
    if (!rows || !rows.length) return;
    const points = rows.reduce((sum, r) => sum + r.biome_points, 0);
    celebrate({
      label: "Moderator thanks",
      heading: "Thanks for your hard work!",
      text: "You earned " + points + " Byome points for completing " + rows.length +
        (rows.length === 1 ? " action" : " actions") + " as a moderator.",
    });
  }

  // ---------- The bottom of the page on phones ----------
  // Phones "bounce" past the bottom of a page, showing the browser's
  // background (and the leaves and fireflies, which stay put) below the
  // footer. Near the bottom, the browser is asked not to bounce there;
  // pull-to-refresh at the top still works. In case it bounces anyway,
  // the space behind the page takes the footer's color.
  function calmBottomBounce() {
    const root = document.documentElement;
    let ticking = false;
    function check() {
      ticking = false;
      const footer = document.querySelector(".site-footer");
      const room = root.scrollHeight - window.innerHeight;
      const nearBottom = room <= 0 || window.scrollY > room / 2;
      root.classList.toggle("near-bottom", nearBottom);
      root.style.backgroundColor = nearBottom && footer ? getComputedStyle(footer).backgroundColor : "";
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(check); }
    }, { passive: true });
    window.addEventListener("resize", check);
    // Pages grow as posts and reviews load in, so check again when they do
    if (window.ResizeObserver) new ResizeObserver(() => check()).observe(document.body);
    check();
  }

  // ---------- Password fields: Show / Hide ----------
  function addPasswordToggles() {
    document.querySelectorAll('input[type="password"]').forEach((input) => {
      const wrap = el("span", "password-field");
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const btn = el("button", "password-toggle", "Show");
      btn.type = "button";
      btn.setAttribute("aria-label", "Show password");
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.textContent = showing ? "Show" : "Hide";
        btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        btn.setAttribute("aria-pressed", String(!showing));
      });
      wrap.appendChild(btn);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    addPasswordToggles();
    buildFooter();
    calmBottomBounce();
    checkAchievements();
    thankModerator();
    if (document.body.dataset.biome) setBiome(document.body.dataset.biome);
  });

  return { liveEvent, eventBanner, centralTime, iconOrLabel, reviewIcons, openAccessibility, REMOVAL_REASONS, removalReasonLabel, friendlyDate, timeTag, emptyState, celebrate, sparkles, itemArt, soilImage, setBiome, biomeSymbol, memberBadge, biomeSwatch, biomeLook, biomePreview, openBiomePreview, previewOnHover, previewButton, startModSession };
})();
