// Shared bits of the interface, used on every page:
//   - the footer
//   - friendly "nothing here yet" messages with a little plant art
//   - the pop-up that celebrates a new achievement or purchase
//   - sparkles on rare items
const UI = (function () {
  // Shown in the footer as "Contact" once there's an inbox to send to,
  // e.g. "hello@byome.xyz". Left empty, the Contact link doesn't show.
  const CONTACT_EMAIL = "";

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
    footer.appendChild(el("p", "footer-tagline", "byome — built by the community, for the community."));
    const links = el("nav", "footer-links");
    links.setAttribute("aria-label", "About byome");
    const items = [["index.html#about", "About"], ["terms.html", "Terms"], ["privacy.html", "Privacy"]];
    if (CONTACT_EMAIL) items.push(["mailto:" + CONTACT_EMAIL, "Contact"]);
    items.forEach(([href, text]) => {
      const a = el("a", null, text);
      a.href = href;
      links.appendChild(a);
    });
    footer.appendChild(links);
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
  //     its deepest point; the page shifts very slowly between them as
  //     you scroll down
  //   particles: what drifts in the margins, and how many
  // The colors of cards and borders for each biome are in style.css.
  const BIOME_LOOKS = {
    forest: { name: "Forest", symbol: "\u{1F332}", top: [36, 64, 47], deep: [12, 26, 19], particles: [["firefly", 16]] },
    meadow: { name: "Meadow", symbol: "\u{1F33C}", top: [54, 106, 52], deep: [45, 92, 44], particles: [] }, // hand-drawn florals to come
    desert: { name: "Desert", symbol: "☀️", top: [64, 44, 34], deep: [34, 23, 38], particles: [["mote", 18]] },
    tundra: { name: "Snowy tundra", symbol: "❄️", top: [34, 48, 61], deep: [16, 24, 34], particles: [["snow", 26]] },
    ocean: { name: "Open ocean", symbol: "\u{1F30A}", top: [20, 52, 78], deep: [4, 12, 26], particles: [["bubble", 16]], rays: true },
    reef: { name: "Coral reef", symbol: "\u{1F420}", top: [16, 60, 64], deep: [8, 30, 42], particles: [["plankton", 18], ["bubble", 8]], rays: true },
  };
  const DEPTH = 9000; // pixels of scrolling to reach the deepest point

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
    const box = el("div", (className || "biome-swatch") + " swatch-" + key);
    box.style.background = "linear-gradient(170deg, rgb(" + look.top.join(",") + "), rgb(" + look.deep.join(",") + "))";
    box.setAttribute("aria-hidden", "true");
    if (look.rays) box.appendChild(el("span", "swatch-rays"));
    const kind = look.particles.length ? look.particles[0][0] : null;
    for (let i = 0; kind && i < 7; i++) {
      const p = el("span", "swatch-dot dot-" + kind);
      p.style.left = (8 + ((i * 37) % 84)) + "%";
      p.style.top = (10 + ((i * 53) % 78)) + "%";
      box.appendChild(p);
    }
    box.appendChild(el("span", "swatch-symbol", look.symbol));
    return box;
  }

  let biomeStarted = false;

  function setBiome(key) {
    const look = biomeLook(key);
    if (!look || biomeStarted) return;
    biomeStarted = true;
    document.body.dataset.biome = key;
    document.body.classList.add("biome-page", "biome-" + key);

    // The slow shift in color as you go deeper
    let ticking = false;
    function shade() {
      ticking = false;
      const t = Math.min(1, window.scrollY / DEPTH);
      const eased = t * t * (3 - 2 * t); // gentle at both ends
      const rgb = look.top.map((c, i) => Math.round(c + (look.deep[i] - c) * eased));
      document.body.style.backgroundColor = "rgb(" + rgb.join(",") + ")";
      document.body.style.setProperty("--biome-depth", eased.toFixed(3));
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(shade); }
    }, { passive: true });
    shade();

    // What drifts in the margins, kept beside the page content
    const layer = el("div", "biome-layer");
    layer.setAttribute("aria-hidden", "true");
    if (look.rays) layer.appendChild(el("div", "light-rays"));
    document.body.insertBefore(layer, document.body.firstChild);
    const bits = [];
    look.particles.forEach(([kind, count]) => {
      for (let i = 0; i < count; i++) {
        const bit = el("span", "particle p-" + kind);
        // Each one moves on its own slow rhythm
        bit.style.setProperty("--dur", (14 + Math.random() * 16).toFixed(1) + "s");
        bit.style.setProperty("--blink", (3 + Math.random() * 4).toFixed(1) + "s");
        bit.style.setProperty("--delay", (-Math.random() * 30).toFixed(1) + "s");
        bit.style.setProperty("--dx", ((Math.random() - 0.5) * 60).toFixed(0) + "px");
        bit.style.setProperty("--dy", ((Math.random() - 0.5) * 80).toFixed(0) + "px");
        bit.style.setProperty("--size", (3 + Math.random() * 4).toFixed(1) + "px");
        bit.style.setProperty("--hue", String(Math.floor(Math.random() * 4)));
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

  document.addEventListener("DOMContentLoaded", () => {
    buildFooter();
    checkAchievements();
    thankModerator();
    if (document.body.dataset.biome) setBiome(document.body.dataset.biome);
  });

  return { emptyState, celebrate, sparkles, itemArt, setBiome, biomeSymbol, biomeSwatch, biomeLook, startModSession };
})();
