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
  const SPARKLY = ["rare", "legendary"];

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
      const plant = el("img", "biome-plant" + (className ? "" : " celebrate-grow") + (item.over_pot ? " is-over-pot" : ""));
      plant.src = art(item.image);
      plant.alt = "";
      const potImg = el("img", "biome-pot");
      potImg.src = art(pot);
      potImg.alt = "";
      const frontImg = el("img", "biome-pot-front");
      frontImg.src = art(front);
      frontImg.alt = "";
      box.append(potImg, plant, frontImg);
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
    if (!/profile\.html$/.test(window.location.pathname) || window.location.search) {
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

    const { data: rows, error } = await supabaseClient
      .from("user_achievements")
      .select("achievement_key, earned_at, achievements!achievement_key(name, description, biome_items!reward_item(key, kind, name, image, rarity, over_pot))")
      .eq("user_id", userId).gte("earned_at", since).order("earned_at");
    if (error || !rows) return;

    const seen = readSeen(userId);
    const fresh = rows.filter((r) => seen.indexOf(r.achievement_key) === -1);
    if (!fresh.length) return;
    writeSeen(userId, seen.concat(fresh.map((r) => r.achievement_key)));

    fresh.forEach((r) => {
      const a = r.achievements || {};
      const item = a.biome_items;
      celebrate({
        label: "Achievement unlocked",
        heading: a.name || "New achievement",
        text: (a.description ? a.description + " " : "") +
          (item ? "Your reward: " + item.name + (item.kind === "plant" ? ", already on your shelf." : ".") : ""),
        item: item,
      });
    });
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
  // The colors of cards and borders for each biome are in style.css.
  const BIOME_LOOKS = {
    forest: { name: "Forest", symbol: "\u{1F332}", top: [36, 64, 47], deep: [15, 31, 22], particles: [["firefly", 16]],
              overlay: "biome-assets/overlay-forest.webp" },
    meadow: { name: "Meadow", symbol: "\u{1F33C}", top: [36, 64, 47], deep: [36, 64, 47], particles: [], // hand-drawn florals to come
              // its preview tile hints at spring green and petals
              preview: { top: [78, 128, 72], deep: [36, 64, 47], dots: "petal" } },
    desert: { name: "Desert", symbol: "☀️", top: [128, 90, 30], deep: [58, 36, 38], particles: [["glint", 34]],
              shadeFrom: 0.65, // golden most of the way; dusk only near the bottom
              // its preview tile is brighter, like sand in the sun
              preview: { top: [184, 132, 54], deep: [128, 90, 30] } },
    tundra: { name: "Snowy tundra", symbol: "❄️", top: [84, 104, 124], deep: [14, 24, 42], particles: [["snow", 34]],
              shadeFrom: 0.15 }, // pale dusty blue, deepening to dark blue by the bottom
    ocean: { name: "Open ocean", symbol: "\u{1F30A}", top: [20, 52, 78], deep: [4, 12, 26], particles: [["bubble", 16]], rays: true },
    reef: { name: "Coral reef", symbol: "\u{1F420}", top: [16, 60, 64], deep: [8, 30, 42], particles: [["plankton", 18], ["bubble", 8]], rays: true },
  };
  // Pixels of scrolling to reach the deepest point: the bottom of the page,
  // but at least MIN_DEPTH (so short pages only darken a little) and at
  // most MAX_DEPTH
  const MIN_DEPTH = 2500, MAX_DEPTH = 9000;

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
    if (look.overlay) {
      const overlay = el("div", "biome-overlay");
      overlay.style.setProperty("--ov-img", "url(" + art(look.overlay) + ")");
      layer.appendChild(overlay);
    }
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

    // The slow shift in color as you go deeper
    const stillMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let overlay = null;
    let ticking = false;
    function shade() {
      ticking = false;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      // Biomes that only change near the bottom always reach it there
      const depth = look.shadeFrom !== undefined ? Math.max(1, room) : Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, room));
      const from = look.shadeFrom || 0;
      const t = Math.max(0, (Math.min(1, window.scrollY / depth) - from) / (1 - from));
      const eased = t * t * (3 - 2 * t); // gentle at both ends
      const rgb = look.top.map((c, i) => Math.round(c + (look.deep[i] - c) * eased));
      document.body.style.backgroundColor = "rgb(" + rgb.join(",") + ")";
      document.body.style.setProperty("--biome-depth", eased.toFixed(3));
      // The overlay drifts up at half the page's speed, so it feels further back
      if (overlay && !stillMotion) overlay.style.setProperty("--ov-y", Math.round(-window.scrollY * 0.5) + "px");
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(shade); }
    }, { passive: true });

    // What drifts in the margins, kept beside the page content
    const layer = el("div", "biome-layer");
    layer.setAttribute("aria-hidden", "true");
    if (look.rays) layer.appendChild(el("div", "light-rays"));
    document.body.insertBefore(layer, document.body.firstChild);
    // The hand-drawn art sits behind the particles
    if (look.overlay) {
      overlay = el("div", "biome-overlay");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.setProperty("--ov-img", "url(" + art(look.overlay) + ")");
      document.body.insertBefore(overlay, layer);
    }
    shade();
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
    function place() {
      const main = document.querySelector("main");
      const w = window.innerWidth;
      const content = main ? main.getBoundingClientRect() : { left: w * 0.2 };
      // Room on each side of the content (at least a thin strip on phones)
      const margin = Math.max(18, content.left - 12);
      bits.forEach((bit) => {
        const x = bit._side === 0 ? bit._x * margin : w - margin + bit._x * margin;
        bit.style.left = Math.round(x) + "px";
        bit.style.top = Math.round(6 + bit._y * 86) + "%";
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

  return { REMOVAL_REASONS, removalReasonLabel, friendlyDate, timeTag, emptyState, celebrate, sparkles, itemArt, setBiome, biomeSymbol, biomeSwatch, biomeLook, biomePreview, openBiomePreview, previewOnHover, previewButton, startModSession };
})();
