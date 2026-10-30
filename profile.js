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
  meta.appendChild(UI.timeTag(createdAt));
  if (editedAt) meta.appendChild(el("span", "edited-tag", "edited"));
  return meta;
}

// ---------- Editing your own posts and reviews from your profile ----------
// Same forms as the feed and reviews pages (edit-forms.js).

function heldNotice() {
  return el("p", "held-notice", "Waiting for a moderator to review. Only you and moderators can see this for now.");
}

// Edit / Delete buttons. `parts` are the bits of the card hidden while editing.
function ownerActions(article, parts, table, id, label, makeForm, reload, extraButtons) {
  const actions = el("div", "post-actions");
  const message = el("span", "auth-message");
  message.setAttribute("aria-live", "polite"); // read out by screen readers
  const show = (visible) => parts.forEach((node) => { node.hidden = !visible; });

  // No makeForm: this can't be edited here (polls are edited on Community)
  const edit = el("button", "action-btn", "Edit");
  edit.type = "button";
  edit.hidden = !makeForm;
  edit.addEventListener("click", () => {
    if (article.querySelector(".edit-form")) return;
    show(false);
    actions.hidden = true;
    const form = makeForm(reload, () => { form.remove(); show(true); actions.hidden = false; });
    article.appendChild(form);
    const first = form.querySelector("input, textarea");
    if (first) first.focus();
  });

  const del = el("button", "action-btn", "Delete");
  del.type = "button";
  del.addEventListener("click", async () => {
    if (!confirm("Delete this " + label + "? This can't be undone.")) return;
    const { error } = await supabaseClient.from(table).delete().eq("id", id);
    if (error) {
      message.textContent = "Couldn't delete: " + error.message;
      message.style.color = "#E07A5F";
      return;
    }
    reload();
  });

  actions.append(edit, ...(extraButtons || []), del, message);
  return actions;
}

// Follow-ups the author added to a review, shown under it as on Reviews
function describeGap(start, end) {
  const days = Math.floor((new Date(end) - new Date(start)) / 86400000);
  if (days < 1) return "Same day";
  if (days < 14) return days + (days === 1 ? " day later" : " days later");
  if (days < 60) return Math.round(days / 7) + " weeks later";
  return Math.round(days / 30) + " months later";
}

function reviewUpdateBox(u, r, isMe, reload) {
  const box = el("div", "review-update");
  const label = el("p", "review-update-label");
  label.append(el("strong", null, "Update"),
    document.createTextNode(" \u00b7 " + describeGap(r.created_at, u.created_at) + " \u00b7 " + formatDate(u.created_at)));
  box.appendChild(label);
  if (u.held_at) box.appendChild(heldNotice());
  box.appendChild(el("p", "review-update-body", u.body));
  if (isMe) {
    const del = el("button", "action-btn", "Delete update");
    del.type = "button";
    del.addEventListener("click", async () => {
      if (!confirm("Delete this update?")) return;
      await supabaseClient.from("review_updates").delete().eq("id", u.id);
      reload();
    });
    box.appendChild(del);
  }
  return box;
}

// "Add update": a short follow-up on how the product held up
function reviewUpdateForm(r, onSaved, onCancel) {
  const form = el("form", "comment-form update-form");
  form.appendChild(el("p", "field-label", "Add an update to this review"));
  const textarea = el("textarea");
  textarea.rows = 3;
  textarea.maxLength = 1000;
  textarea.required = true;
  textarea.placeholder = "What's changed since your review? For example, how it held up over time, or a reaction you had.";
  textarea.setAttribute("aria-label", "Review update");
  const footer = el("div", "comment-form-footer");
  const message = el("span", "auth-message");
  message.setAttribute("aria-live", "polite"); // read out by screen readers
  const buttons = el("div", "edit-buttons");
  const cancel = el("button", "action-btn", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", onCancel);
  const submit = el("button", "btn btn-solid", "Post update");
  submit.type = "submit";
  buttons.append(cancel, submit);
  footer.append(message, buttons);
  form.append(textarea, footer);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = textarea.value.trim();
    if (!body) return;
    submit.disabled = true;
    const { data } = await supabaseClient.auth.getSession();
    const { error } = await supabaseClient.from("review_updates")
      .insert({ review_id: r.id, user_id: data.session.user.id, body: body });
    if (error) {
      message.textContent = error.message;
      message.style.color = "#E07A5F";
      submit.disabled = false;
      return;
    }
    onSaved();
  });
  return form;
}

// Likes shown the same way as on the feed: a leaf and a number
function countsRow(likes, extra) {
  const row = el("p", "profile-counts");
  row.setAttribute("aria-label", plural(likes, "like") + (extra ? ", " + extra : ""));
  row.append(leafIcon(), el("span", null, String(likes)));
  if (extra) row.appendChild(el("span", "count-gap", extra));
  return row;
}

function buildPostCard(p, isMe, reload) {
  const article = el("article", "post");
  const parts = [];
  if (p.title) parts.push(el("h2", "post-title", p.title));
  parts.push(metaRow(p.created_at, p.edited_at));
  if (p.held_at) parts.push(heldNotice());
  if (p.body) parts.push(el("p", "post-body", p.body));
  // A poll: its options in one line (voting happens on Community)
  const poll = Array.isArray(p.polls) ? p.polls[0] : p.polls;
  if (poll && poll.poll_options) {
    const labels = poll.poll_options.slice().sort((a, b) => a.position - b.position).map((o) => o.label);
    const line = el("p", "profile-poll");
    line.append(el("strong", null, "Poll: "), document.createTextNode(labels.join(" \u00b7 ") + " "));
    const go = el("a", "inline-link", "Vote on Community");
    go.href = "feed.html";
    line.appendChild(go);
    parts.push(line);
  }
  const likes = p.likes ? p.likes.length : 0;
  const comments = p.comments && p.comments.length ? p.comments[0].count : 0;
  parts.push(countsRow(likes, plural(comments, "comment")));
  article.append(...parts);
  if (isMe) {
    article.appendChild(ownerActions(article, parts, "posts", p.id, poll ? "poll" : "post",
      poll ? null : (onSaved, onCancel) => EDIT_FORMS.post(p, onSaved, onCancel), reload));
  }
  return article;
}

function buildReviewCard(r, isMe, reload) {
  const article = el("article", "post");
  const titleEl = el("h2", "post-title", r.title);
  UI.reviewIcons(r).forEach((icon) => titleEl.append(" ", icon));
  article.appendChild(titleEl);

  const product = r.products ? r.products.brand + " — " + r.products.name : "Unknown product";
  const productText = r.variation ? product + " (" + r.variation + ")" : product;
  article.appendChild(el("p", "review-product", productText));

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
  // (one review has at most one standout: a single record, not a list)
  if (r.review_standouts && (!Array.isArray(r.review_standouts) || r.review_standouts.length)) {
    article.classList.add("is-standout");
    tags.appendChild(el("span", "review-tag standout", "\u2726 Standout review"));
  }
  if (r.holy_grail) {
    const tag = el("span", "review-tag holy-grail");
    tag.append(starIcon(), document.createTextNode("Holy grail"));
    tags.appendChild(tag);
  }
  if (r.would_repurchase !== null && r.would_repurchase !== undefined) {
    tags.appendChild(el("span", "review-tag", r.would_repurchase ? "Would repurchase" : "Wouldn't repurchase"));
  }
  if (tags.children.length) article.appendChild(tags);

  article.appendChild(metaRow(r.created_at, r.edited_at));
  if (r.held_at) article.appendChild(heldNotice());
  article.appendChild(el("p", "post-body", r.body));
  (r.review_updates || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .forEach((u) => article.appendChild(reviewUpdateBox(u, r, isMe, reload)));
  const likes = r.review_likes ? r.review_likes.length : 0;
  article.appendChild(countsRow(likes));
  if (isMe) {
    // Everything above the buttons hides while the edit form is open
    const parts = Array.from(article.children);
    const addUpdate = el("button", "action-btn", "Add update");
    addUpdate.type = "button";
    let actions = null;
    addUpdate.addEventListener("click", () => {
      const existing = article.querySelector(".update-form");
      if (existing) { existing.remove(); return; }
      const form = reviewUpdateForm(r, reload, () => form.remove());
      article.insertBefore(form, actions);
      form.querySelector("textarea").focus();
    });
    actions = ownerActions(article, parts, "reviews", r.id, "review",
      (onSaved, onCancel) => EDIT_FORMS.review(r, productText, onSaved, onCancel), reload, [addUpdate]);
    article.appendChild(actions);
  }
  return article;
}

// The order "how to earn" is listed in
const EARN_ORDER = ["review", "first_review", "review_update", "review_liked", "review_standout",
  "post_engaged", "comment_liked", "product_approved", "welcome", "mod_decision", "mod_edit"];

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

// "+10" pills: gold for community points, green for Byome points. Zeros are
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

// How many recent point changes show before "Show more activity"
const SHOWN_ACTIVITY = 3;

// Your own points: balances, how to earn more, and recent activity
async function showPoints(userId, isModerator) {
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
    statTile("biome", "Byome points", totals.biome, totals.pending_biome, leafIcon())
  );
  panel.appendChild(stats);
  // The explanation and the earning list fold away, to keep the card short
  const note = el("p", "points-note", "Byome points buy pots, plants and shelves in the ");
  const shopLink = el("a", "inline-link", "Byome Shop");
  shopLink.href = "byome-shop.html";
  note.append(shopLink, document.createTextNode(". Community points can't be spent on anything just yet, " +
    "but we have big plans for them, so keep collecting! Byome points are ready to spend straight away; " +
    "community points from some activities become available after a short waiting period."));

  // Moderator rewards are only listed for moderators
  const earnable = rules.filter((r) => (r.community_points || r.biome_points) &&
    (isModerator || r.action.indexOf("mod_") !== 0));
  {
    const earn = el("details", "points-earn");
    earn.appendChild(el("summary", null, "How points work"));
    earn.appendChild(note);
    const list = el("ul", "earn-list");
    earnable.forEach((r) => {
      const li = el("li", "earn-item");
      const main = el("div", "earn-main");
      main.appendChild(el("div", "earn-title", r.label));
      if (r.description) main.appendChild(el("div", "earn-desc", r.description));
      li.append(main, chips(r.community_points, r.biome_points));
      list.appendChild(li);
    });
    if (earnable.length) earn.appendChild(list);
    panel.appendChild(earn);
  }

  const rows = ledgerRes.data || [];
  if (rows.length) {
    panel.appendChild(el("h3", "points-subtitle", "Recent activity"));
    const list = el("ul", "points-log");
    rows.forEach((row, i) => {
      const li = el("li", "points-entry" + (row.revoked_at ? " is-revoked" : ""));
      li.hidden = i >= SHOWN_ACTIVITY; // the rest appear with "Show more"
      const main = el("div", "entry-main");
      main.appendChild(el("div", "entry-title", labels[row.action] || row.action));
      let meta = formatDate(row.created_at);
      if (row.revoked_at) meta += " · removed";
      // Only community points wait; Byome points are ready right away
      else if (row.community_points && new Date(row.available_at) > new Date()) {
        meta += " · community points available " + formatDate(row.available_at);
      }
      main.appendChild(el("div", "entry-meta", meta));
      li.append(main, chips(row.community_points, row.biome_points));
      list.appendChild(li);
    });
    panel.appendChild(list);
    if (rows.length > SHOWN_ACTIVITY) {
      const more = el("button", "link-btn", "Show more activity");
      more.type = "button";
      more.addEventListener("click", () => {
        list.querySelectorAll(".points-entry").forEach((li) => { li.hidden = false; });
        more.remove();
      });
      panel.appendChild(more);
    }
  }
  panel.hidden = false;
}

// ---------- Biome shelf ----------
// Everyone's profile shows their shelf. On your own profile, "Edit my shelf"
// lets you pick a pot (and plant) for each spot, and which shelf to use.
// All the rules (owning enough, right size) are checked by the database.
// The pots on a shelf, with their plants and visiting companions. The
// companion column comes from database/2026-10-23-referral-rewards.sql;
// until that's run, load without it.
async function loadSlots(profileId) {
  const res = await supabaseClient.from("biome_slots").select("slot, pot_key, plant_key, companion_key").eq("user_id", profileId);
  if (!res.error || !/companion/.test(res.error.message)) return res;
  return supabaseClient.from("biome_slots").select("slot, pot_key, plant_key").eq("user_id", profileId);
}

function slotsByNumber(rows) {
  const placed = {};
  (rows || []).forEach((row) => { placed[row.slot] = { pot: row.pot_key, plant: row.plant_key, companion: row.companion_key || null }; });
  return placed;
}

async function showBiome(profileId, isMe) {
  const section = document.getElementById("biome-section");
  const shelfEl = document.getElementById("biome-shelf");
  const hintEl = document.getElementById("biome-hint");
  const editorEl = document.getElementById("biome-editor");
  const arrangeBtn = document.getElementById("biome-arrange");
  const waitingEl = document.getElementById("biome-waiting");

  const [itemsRes, slotsRes, shelfRes, ownedRes, rewardsRes] = await Promise.all([
    supabaseClient.from("biome_items").select("key, kind, size, name, description, rarity, image, starter, sort_order, over_pot").order("sort_order"),
    loadSlots(profileId),
    // (the shelf decoration comes from database/2026-10-29-events-halloween.sql)
    supabaseClient.from("profiles").select("biome_shelf, shelf_overlay").eq("id", profileId).single()
      .then((res) => (res.error && /shelf_overlay/.test(res.error.message)
        ? supabaseClient.from("profiles").select("biome_shelf").eq("id", profileId).single() : res)),
    isMe ? supabaseClient.from("biome_inventory").select("item_key").eq("user_id", profileId).order("acquired_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabaseClient.from("achievements").select("name, reward_item").not("reward_item", "is", null),
  ]);
  if (itemsRes.error || slotsRes.error || shelfRes.error) return; // biome isn't set up in the database yet

  const items = {};
  itemsRes.data.forEach((it) => { items[it.key] = it; });
  // Items that come from an achievement say so in their info box
  (rewardsRes.data || []).forEach((a) => { if (items[a.reward_item]) items[a.reward_item].earnedWith = a.name; });
  const placed = slotsByNumber(slotsRes.data);
  let shelfKey = shelfRes.data.biome_shelf;
  let overlayKey = shelfRes.data.shelf_overlay || null;
  const owned = {};
  (ownedRes.data || []).forEach((row) => { owned[row.item_key] = (owned[row.item_key] || 0) + 1; });

  // profile.html?shelf=edit (from "Put it on my shelf") opens the editor
  let editing = isMe && new URLSearchParams(window.location.search).get("shelf") === "edit";
  // Opening "Edit my shelf" ticks "Find your shelf" on the starter checklist
  const markShelfStep = () => supabaseClient.rpc("mark_starter_step", { p_step: "shelf" }).then(() => {}, () => {});
  let selected = null;
  let message = "";

  // Things you own that aren't on your shelf yet, newest first: spare pots
  // and plants, companions not visiting a pot, and a shelf or decoration
  // you're not using. (Biomes are chosen on Edit profile instead.)
  function waiting() {
    const used = {};
    Object.values(placed).forEach((p) => [p.pot, p.plant, p.companion].forEach((k) => { if (k) used[k] = (used[k] || 0) + 1; }));
    const list = [];
    Object.keys(owned).forEach((key) => {
      const it = items[key];
      if (!it || it.starter || it.kind === "biome") return;
      const count = it.kind === "shelf" ? (key === shelfKey ? 0 : 1)
        : it.kind === "shelf_overlay" ? (key === overlayKey ? 0 : 1)
        : owned[key] - (used[key] || 0);
      if (count > 0) list.push({ item: it, count: count });
    });
    return list;
  }

  // "Hide" remembers exactly what was waiting, so anything new shows the tray again
  const hideKey = "byome-shelf-waiting-hidden";
  function hiddenList() { try { return localStorage.getItem(hideKey); } catch (e) { return null; } }
  function waitingId(list) { return list.map((w) => w.item.key + ":" + w.count).sort().join(","); }

  function renderWaiting() {
    const list = isMe && !editing ? waiting() : [];
    waitingEl.replaceChildren();
    waitingEl.hidden = !list.length || hiddenList() === waitingId(list);
    if (waitingEl.hidden) return;
    waitingEl.appendChild(el("p", "biome-waiting-title", "Waiting for your shelf"));
    const row = el("div", "biome-waiting-items");
    list.slice(0, 6).forEach((w) => {
      const thing = el("span", "biome-waiting-item");
      const i = document.createElement("img");
      i.src = BIOME.src(w.item.kind === "companion" ? w.item.image.replace(/\.png$/, "-icon.png") : w.item.image);
      i.alt = "";
      thing.append(i, el("span", null, w.item.name + (w.count > 1 ? " \u00d7" + w.count : "")));
      row.appendChild(thing);
    });
    if (list.length > 6) row.appendChild(el("span", "biome-waiting-more", "+" + (list.length - 6) + " more"));
    waitingEl.appendChild(row);
    const actions = el("div", "biome-waiting-actions");
    const go = el("button", "btn btn-solid", list.length === 1 ? "Put it on my shelf" : "Put them on my shelf");
    go.type = "button";
    go.addEventListener("click", () => { editing = true; markShelfStep(); selected = null; message = ""; render(); arrangeBtn.focus(); });
    const hide = el("button", "btn btn-ghost", "Hide");
    hide.type = "button";
    hide.addEventListener("click", () => { try { localStorage.setItem(hideKey, waitingId(list)); } catch (e) { /* fine */ } renderWaiting(); });
    actions.append(go, hide);
    waitingEl.appendChild(actions);
  }

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
    const { data } = await loadSlots(profileId);
    Object.keys(placed).forEach((n) => delete placed[n]);
    Object.assign(placed, slotsByNumber(data));
  }

  // A plant chosen for an empty spot goes in the default terra cotta pot
  // (the database picks it); the pot can be swapped afterwards.
  async function setSlot(slot, pot, plant) {
    if (await save("set_biome_slot", { p_slot: slot, p_pot: pot, p_plant: plant })) await reloadSlots();
    render();
  }

  async function setOverlay(key) {
    if (key === overlayKey) return;
    if (await save("set_shelf_overlay", { p_key: key })) overlayKey = key;
    render();
  }

  async function setCompanion(slot, key) {
    if ((placed[slot] || {}).companion === key) return;
    if (await save("set_biome_companion", { p_slot: slot, p_key: key })) await reloadSlots();
    render();
  }

  // A tile per item of this kind you could put here. fits(item) is true,
  // or the friendly reason it can't go here: those still show (faded, after
  // the ones that fit), and tapping one explains why.
  function itemTiles(kind, slot, current, fits, onPick) {
    const wrap = el("div", "biome-tiles");
    const choices = Object.values(items)
      .filter((it) => it.kind === kind)
      .filter((it) => it.key === current || spare(it.key, slot) > 0)
      .map((it) => ({ it: it, ok: it.key === current ? true : fits(it) }));
    choices.filter((c) => c.ok === true).concat(choices.filter((c) => c.ok !== true)).forEach(({ it, ok }) => {
      const left = spare(it.key, slot);
      const meta = it.key === current ? "In this spot" : it.starter ? "Free" : (left === Infinity ? "" : left + " spare");
      const t = tile(it.name, meta, it.image, it.key === current, () => {
        if (ok === true) onPick(it.key);
        else UI.celebrate({ heading: "Uh oh!", text: ok, item: it, notice: true });
      });
      if (it.size) t.appendChild(UI.sizeBadge(it.size));
      if (ok !== true) t.classList.add("is-misfit");
      wrap.appendChild(t);
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

    // Shelf decorations (like the cobwebs), once you have one
    const overlays = Object.values(items).filter((it) => it.kind === "shelf_overlay" && owned[it.key]);
    if (overlays.length) {
      editorEl.appendChild(el("h3", null, "Shelf decoration"));
      const decor = el("div", "biome-tiles");
      decor.appendChild(tile("None", null, null, !overlayKey, () => setOverlay(null)));
      overlays.forEach((it) => decor.appendChild(tile(it.name, null, it.image, it.key === overlayKey, () => setOverlay(it.key))));
      editorEl.appendChild(decor);
    }

    if (selected === null) {
      editorEl.appendChild(el("p", "feed-empty", "Tap a spot on the shelf to choose what goes there."));
    } else {
      const spotSize = BIOME.sizeOfSlot(selected);
      const here = placed[selected] || {};
      const pot = here.pot ? items[here.pot] : null;
      const plant = here.plant ? items[here.plant] : null;
      const word = (size) => UI.sizeName(size).toLowerCase();

      // Large things need the bottom shelf; a plant matches its pot's size
      const plantFits = (it) => {
        if (it.size === "medium" && spotSize === "small") {
          return "That's a large plant and needs extra space. Place it on the bottom shelf, where it has room to grow.";
        }
        if (pot && it.size !== pot.size) {
          return "That's a " + word(it.size) + " plant, and the pot here is " + word(pot.size) +
            ". Swap in a " + word(it.size) + " pot first, then add the plant.";
        }
        return true;
      };
      const potFits = (it) => {
        if (it.size === "medium" && spotSize === "small") {
          return "That's a large pot and needs extra space. Place it on the bottom shelf, where it has room to stretch out.";
        }
        if (plant && it.size !== plant.size) {
          return "The " + plant.name.toLowerCase() + " here is a " + word(plant.size) + " plant, so it needs a " +
            word(plant.size) + " pot. Pick a " + word(plant.size) + " pot, or choose \u201cNo plant\u201d first.";
        }
        return true;
      };

      // Plant first: plants come in a terra cotta pot, which can be swapped below
      editorEl.appendChild(el("h3", null, "Plant"));
      const plants = itemTiles("plant", selected, here.plant, plantFits, (key) => setSlot(selected, here.pot || null, key));
      if (plants.children.length === 0) {
        editorEl.appendChild(el("p", "feed-empty", "No spare plants. To move a plant here, empty its current spot first."));
      } else {
        if (here.pot) plants.prepend(tile("No plant", null, null, !here.plant, () => setSlot(selected, here.pot, null)));
        editorEl.appendChild(plants);
      }

      editorEl.appendChild(el("h3", null, "Pot"));
      const pots = itemTiles("pot", selected, here.pot, potFits, (key) => setSlot(selected, key, here.plant || null));
      pots.prepend(tile("Empty spot", null, null, !here.pot, () => setSlot(selected, null, null)));
      editorEl.appendChild(pots);

      // Companions visit a pot. Only shown once you have one. Some only
      // visit pots of one size (the ladybug: small pots).
      const owners = Object.values(items).filter((it) => it.kind === "companion" && owned[it.key]);
      const companions = owners.filter((it) => !it.size || (pot && it.size === pot.size));
      if (owners.length) {
        editorEl.appendChild(el("h3", null, "Companion"));
        if (!here.pot) {
          editorEl.appendChild(el("p", "feed-empty", "Put a pot here first, then a companion can visit it."));
        } else if (!companions.length) {
          editorEl.appendChild(el("p", "feed-empty", owners.map((it) => "The " + it.name.toLowerCase() + " only visits " + word(it.size) + " pots.").join(" ")));
        } else {
          const visitors = el("div", "biome-tiles");
          visitors.appendChild(tile("None", null, null, !here.companion, () => setCompanion(selected, null)));
          companions.forEach((it) => {
            const elsewhere = Object.keys(placed).find((n) => Number(n) !== selected && placed[n].companion === it.key);
            const meta = it.key === here.companion ? "In this spot" : (elsewhere !== undefined ? "Moves here" : "");
            visitors.appendChild(tile(it.name, meta, it.image.replace(/\.png$/, "-icon.png"), it.key === here.companion,
              () => setCompanion(selected, it.key)));
          });
          editorEl.appendChild(visitors);
        }
      }
    }

    if (message) {
      const m = el("p", "auth-message", message);
      m.setAttribute("aria-live", "polite"); // read out by screen readers
      m.style.color = "#E07A5F";
      editorEl.appendChild(m);
    }
    const more = el("p", "feed-empty");
    const link = el("a", "inline-link", "Byome Shop");
    link.href = "byome-shop.html";
    more.append(document.createTextNode("Want more? Visit the "), link, document.createTextNode("."));
    editorEl.appendChild(more);
  }

  function render() {
    shelfEl.replaceChildren(BIOME.build(items, shelfKey, placed, editing ? {
      editable: true,
      selected: selected,
      onSelect: (slot) => { selected = slot; message = ""; render(); },
      overlay: overlayKey,
    } : { overlay: overlayKey }));

    const empty = Object.keys(placed).length === 0;
    hintEl.hidden = editing || !empty;
    hintEl.textContent = isMe ? "Your shelf is empty. Tap Edit my shelf to add pots." : "Nothing on this shelf yet.";

    editorEl.hidden = !editing;
    if (editing) renderEditor();
    arrangeBtn.textContent = editing ? "Done" : "Edit my shelf";
    renderWaiting();
  }

  if (editing) markShelfStep();
  if (isMe) {
    arrangeBtn.hidden = false;
    arrangeBtn.addEventListener("click", () => {
      editing = !editing;
      if (editing) markShelfStep();
      selected = null;
      message = "";
      render();
    });
  }
  render();
  section.hidden = false;
  if (editing) section.scrollIntoView({ block: "start" });
}

// Skin and hair details, if the member chose to share them
function showTraits(profile) {
  const box = document.getElementById("profile-traits");
  const chips = [];
  if (profile.skin_type) chips.push(PROFILES.label(PROFILES.SKIN_TYPES, profile.skin_type) + " skin");
  (profile.skin_concerns || []).forEach((c) => chips.push(PROFILES.label(PROFILES.SKIN_CONCERNS, c)));
  if (profile.hair_type || profile.hair_texture) {
    const parts = [];
    if (profile.hair_texture) parts.push(PROFILES.label(PROFILES.HAIR_TEXTURES, profile.hair_texture).toLowerCase());
    if (profile.hair_type) parts.push(PROFILES.label(PROFILES.HAIR_TYPES, profile.hair_type).toLowerCase());
    chips.push(parts.join(", ") + " hair");
  }
  box.replaceChildren(...chips.map((text) => el("span", "review-tag", text.charAt(0).toUpperCase() + text.slice(1))));
  box.hidden = chips.length === 0;
}

// Beta testers get a badge on their profile, for good (only here, not by
// their name on posts and reviews): the beta badge picture, once
// biome-assets/badge-beta-tester.png exists, and the words.
// (database/2026-12-08-beta-event.sql)
async function showBetaBadge(profile) {
  const { data, error } = await supabaseClient.rpc("beta_badge", { p_user: profile.id });
  if (error || !data) return;
  const badge = el("span", "beta-badge");
  badge.title = "Helped test Byome in Beta Testing: Sugar and Spice";
  const icon = document.createElement("img");
  icon.src = "biome-assets/badge-beta-tester.png";
  icon.alt = "";
  icon.addEventListener("error", () => icon.remove());
  badge.append(icon, "Beta tester");
  const row = el("p", "beta-badge-row");
  row.appendChild(badge);
  document.querySelector(".profile-meta").before(row);
}

// Achievements earned, shown on every profile under the shelf
// Achievements: a chip each. Hovering, tapping or tabbing to one opens an
// info box (like the shelf's) saying how it was earned, when, and its
// reward. Event achievements carry their event's badge.
async function showAchievements(profileId) {
  const box = document.getElementById("achievements");
  const load = (columns) => supabaseClient.from("user_achievements").select(columns)
    .eq("user_id", profileId).order("earned_at", { ascending: true });
  // (events come from database/2026-10-29-events-halloween.sql)
  let { data, error } = await load("earned_at, achievement:achievements!achievement_key(name, description, sort_order, " +
    "reward:biome_items!reward_item(name, rarity), event:events!event_key(name, starts_at, badge_image))");
  if (error) ({ data, error } = await load("earned_at, achievement:achievements!achievement_key(name, description, sort_order, reward:biome_items!reward_item(name, rarity))"));
  // (achievements you can't see, like another tester's beta ones, come back empty)
  if (!error) data = data.filter((row) => row.achievement);
  if (error || !data.length) return;

  box.innerHTML = "";
  box.classList.add("has-achievement-tips");
  box.appendChild(el("h3", "points-subtitle", "Achievements"));
  const list = el("ul", "achievement-list");
  const tip = el("div", "biome-tip achievement-tip");
  tip.id = "achievement-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  let current = null;

  function badgeFor(event, className) {
    const img = document.createElement("img");
    img.className = className;
    img.src = event.badge_image;
    img.alt = "";
    return img;
  }

  function show(chip) {
    const row = chip._row;
    const a = row.achievement;
    const parts = [];
    const head = el("div", "biome-tip-head");
    head.appendChild(el("strong", null, a.name));
    parts.push(head);
    if (a.event) {
      const ev = el("p", "achievement-tip-event");
      if (a.event.badge_image) {
        const b = badgeFor(a.event, "achievement-tip-badge");
        b.addEventListener("error", () => b.remove());
        ev.appendChild(b);
      }
      ev.appendChild(document.createTextNode(a.event.name + " " + new Date(a.event.starts_at).getFullYear() + " event"));
      parts.push(ev);
    }
    if (a.description) parts.push(el("p", "biome-tip-text", a.description));
    parts.push(el("p", "achievement-tip-date", "Earned " + formatDate(row.earned_at)));
    if (a.reward) parts.push(el("p", "biome-tip-earned", "Reward: " + a.reward.name));
    tip.replaceChildren(...parts);
    tip.hidden = false;
    if (current && current !== chip) current.removeAttribute("aria-describedby");
    current = chip;
    chip.setAttribute("aria-describedby", tip.id);

    // above the chip, kept inside the box (below it if there's no room)
    const area = box.getBoundingClientRect(), r = chip.getBoundingClientRect();
    let left = r.left - area.left + r.width / 2 - tip.offsetWidth / 2;
    left = Math.max(0, Math.min(left, area.width - tip.offsetWidth));
    let top = r.top - area.top - tip.offsetHeight - 6;
    if (area.top + top < 4) top = r.bottom - area.top + 6;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function hide() {
    if (current) current.removeAttribute("aria-describedby");
    current = null;
    tip.hidden = true;
  }

  data.forEach((row) => {
    if (!row.achievement) return;
    const li = el("li");
    const chip = el("button", "achievement" + (row.achievement.event ? " is-event" : ""));
    chip.type = "button";
    chip._row = row;
    if (row.achievement.event && row.achievement.event.badge_image) {
      const badge = badgeFor(row.achievement.event, "achievement-badge");
      // until the badge art is in, event achievements keep the star
      badge.addEventListener("error", () => badge.replaceWith(starIcon()));
      chip.appendChild(badge);
    } else {
      chip.appendChild(starIcon());
    }
    chip.appendChild(el("span", "achievement-name", row.achievement.name));
    li.appendChild(chip);
    list.appendChild(li);
  });

  let lastPointer = "mouse";
  let pressing = false; // a tap also focuses the chip; let the tap decide
  list.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; pressing = true; });
  list.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const chip = e.target.closest(".achievement");
    if (chip && chip !== current) show(chip);
  });
  list.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
  list.addEventListener("click", (e) => {
    pressing = false;
    const chip = e.target.closest(".achievement");
    if (!chip) return;
    if (lastPointer === "mouse" && chip === current) return;
    if (chip === current && lastPointer !== "mouse") hide(); else show(chip);
  });
  list.addEventListener("focusin", (e) => {
    if (pressing) return;
    const chip = e.target.closest(".achievement");
    if (chip) show(chip);
  });
  list.addEventListener("focusout", (e) => { if (!list.contains(e.relatedTarget)) hide(); });
  list.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  document.addEventListener("click", (e) => { if (current && !list.contains(e.target)) hide(); });

  box.append(list, tip);
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

  const columns = "id, username, created_at, avatar_path, avatar_ring, skin_type, skin_concerns, hair_type, hair_texture, is_moderator, badge, profile_biome, show_biome_symbol, level";
  const find = (cols) => {
    const q = supabaseClient.from("profiles").select(cols);
    return (wanted ? q.eq("username", wanted) : q.eq("id", me)).maybeSingle();
  };
  // (bios come from database/2026-11-16-starter-checklist.sql)
  let { data: profile, error: profileError } = await find(columns + ", bio");
  if (profileError) ({ data: profile } = await find(columns));

  if (!profile) {
    UI.setBiome("forest");
    nameEl.textContent = "Profile not found";
    showMessage(reviewsEl, "We couldn't find that member.");
    showMessage(postsEl, "");
    return;
  }

  const isMe = profile.id === me;
  const name = PROFILES.displayName(profile);
  document.title = name + " — Byome";
  nameEl.textContent = name;
  // The profile is set in the member's chosen biome
  const deleted = PROFILES.isDeleted(profile);
  UI.setBiome(deleted ? "forest" : profile.profile_biome || "forest");
  const symbol = deleted ? null : UI.biomeSymbol(profile);
  if (symbol) nameEl.appendChild(symbol);
  const badge = deleted ? null : UI.memberBadge(profile);
  if (badge) nameEl.appendChild(badge);
  document.getElementById("profile-avatar").replaceChildren(PROFILES.avatar(profile, "large"));
  showTraits(profile);
  const bioEl = document.getElementById("profile-bio");
  if (profile.bio && !deleted) {
    bioEl.textContent = profile.bio;
    bioEl.hidden = false;
  }

  // Your own profile: Edit profile. Someone else's: Report profile.
  const actionsEl = document.getElementById("profile-head-actions");
  if (isMe) {
    const editLink = el("a", "btn btn-ghost", "Edit profile");
    editLink.href = "edit-profile.html";
    const inviteLink = el("a", "btn btn-ghost", "Invite friends");
    inviteLink.href = "invite.html";
    actionsEl.append(editLink, inviteLink);
  } else if (!PROFILES.isDeleted(profile)) {
    await REPORTS.loadMine(me);
    actionsEl.appendChild(REPORTS.button("profile", profile.id));
    setUpBlocking(profile, actionsEl);
  }

  if (PROFILES.isDeleted(profile)) {
    document.getElementById("profile-since").textContent = "This member deleted their account.";
    loadContent(profile, false);
    return;
  }
  if (profile.created_at) {
    document.getElementById("profile-since").textContent =
      "Member since " + new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  showBetaBadge(profile);

  showHelpful(profile, isMe);
  showLevel(profile, isMe, me);
  if (isMe) showPoints(profile.id, profile.is_moderator);
  showBiome(profile.id, isMe);
  showAchievements(profile.id);

  loadContent(profile, isMe);
  if (isMe) showReturned(profile, isMe);
})();

// ---------- Returned to you ----------
// When a moderator removes a post or review, its author keeps a private
// copy here. Revising and resubmitting posts it again, held for a
// moderator before anyone else sees it; "Delete" removes the copy for good.
async function showReturned(profile, isMe) {
  const box = document.getElementById("returned");
  const { data: items, error } = await supabaseClient.from("returned_content")
    .select("id, kind, title, body, product_id, removed_at, reason, reason_note").order("removed_at", { ascending: false });
  if (error || !items || !items.length) { box.hidden = true; return; }

  // Product names for returned reviews
  const productIds = items.map((i) => i.product_id).filter(Boolean);
  const names = {};
  if (productIds.length) {
    const { data: products } = await supabaseClient.from("products").select("id, brand, name").in("id", productIds);
    (products || []).forEach((p) => { names[p.id] = p.brand + " — " + p.name; });
  }

  box.replaceChildren();
  box.appendChild(el("h2", "section-title", "Returned to you"));
  box.appendChild(el("p", "returned-intro",
    "Only you can see these, and each one says why it came back. " +
    "You can revise a removed post or review and resubmit it (a moderator will look it over before it goes up), or delete it."));
  items.forEach((item) => box.appendChild(returnedCard(item, names, profile, isMe)));
  box.hidden = false;
}

function returnedCard(item, names, profile, isMe) {
  const card = el("article", "returned-card");
  const what = item.kind === "review"
    ? "Your review of " + (names[item.product_id] || "a product")
    : "Your post";
  // A review that came with a product suggestion, returned by the database
  // rather than removed by a moderator
  const productReturn = item.reason === "product_not_approved" || item.reason === "already_reviewed";
  const head = el("p", "returned-what");
  head.append(document.createTextNode(what + (productReturn ? " \u00b7 returned " : " \u00b7 removed ")), UI.timeTag(item.removed_at));
  card.appendChild(head);
  // Why it was removed, and the moderator's note
  const reasonLabel = item.reason ? UI.removalReasonLabel(item.reason) : null;
  if (reasonLabel || item.reason_note) {
    const why = el("div", "returned-why");
    if (reasonLabel) {
      const line = el("p");
      line.append(el("strong", null, "Why: "), document.createTextNode(reasonLabel));
      why.appendChild(line);
    }
    if (item.reason_note) {
      const line = el("p");
      line.append(el("strong", null, "Moderator's note: "), document.createTextNode(item.reason_note));
      why.appendChild(line);
    }
    card.appendChild(why);
  }
  if (item.title) card.appendChild(el("h3", "post-title", item.title));
  card.appendChild(el("p", "post-body", item.body));
  const message = el("p", "auth-message");
  message.setAttribute("aria-live", "polite");

  const actions = el("div", "post-actions");
  const revise = el("button", "btn btn-solid", "Revise and resubmit");
  revise.type = "button";
  const letGo = el("button", "btn btn-ghost", "Delete");
  letGo.type = "button";
  if (productReturn) {
    // Nothing to resubmit: the words are kept here to reuse
    card.appendChild(el("p", "field-hint", item.reason === "already_reviewed"
      ? "Your words are kept here, so you can add them as an update to the review you already wrote."
      : "Your words are kept here, so you can reuse them if the product is added later."));
    if (item.reason === "already_reviewed" && item.product_id) {
      const go = el("a", "btn btn-solid", "Go to your review");
      go.href = "reviews.html?product=" + encodeURIComponent(item.product_id);
      actions.append(go);
    }
    actions.append(letGo);
  } else {
    actions.append(revise, letGo);
  }
  card.append(actions, message);

  letGo.addEventListener("click", async () => {
    if (!confirm("Delete this for good? You won't be able to get it back.")) return;
    const { error } = await supabaseClient.from("returned_content").delete().eq("id", item.id);
    if (error) { message.textContent = error.message; message.style.color = "#E07A5F"; return; }
    card.remove();
    showReturned(profile, isMe);
  });

  revise.addEventListener("click", () => {
    const form = el("form", "returned-form");
    const titleLabel = el("label", "field-label", "Heading");
    const title = el("input", "composer-title");
    title.value = item.title || "";
    title.maxLength = 100;
    title.required = item.kind === "review";
    title.id = "returned-title-" + item.id;
    titleLabel.htmlFor = title.id;
    const bodyLabel = el("label", "field-label", item.kind === "review" ? "Your review" : "Your post");
    const body = el("textarea");
    body.value = item.body;
    body.rows = 5;
    body.required = true;
    body.maxLength = item.kind === "review" || item.kind === "post" ? 2000 : 1000;
    if (item.kind === "review") body.dataset.min = "20";
    else if (item.kind === "post") body.dataset.min = "10";
    body.id = "returned-body-" + item.id;
    bodyLabel.htmlFor = body.id;
    const save = el("button", "btn btn-solid", "Resubmit for review");
    save.type = "submit";
    const cancel = el("button", "btn btn-ghost", "Cancel");
    cancel.type = "button";
    const buttons = el("div", "post-actions");
    buttons.append(save, cancel);
    form.append(titleLabel, title, bodyLabel, body, buttons);
    actions.replaceWith(form);
    body.focus();

    cancel.addEventListener("click", () => form.replaceWith(actions));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      save.disabled = true;
      const { error } = await supabaseClient.rpc("resubmit_returned",
        { p_id: item.id, p_title: title.value, p_body: body.value });
      if (error) {
        message.textContent = error.message;
        message.style.color = "#E07A5F";
        save.disabled = false;
        return;
      }
      card.replaceChildren(el("p", "returned-done",
        "Thanks for revising it! It's back with the moderators, and you'll get a notification once it's approved."));
      loadContent(profile, isMe); // it shows below as "waiting for a moderator"
    });
  });
  return card;
}

// The member's reviews and posts. Reloaded after you edit or delete one.
async function loadContent(profile, isMe) {
  const reviewsEl = document.getElementById("profile-reviews");
  const postsEl = document.getElementById("profile-posts");
  const reload = () => loadContent(profile, isMe);

  // (the event columns come from database/2026-10-29-events-halloween.sql)
  const reviewQuery = (extra) => supabaseClient.from("reviews")
    .select("id, rating, title, body, variation, would_repurchase, holy_grail, " + extra + "created_at, edited_at, held_at, products!product_id(name, brand), review_likes(user_id), review_standouts(review_id), review_updates(id, body, created_at, held_at)", { count: "exact" })
    .eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30);
  const [reviewsRes, postsRes] = await Promise.all([
    reviewQuery("no_longer_using, seasonal, ").then((res) => (res.error ? reviewQuery("") : res)),
    supabaseClient.from("posts")
      .select("id, title, body, created_at, edited_at, held_at, likes(user_id), comments(count), polls(poll_options(label, position))", { count: "exact" })
      .eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30),
  ]);

  document.getElementById("profile-stats").textContent =
    plural(reviewsRes.count || 0, "review") + " \u00b7 " + plural(postsRes.count || 0, "post");

  reviewsEl.innerHTML = "";
  if (reviewsRes.error) showMessage(reviewsEl, "Couldn't load reviews: " + reviewsRes.error.message);
  else if (!reviewsRes.data.length) {
    reviewsEl.appendChild(isMe
      ? UI.emptyState({ image: "biome-assets/plant-daisies.png",
          text: "No reviews yet. Your first one earns the First Bloom Daisies for your shelf.",
          linkText: "Write a review", href: "reviews.html" })
      : el("p", "feed-empty", "No reviews yet."));
  }
  else reviewsRes.data.forEach((r) => reviewsEl.appendChild(buildReviewCard(r, isMe, reload)));

  postsEl.innerHTML = "";
  if (postsRes.error) showMessage(postsEl, "Couldn't load posts: " + postsRes.error.message);
  else if (!postsRes.data.length) {
    postsEl.appendChild(isMe
      ? UI.emptyState({ image: "biome-assets/plant-welcome-sprout.png",
          text: "No posts yet. Say hello! Introductions is a great place to start.",
          linkText: "Go to the community", href: "feed.html" })
      : el("p", "feed-empty", "No posts yet."));
  }
  else postsRes.data.forEach((p) => postsEl.appendChild(buildPostCard(p, isMe, reload)));
}

// ---------- Blocking ----------
// On someone else's profile: Block (with an optional note to the
// moderators), or, once blocked, a note saying so and Unblock. Blocked
// members' posts, comments and reviews are hidden by the database
// (database/2026-11-17-blocks-modmail.sql), both ways.
async function setUpBlocking(profile, actionsEl) {
  const { data: rows, error } = await supabaseClient.from("user_blocks").select("blocked_id").eq("blocked_id", profile.id);
  if (error) return; // blocking isn't set up yet
  const blocked = rows.length > 0;
  const name = PROFILES.displayName(profile);

  if (blocked) {
    const note = el("div", "block-note");
    note.setAttribute("role", "status");
    note.appendChild(el("p", null, "You've blocked " + name + ". You won't see each other's posts, comments or reviews, they can't comment on yours, and you won't get notifications from them."));
    const unblock = el("button", "btn btn-ghost", "Unblock");
    unblock.type = "button";
    unblock.addEventListener("click", async () => {
      unblock.disabled = true;
      const { error: err } = await supabaseClient.rpc("unblock_member", { p_user: profile.id });
      if (err) { unblock.disabled = false; alert("Couldn't unblock: " + err.message); return; }
      window.location.reload();
    });
    note.appendChild(unblock);
    document.getElementById("profile-traits").before(note);
    return;
  }

  const btn = el("button", "btn btn-ghost", "Block");
  btn.type = "button";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.addEventListener("click", () => openBlockDialog(profile, name));
  actionsEl.appendChild(btn);
}

function openBlockDialog(profile, name) {
  const dialog = el("dialog", "celebrate block-dialog");
  dialog.setAttribute("aria-labelledby", "block-heading");
  const h = el("h2", null, "Block " + name + "?");
  h.id = "block-heading";
  dialog.append(h, el("p", "celebrate-text",
    "You won't see each other's posts, comments or reviews, they won't be able to comment on yours, and you won't get notifications from them. They aren't told. You can unblock them any time from their profile."));

  const label = el("label", "field-label", "Want to tell the moderators why? (optional)");
  const note = el("textarea", "text-input");
  note.id = "block-note";
  note.rows = 3;
  note.maxLength = 2000;
  note.placeholder = "Only the moderators see this. If someone is bothering you, a few words help us look into it.";
  label.htmlFor = note.id;
  dialog.append(label, note);

  const message = el("p", "auth-message");
  message.setAttribute("aria-live", "polite");
  const actions = el("div", "celebrate-actions");
  const go = el("button", "btn btn-solid", "Block");
  go.type = "button";
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => dialog.close());
  go.addEventListener("click", async () => {
    go.disabled = true;
    const { error } = await supabaseClient.rpc("block_member", { p_user: profile.id, p_note: note.value.trim() || null });
    if (error) { go.disabled = false; message.textContent = "Couldn't block: " + error.message; message.style.color = "#E07A5F"; return; }
    window.location.reload();
  });
  actions.append(go, cancel);
  dialog.append(message, actions);
  dialog.addEventListener("close", () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}

// ---------- "54 people found AliceB's reviews helpful" ----------
// Different people, not votes: one person marking many reviews counts once
// (database/2026-11-21-helpful-stats.sql; until it's run, nothing shows)
// ---------- Levels ----------
// Everyone's profile shows their level; your own also shows what's next
// ("Only you can see this"); moderators can lower someone else's level.
async function showLevel(profile, isMe, me) {
  if (!profile.level) return;
  const meta = document.querySelector(".profile-meta");
  const pill = UI.levelBadge(profile.level, true);
  pill.classList.add("profile-level");
  meta.parentNode.insertBefore(pill, meta);

  if (isMe) {
    const { data } = await supabaseClient.rpc("my_level");
    if (data) {
      const card = nextLevelCard(data);
      if (card) document.getElementById("profile-helpful").after(card);
    }
    showMyRestrictions(profile);
    return;
  }
  // Moderators: lower someone's level (their next level-up then waits for a moderator)
  const { data: viewer } = await supabaseClient.from("profiles").select("is_moderator").eq("id", me).maybeSingle();
  if (!viewer || !viewer.is_moderator) return;
  if (profile.level > 1) {
    const change = el("button", "link-btn level-change", "Change level");
    change.type = "button";
    pill.after(change);
    change.addEventListener("click", () => {
      if (document.querySelector(".level-demote-form")) return;
      change.after(demoteForm(profile, () => window.location.reload()));
    });
  }
  if (!profile.is_moderator) showModRestrictions(profile);
}

// ---------- Restrictions (database/2026-11-30-restrictions.sql) ----------
const RESTRICTION_KINDS = [
  ["posting", "Posting in the Community"],
  ["commenting", "Commenting"],
  ["reviewing", "Writing reviews"],
  ["suggesting", "Suggesting products"],
];

function untilText(x) {
  return x.ends_at
    ? "until " + new Date(x.ends_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })
    : "until further notice";
}

// Your own profile: what's paused, and why (only you can see this)
async function showMyRestrictions(profile) {
  const { data, error } = await supabaseClient.rpc("active_restrictions", { p_user: profile.id });
  if (error || !data || !data.length) return;
  const box = el("section", "restriction-notice");
  box.appendChild(el("h2", "restriction-title", "Paused on your account"));
  const ul = el("ul");
  data.forEach((x) => {
    const li = el("li");
    li.append(el("strong", null, x.label.charAt(0).toUpperCase() + x.label.slice(1)), document.createTextNode(", " + untilText(x) + ". Reason: " + x.reason));
    ul.appendChild(li);
  });
  box.appendChild(ul);
  const p = el("p", "field-hint");
  const a = el("a", "inline-link", "message the moderators");
  a.href = "modmail.html?new=message";
  p.append(document.createTextNode("Everything you've already shared stays up, and only you can see this. Questions? You can "), a, document.createTextNode("."));
  box.appendChild(p);
  document.getElementById("profile-helpful").after(box);
}

// Moderators on someone else's profile: what's paused, Lift, and Restrict
async function showModRestrictions(profile) {
  const wrap = el("div", "mod-restrictions");
  const meta = document.querySelector(".profile-meta");
  meta.parentNode.insertBefore(wrap, meta);

  async function paint() {
    wrap.replaceChildren();
    const { data } = await supabaseClient.rpc("active_restrictions", { p_user: profile.id });
    (data || []).forEach((x) => {
      const row = el("p", "mod-restriction-row");
      row.append(el("strong", null, "Paused: "), document.createTextNode(x.label + ", " + untilText(x) + " (" + x.reason + ") "));
      const lift = el("button", "link-btn", "Lift");
      lift.type = "button";
      lift.addEventListener("click", async () => {
        if (!confirm("Lift this restriction now? " + profile.username + " will be told.")) return;
        lift.disabled = true;
        const { error } = await supabaseClient.rpc("lift_restriction", { p_id: x.id });
        if (error) { alert(error.message); lift.disabled = false; return; }
        paint();
      });
      row.appendChild(lift);
      wrap.appendChild(row);
    });
    const open = el("button", "link-btn", "Restrict");
    open.type = "button";
    open.addEventListener("click", () => {
      if (wrap.querySelector(".restrict-form")) return;
      wrap.appendChild(restrictForm(profile, paint, () => wrap.querySelector(".restrict-form").remove()));
    });
    wrap.appendChild(open);
  }
  paint();
}

function restrictForm(profile, onDone, onCancel) {
  const form = el("form", "edit-form restrict-form");
  form.appendChild(el("p", "field-label", "Pause for " + profile.username + ":"));
  const boxes = RESTRICTION_KINDS.map(([key, text]) => {
    const label = el("label", "check-row");
    const box = el("input");
    box.type = "checkbox";
    box.value = key;
    label.append(box, document.createTextNode(" " + text));
    form.appendChild(label);
    return box;
  });
  form.appendChild(el("p", "field-label", "For how long?"));
  const lengths = el("div", "category-chips quick-picks");
  let days = 7;
  [[7, "7 days"], [30, "30 days"], [null, "Permanently"]].forEach(([d, text]) => {
    const b = el("button", "category-chip", text);
    b.type = "button";
    b.setAttribute("aria-pressed", String(d === days));
    b.addEventListener("click", () => {
      days = d;
      lengths.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    });
    lengths.appendChild(b);
  });
  form.appendChild(lengths);
  const reasonLabel = el("label", "field-label", "Why? (they'll see this)");
  const reason = el("textarea");
  reason.id = "restrict-reason";
  reasonLabel.htmlFor = reason.id;
  reason.rows = 2;
  reason.maxLength = 300;
  reason.required = true;
  form.append(reasonLabel, reason,
    el("p", "field-hint", "Everything they've already shared stays up; this only stops new content. They can't level up while it's active, and their next level-up then waits for a moderator. It's logged, and any moderator can lift it."));
  const buttons = el("div", "edit-buttons");
  const save = el("button", "btn btn-solid", "Restrict");
  save.type = "submit";
  const cancel = el("button", "action-btn", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", onCancel);
  buttons.append(save, cancel);
  const message = el("p", "auth-message");
  message.setAttribute("aria-live", "polite");
  form.append(buttons, message);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const kinds = boxes.filter((b) => b.checked).map((b) => b.value);
    if (!kinds.length) { message.textContent = "Choose at least one thing to pause."; message.style.color = "#E07A5F"; return; }
    save.disabled = true;
    const { error } = await supabaseClient.rpc("restrict_member",
      { p_user: profile.id, p_kinds: kinds, p_days: days, p_reason: reason.value.trim() });
    if (error) { message.textContent = error.message; message.style.color = "#E07A5F"; save.disabled = false; return; }
    onDone();
  });
  return form;
}

function nextLevelCard(data) {
  const s = data.stats;
  const next = data.level + 1;
  if (next > 5) return null;  // Evergreen: the top
  const card = el("section", "next-level");
  const head = el("div", "next-level-head");
  head.append(el("span", "next-level-label", "Next level"), UI.levelBadge(next, true));
  card.append(head, el("p", "next-level-private", "Only you can see this."));

  function bar(have, need, label) {
    const row = el("div", "next-level-bar");
    const top = el("p", "next-level-bar-label");
    top.append(document.createTextNode(label + " "), el("strong", null, Math.min(have, need) + " of " + need));
    const track = el("div", "next-level-track");
    const fill = el("div", "next-level-fill");
    fill.style.width = Math.min(100, Math.round(100 * have / need)) + "%";
    track.appendChild(fill);
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(need));
    track.setAttribute("aria-valuenow", String(Math.min(have, need)));
    track.setAttribute("aria-label", label);
    row.append(top, track);
    return row;
  }
  function check(done, text) {
    const li = el("li", done ? "is-done" : "");
    li.append(el("span", "next-level-tick", done ? "\u2713" : "\u25CB"), document.createTextNode(" " + text));
    return li;
  }

  if (data.restricted) {
    card.appendChild(el("p", "next-level-note", "Levelling up is paused while part of your account is paused. Afterwards, a moderator will look at your next level-up."));
  } else if (data.approval_waiting) {
    card.appendChild(el("p", "next-level-note", "Your next level-up is waiting for a moderator to look at it. You'll get a notification when they do."));
  } else if (next === 2) {
    const ul = el("ul", "next-level-checks");
    ul.append(check(s.reviews >= 1, "Write your first review"),
      check(s.days >= 3, s.days >= 3 ? "Be a member for 3 days" : "Be a member for 3 days (" + (3 - s.days) + " to go)"));
    card.appendChild(ul);
  } else if (next === 3) {
    card.appendChild(bar(s.contributions, 25, "Contributions"));
    card.appendChild(el("p", "next-level-breakdown",
      s.reviews + (s.reviews === 1 ? " review" : " reviews") + " \u00b7 " +
      s.posts + (s.posts === 1 ? " post others enjoyed" : " posts others enjoyed") + " \u00b7 " +
      s.products + (s.products === 1 ? " approved product suggestion" : " approved product suggestions")));
    card.appendChild(el("p", "next-level-note", "Posts count once someone else likes, comments or votes on them."));
  } else if (next === 4) {
    if (data.bloom_waiting) {
      card.appendChild(el("p", "next-level-note", "Your reviews are being looked at by our team \u{1F338} You'll get a notification as soon as you bloom!"));
    } else {
      card.appendChild(bar(s.reviews, 100, "Published reviews"));
      card.appendChild(el("p", "next-level-note", "At 100, our moderators take a look through your reviews, and then you bloom."));
    }
  } else {
    const ul = el("ul", "next-level-checks");
    const months = Math.min(6, Math.floor(s.days / 30.4));
    ul.append(
      check(s.standouts >= 5, "5 standout reviews (" + Math.min(s.standouts, 5) + " so far)"),
      check(s.helpful >= 50, s.helpful >= 50 ? s.helpful + " people found your reviews helpful (goal: 50)" : "50 people find your reviews helpful (" + s.helpful + " so far)"),
      check(s.six_months, s.six_months ? "A member for 6 months" : "A member for 6 months (" + months + " so far)"));
    card.appendChild(ul);
  }
  return card;
}

function demoteForm(profile, onDone) {
  const form = el("form", "edit-form level-demote-form");
  const label = el("label", "field-label", "Move " + profile.username + " down to");
  const select = el("select");
  select.id = "demote-level";
  label.htmlFor = select.id;
  for (let n = profile.level - 1; n >= 1; n--) select.appendChild(new Option(UI.levelInfo(n).name + " (level " + n + ")", String(n)));
  const reasonLabel = el("label", "field-label", "Why? (they'll see this)");
  const reason = el("textarea");
  reason.id = "demote-reason";
  reasonLabel.htmlFor = reason.id;
  reason.rows = 2;
  reason.maxLength = 300;
  reason.required = true;
  const hint = el("p", "field-hint", "Their next level-up will then wait for a moderator to approve it. It's logged.");
  const buttons = el("div", "edit-buttons");
  const save = el("button", "btn btn-solid", "Change level");
  save.type = "submit";
  const cancel = el("button", "action-btn", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => form.remove());
  buttons.append(save, cancel);
  const message = el("p", "auth-message");
  message.setAttribute("aria-live", "polite");
  form.append(label, select, reasonLabel, reason, hint, buttons, message);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    save.disabled = true;
    const { error } = await supabaseClient.rpc("demote_member",
      { p_user: profile.id, p_level: Number(select.value), p_reason: reason.value.trim() });
    if (error) { message.textContent = error.message; message.style.color = "#E07A5F"; save.disabled = false; return; }
    onDone();
  });
  return form;
}

async function showHelpful(profile, isMe) {
  const { data, error } = await supabaseClient.rpc("member_helpful_stats", { p_user: profile.id });
  if (error || !data || !data.people) return;
  const line = document.getElementById("profile-helpful");
  const people = data.people === 1 ? "1 person" : data.people.toLocaleString() + " people";
  line.replaceChildren(leafIcon(), document.createTextNode(" " + people + " found " +
    (isMe ? "your" : PROFILES.displayName(profile) + "\u2019s") + " reviews helpful"));
  line.title = data.votes + (data.votes === 1 ? " helpful mark" : " helpful marks") + " in total";
  line.hidden = false;
}
