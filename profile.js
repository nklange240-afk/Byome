// Public profile page. profile.html?user=NAME shows that member;
// plain profile.html shows your own (plus your points).
const params = new URLSearchParams(window.location.search);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function leafIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "leaf-icon");
  svg.setAttribute("aria-hidden", "true");
  const body = document.createElementNS(ns, "path");
  body.setAttribute("class", "leaf-body");
  body.setAttribute("d", "M20 4C10 4 4.5 9.5 4.5 15c0 2.2 1.3 4 3.5 4C14.5 19 20 14 20 4z");
  const vein = document.createElementNS(ns, "path");
  vein.setAttribute("class", "leaf-vein");
  vein.setAttribute("d", "M3.5 21C7 15 11 11.5 15 9");
  svg.append(body, vein);
  return svg;
}

function starIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "star-icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M12 2c.7 5.6 3.9 9.3 10 10-6.1.7-9.3 4.4-10 10-.7-5.6-3.9-9.3-10-10 6.1-.7 9.3-4.4 10-10z");
  svg.appendChild(path);
  return svg;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

function showMessage(container, text) {
  container.innerHTML = "";
  container.appendChild(el("p", "feed-empty", text));
}

function metaRow(createdAt, editedAt) {
  const meta = el("div", "post-meta");
  const time = el("time", null, formatDate(createdAt));
  time.dateTime = createdAt;
  meta.appendChild(time);
  if (editedAt) meta.appendChild(el("span", "edited-tag", "edited"));
  return meta;
}

function buildPostCard(p) {
  const article = el("article", "post");
  if (p.title) article.appendChild(el("h2", "post-title", p.title));
  article.append(metaRow(p.created_at, p.edited_at), el("p", "post-body", p.body));
  const likes = p.likes ? p.likes.length : 0;
  const comments = p.comments && p.comments.length ? p.comments[0].count : 0;
  article.appendChild(el("p", "profile-counts", plural(likes, "like") + " · " + plural(comments, "comment")));
  return article;
}

function buildReviewCard(r) {
  const article = el("article", "post");
  article.appendChild(el("h2", "post-title", r.title));

  const product = r.products ? r.products.brand + " — " + r.products.name : "Unknown product";
  article.appendChild(el("p", "review-product", r.variation ? product + " (" + r.variation + ")" : product));

  const rating = el("div", "review-rating");
  for (let i = 1; i <= 5; i++) {
    const s = el("span", "rating-leaf static" + (i <= r.rating ? " on" : ""));
    s.appendChild(leafIcon());
    rating.appendChild(s);
  }
  rating.setAttribute("role", "img");
  rating.setAttribute("aria-label", r.rating + " out of 5");
  article.appendChild(rating);

  const tags = el("div", "review-tags");
  if (r.review_standouts && r.review_standouts.length) tags.appendChild(el("span", "review-tag standout", "Standout review"));
  if (r.holy_grail) {
    const tag = el("span", "review-tag holy-grail");
    tag.append(starIcon(), document.createTextNode("Holy grail"));
    tags.appendChild(tag);
  }
  if (r.would_repurchase !== null && r.would_repurchase !== undefined) {
    tags.appendChild(el("span", "review-tag", r.would_repurchase ? "Would repurchase" : "Wouldn't repurchase"));
  }
  if (tags.children.length) article.appendChild(tags);

  article.append(metaRow(r.created_at, r.edited_at), el("p", "post-body", r.body));
  const likes = r.review_likes ? r.review_likes.length : 0;
  article.appendChild(el("p", "profile-counts", plural(likes, "like")));
  return article;
}

// The order "how to earn" is listed in
const EARN_ORDER = ["review", "first_review", "review_update", "review_liked", "review_standout",
  "post_engaged", "comment_liked", "product_approved", "welcome"];

// A small coin for community points
function coinIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "points-icon");
  svg.setAttribute("aria-hidden", "true");
  const ring = document.createElementNS(ns, "circle");
  ring.setAttribute("cx", "12"); ring.setAttribute("cy", "12"); ring.setAttribute("r", "10");
  ring.setAttribute("fill", "none"); ring.setAttribute("stroke", "currentColor"); ring.setAttribute("stroke-width", "1.8");
  const star = document.createElementNS(ns, "path");
  star.setAttribute("d", "M12 2c.7 5.6 3.9 9.3 10 10-6.1.7-9.3 4.4-10 10-.7-5.6-3.9-9.3-10-10 6.1-.7 9.3-4.4 10-10z");
  star.setAttribute("transform", "translate(5.5 5.5) scale(.55)");
  star.setAttribute("fill", "currentColor");
  svg.append(ring, star);
  return svg;
}

// "+10" pills: gold for community points, green for biome points. Zeros are
// hidden. Spending (a negative number) shows as "−40".
function chips(community, biome) {
  const wrap = el("div", "chips");
  const label = (n) => (n < 0 ? "\u2212" + Math.abs(n) : "+" + n);
  if (community) wrap.appendChild(el("span", "chip chip-community" + (community < 0 ? " chip-spent" : ""), label(community)));
  if (biome) wrap.appendChild(el("span", "chip chip-biome" + (biome < 0 ? " chip-spent" : ""), label(biome)));
  return wrap;
}

function statTile(kind, label, value, pending, icon) {
  const tile = el("div", "points-stat " + kind);
  icon.classList.add("points-icon"); // same size for both tiles
  tile.append(icon, el("span", "points-number", String(value)), el("span", "points-label", label));
  if (pending) tile.appendChild(el("span", "points-pending", "+" + pending + " pending"));
  return tile;
}

// Your own points: balances, how to earn more, and recent activity
async function showPoints(userId) {
  const panel = document.getElementById("points-panel");

  const [totalsRes, ledgerRes, rulesRes] = await Promise.all([
    supabaseClient.from("user_points")
      .select("community, biome, pending_community, pending_biome").eq("user_id", userId).maybeSingle(),
    supabaseClient.from("point_ledger")
      .select("action, community_points, biome_points, created_at, available_at, revoked_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabaseClient.from("point_rules")
      .select("action, label, description, community_points, biome_points"),
  ]);
  if (totalsRes.error && ledgerRes.error) return; // points aren't set up yet

  const totals = totalsRes.data || { community: 0, biome: 0, pending_community: 0, pending_biome: 0 };
  const rules = (rulesRes.data || []).slice().sort((x, y) => {
    const ix = EARN_ORDER.indexOf(x.action), iy = EARN_ORDER.indexOf(y.action);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
  });
  const labels = {};
  rules.forEach((r) => { labels[r.action] = r.label; });

  panel.innerHTML = "";

  const head = el("div", "points-head");
  head.append(el("h2", "section-title", "Your points"),
    el("p", "points-sub", "Earn points by reviewing, helping out and joining the conversation."));
  panel.appendChild(head);

  const stats = el("div", "points-stats");
  stats.append(
    statTile("community", "Community points", totals.community, totals.pending_community, coinIcon()),
    statTile("biome", "Biome points", totals.biome, totals.pending_biome, leafIcon())
  );
  panel.appendChild(stats);
  const note = el("p", "points-note",
    "Community points are for future real-world rewards. Biome points buy pots, plants and shelves in the ");
  const shopLink = el("a", "inline-link", "Biome shop");
  shopLink.href = "biome-shop.html";
  note.append(shopLink, document.createTextNode(". Pending points become available after a short waiting period."));
  panel.appendChild(note);

  const earnable = rules.filter((r) => r.community_points || r.biome_points);
  if (earnable.length) {
    const earn = el("details", "points-earn");
    earn.appendChild(el("summary", null, "How to earn points"));
    const list = el("ul", "earn-list");
    earnable.forEach((r) => {
      const li = el("li", "earn-item");
      const main = el("div", "earn-main");
      main.appendChild(el("div", "earn-title", r.label));
      if (r.description) main.appendChild(el("div", "earn-desc", r.description));
      li.append(main, chips(r.community_points, r.biome_points));
      list.appendChild(li);
    });
    earn.appendChild(list);
    panel.appendChild(earn);
  }

  const rows = ledgerRes.data || [];
  if (rows.length) {
    panel.appendChild(el("h3", "points-subtitle", "Recent activity"));
    const list = el("ul", "points-log");
    rows.forEach((row) => {
      const li = el("li", "points-entry" + (row.revoked_at ? " is-revoked" : ""));
      const main = el("div", "entry-main");
      main.appendChild(el("div", "entry-title", labels[row.action] || row.action));
      let meta = formatDate(row.created_at);
      if (row.revoked_at) meta += " · removed";
      else if (new Date(row.available_at) > new Date()) meta += " · available " + formatDate(row.available_at);
      main.appendChild(el("div", "entry-meta", meta));
      li.append(main, chips(row.community_points, row.biome_points));
      list.appendChild(li);
    });
    panel.appendChild(list);
  }
  panel.hidden = false;
}

// ---------- Biome shelf ----------
// Everyone's profile shows their shelf. On your own profile, "Arrange"
// lets you pick a pot (and plant) for each spot, and which shelf to use.
// All the rules (owning enough, right size) are checked by the database.
async function showBiome(profileId, isMe) {
  const section = document.getElementById("biome-section");
  const shelfEl = document.getElementById("biome-shelf");
  const hintEl = document.getElementById("biome-hint");
  const editorEl = document.getElementById("biome-editor");
  const arrangeBtn = document.getElementById("biome-arrange");

  const [itemsRes, slotsRes, shelfRes, ownedRes, rewardsRes] = await Promise.all([
    supabaseClient.from("biome_items").select("key, kind, size, name, description, rarity, image, starter, sort_order").order("sort_order"),
    supabaseClient.from("biome_slots").select("slot, pot_key, plant_key").eq("user_id", profileId),
    supabaseClient.from("profiles").select("biome_shelf").eq("id", profileId).single(),
    isMe ? supabaseClient.from("biome_inventory").select("item_key").eq("user_id", profileId) : Promise.resolve({ data: [] }),
    supabaseClient.from("achievements").select("name, reward_item").not("reward_item", "is", null),
  ]);
  if (itemsRes.error || slotsRes.error || shelfRes.error) return; // biome isn't set up in the database yet

  const items = {};
  itemsRes.data.forEach((it) => { items[it.key] = it; });
  // Items that come from an achievement say so in their info box
  (rewardsRes.data || []).forEach((a) => { if (items[a.reward_item]) items[a.reward_item].earnedWith = a.name; });
  const placed = {};
  slotsRes.data.forEach((row) => { placed[row.slot] = { pot: row.pot_key, plant: row.plant_key }; });
  let shelfKey = shelfRes.data.biome_shelf;
  const owned = {};
  (ownedRes.data || []).forEach((row) => { owned[row.item_key] = (owned[row.item_key] || 0) + 1; });

  let editing = false;
  let selected = null;
  let message = "";

  // How many more of this item could go in this spot (Infinity for starter items)
  function spare(key, slot) {
    const it = items[key];
    if (it.starter) return Infinity;
    let used = 0;
    Object.keys(placed).forEach((n) => {
      if (Number(n) !== slot && (placed[n].pot === key || placed[n].plant === key)) used++;
    });
    return (owned[key] || 0) - used;
  }

  function tile(label, meta, image, pressed, onClick) {
    const btn = el("button", "biome-tile");
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(pressed));
    if (image) {
      const i = document.createElement("img");
      i.src = BIOME.src(image);
      i.alt = "";
      btn.appendChild(i);
    } else {
      btn.appendChild(el("span", "biome-tile-empty", "∅"));
    }
    btn.appendChild(el("span", null, label));
    if (meta) btn.appendChild(el("span", "biome-tile-meta", meta));
    btn.addEventListener("click", onClick);
    return btn;
  }

  async function save(call, args) {
    message = "";
    const { error } = await supabaseClient.rpc(call, args);
    if (error) message = error.message;
    return !error;
  }

  async function reloadSlots() {
    const { data } = await supabaseClient.from("biome_slots").select("slot, pot_key, plant_key").eq("user_id", profileId);
    Object.keys(placed).forEach((n) => delete placed[n]);
    (data || []).forEach((row) => { placed[row.slot] = { pot: row.pot_key, plant: row.plant_key }; });
  }

  // A plant chosen for an empty spot goes in the default terra cotta pot
  // (the database picks it); the pot can be swapped afterwards.
  async function setSlot(slot, pot, plant) {
    if (await save("set_biome_slot", { p_slot: slot, p_pot: pot, p_plant: plant })) await reloadSlots();
    render();
  }

  function itemTiles(kind, size, slot, current, onPick) {
    const wrap = el("div", "biome-tiles");
    Object.values(items)
      .filter((it) => it.kind === kind && it.size === size)
      .filter((it) => it.key === current || spare(it.key, slot) > 0)
      .forEach((it) => {
        const left = spare(it.key, slot);
        const meta = it.starter ? "Free" : (left === Infinity ? "" : left + " spare");
        wrap.appendChild(tile(it.name, it.key === current ? "In this spot" : meta, it.image, it.key === current, () => onPick(it.key)));
      });
    return wrap;
  }

  function renderEditor() {
    editorEl.innerHTML = "";

    // Which shelf
    editorEl.appendChild(el("h3", null, "Shelf"));
    const shelves = el("div", "biome-tiles");
    Object.values(items)
      .filter((it) => it.kind === "shelf" && (it.starter || owned[it.key]))
      .forEach((it) => shelves.appendChild(tile(it.name, null, it.image, it.key === shelfKey, async () => {
        if (it.key === shelfKey) return;
        if (await save("set_biome_shelf", { p_key: it.key })) shelfKey = it.key;
        render();
      })));
    editorEl.appendChild(shelves);

    if (selected === null) {
      editorEl.appendChild(el("p", "feed-empty", "Tap a spot on the shelf to choose what goes there."));
    } else {
      const size = BIOME.sizeOfSlot(selected);
      const here = placed[selected] || {};

      // Plant first: plants come in a terra cotta pot, which can be swapped below
      editorEl.appendChild(el("h3", null, "Plant for this " + size + " spot"));
      const plants = itemTiles("plant", size, selected, here.plant, (key) => setSlot(selected, here.pot || null, key));
      if (plants.children.length === 0) {
        editorEl.appendChild(el("p", "feed-empty", size === "medium"
          ? "Plants for the bottom shelf are coming soon."
          : "No spare plants. To move a plant here, empty its current spot first."));
      } else {
        if (here.pot) plants.prepend(tile("No plant", null, null, !here.plant, () => setSlot(selected, here.pot, null)));
        editorEl.appendChild(plants);
      }

      editorEl.appendChild(el("h3", null, "Pot"));
      const pots = itemTiles("pot", size, selected, here.pot, (key) => setSlot(selected, key, here.plant || null));
      pots.prepend(tile("Empty spot", null, null, !here.pot, () => setSlot(selected, null, null)));
      editorEl.appendChild(pots);
      if (pots.children.length === 1 && size === "medium") {
        editorEl.appendChild(el("p", "feed-empty", "Medium pots for the bottom shelf are coming soon."));
      }
    }

    if (message) {
      const m = el("p", "auth-message", message);
      m.style.color = "#E07A5F";
      editorEl.appendChild(m);
    }
    const more = el("p", "feed-empty");
    const link = el("a", "inline-link", "Biome shop");
    link.href = "biome-shop.html";
    more.append(document.createTextNode("Want more? Visit the "), link, document.createTextNode("."));
    editorEl.appendChild(more);
  }

  function render() {
    shelfEl.replaceChildren(BIOME.build(items, shelfKey, placed, editing ? {
      editable: true,
      selected: selected,
      onSelect: (slot) => { selected = slot; message = ""; render(); },
    } : null));

    const empty = Object.keys(placed).length === 0;
    hintEl.hidden = editing || !empty;
    hintEl.textContent = isMe ? "Your shelf is empty. Tap Arrange to add pots." : "Nothing on this shelf yet.";

    editorEl.hidden = !editing;
    if (editing) renderEditor();
    arrangeBtn.textContent = editing ? "Done" : "Arrange";
  }

  if (isMe) {
    arrangeBtn.hidden = false;
    arrangeBtn.addEventListener("click", () => {
      editing = !editing;
      selected = null;
      message = "";
      render();
    });
  }
  render();
  section.hidden = false;
}

// Achievements earned, shown on every profile under the shelf
async function showAchievements(profileId) {
  const box = document.getElementById("achievements");
  const { data, error } = await supabaseClient
    .from("user_achievements")
    .select("earned_at, achievement:achievements!achievement_key(name, description, sort_order)")
    .eq("user_id", profileId)
    .order("earned_at", { ascending: true });
  if (error || !data.length) return;

  box.innerHTML = "";
  box.appendChild(el("h3", "points-subtitle", "Achievements"));
  const list = el("ul", "achievement-list");
  data.forEach((row) => {
    const li = el("li", "achievement");
    li.append(starIcon(), el("span", "achievement-name", row.achievement.name));
    li.title = row.achievement.description + " Earned " + formatDate(row.earned_at) + ".";
    list.appendChild(li);
  });
  box.appendChild(list);
  box.hidden = false;
}

(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }
  const me = data.session.user.id;
  const wanted = params.get("user");

  const nameEl = document.getElementById("profile-name");
  const reviewsEl = document.getElementById("profile-reviews");
  const postsEl = document.getElementById("profile-posts");

  let query = supabaseClient.from("profiles").select("id, username, created_at");
  query = wanted ? query.eq("username", wanted) : query.eq("id", me);
  const { data: profile } = await query.maybeSingle();

  if (!profile) {
    nameEl.textContent = "Profile not found";
    showMessage(reviewsEl, "We couldn't find that member.");
    showMessage(postsEl, "");
    return;
  }

  document.title = profile.username + " — byome";
  nameEl.textContent = profile.username;
  if (profile.created_at) {
    document.getElementById("profile-since").textContent =
      "Member since " + new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  if (profile.id === me) showPoints(profile.id);
  showBiome(profile.id, profile.id === me);
  showAchievements(profile.id);

  const [reviewsRes, postsRes] = await Promise.all([
    supabaseClient.from("reviews")
      .select("id, rating, title, body, variation, would_repurchase, holy_grail, created_at, edited_at, products!product_id(name, brand), review_likes(user_id), review_standouts(review_id)", { count: "exact" })
      .eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30),
    supabaseClient.from("posts")
      .select("id, title, body, created_at, edited_at, likes(user_id), comments(count)", { count: "exact" })
      .eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30),
  ]);

  document.getElementById("profile-stats").textContent =
    plural(reviewsRes.count || 0, "review") + " · " + plural(postsRes.count || 0, "post");

  reviewsEl.innerHTML = "";
  if (reviewsRes.error) showMessage(reviewsEl, "Couldn't load reviews: " + reviewsRes.error.message);
  else if (!reviewsRes.data.length) showMessage(reviewsEl, "No reviews yet.");
  else reviewsRes.data.forEach((r) => reviewsEl.appendChild(buildReviewCard(r)));

  postsEl.innerHTML = "";
  if (postsRes.error) showMessage(postsEl, "Couldn't load posts: " + postsRes.error.message);
  else if (!postsRes.data.length) showMessage(postsEl, "No posts yet.");
  else postsRes.data.forEach((p) => postsEl.appendChild(buildPostCard(p)));
})();
