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
      .select("achievement_key, earned_at, achievements!achievement_key(name, description, biome_items!reward_item(kind, name, image, rarity, over_pot))")
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

  document.addEventListener("DOMContentLoaded", () => {
    buildFooter();
    checkAchievements();
  });

  return { emptyState, celebrate, sparkles, itemArt };
})();
