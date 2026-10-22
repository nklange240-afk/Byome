const queueEl = document.getElementById("queue");
const heldEl = document.getElementById("held-queue");
const reportsEl = document.getElementById("reports-queue");

// Small helper: create an element with a class and text in one line.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Only allow normal web addresses for product photos. Anything else
// (like a "javascript:" link) could run code when a moderator clicks it.
function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch (e) {
    return null;
  }
}

async function init() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
    return;
  }

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("username, is_moderator")
    .eq("id", data.session.user.id)
    .single();

  // The database already protects this page's data (non-moderators can't
  // see or change other people's suggestions), but we also check here so
  // non-moderators see a clear message instead of an empty page.
  if (!profile || !profile.is_moderator) {
    queueEl.innerHTML = "";
    queueEl.appendChild(el("p", "feed-empty", "This page is for moderators only."));
    document.querySelector("main").replaceChildren(
      el("h1", null, "Moderation"),
      el("p", "feed-empty", "This page is for moderators only.")
    );
    return;
  }

  UI.startModSession(data.session.user.id);
  loadHeld();
  loadReports();
  loadQueue();
  loadLog();
  // Refresh the log after any action on this page (they all reload a queue)
  document.querySelector("main").addEventListener("click", (e) => {
    if (e.target.closest("button") && !e.target.closest("#mod-log")) setTimeout(loadLog, 1500);
  });
}

// ---------- Moderation log ----------

const LOG_PAGE = 50;
let logShown = 0;

const LOG_WORDS = {
  approve: "approved", remove: "removed", keep: "kept (after a report)", reject: "rejected",
  edit: "edited", remove_avatar: "removed the profile picture of", reset_username: "reset the username of",
  remove_bio: "removed the bio of",
  standout: "marked as standout",
};
const LOG_TYPES = {
  post: "post", comment: "comment", review: "review", review_update: "review update",
  product: "product suggestion", profile: "profile",
};

async function loadLog(more) {
  const box = document.getElementById("mod-log");
  const from = more ? logShown : 0;
  const { data, error } = await supabaseClient.from("moderation_log")
    .select("id, created_at, action, target_type, outcome, note, " +
      "moderator:profiles!moderator_id(username), owner:profiles!target_owner(username)")
    .order("created_at", { ascending: false })
    .range(from, from + LOG_PAGE - 1);

  if (!more) box.replaceChildren();
  box.querySelectorAll(".load-more").forEach((b) => b.remove());
  if (error) { box.appendChild(el("p", "feed-empty", "Couldn't load the log: " + error.message)); return; }
  if (!data.length && !more) { box.appendChild(el("p", "feed-empty", "Nothing yet. Actions will appear here as moderators work.")); return; }

  data.forEach((row) => {
    const item = el("div", "log-row" + (row.outcome ? " is-" + row.outcome : ""));
    const mark = el("span", "log-mark", row.outcome === "positive" ? "\u2713" : row.outcome === "negative" ? "\u2715" : "\u2022");
    mark.setAttribute("aria-hidden", "true");
    const text = el("p", "log-text");
    text.appendChild(el("strong", null, row.moderator ? row.moderator.username : "A former moderator"));
    const verb = LOG_WORDS[row.action] || row.action;
    const kind = LOG_TYPES[row.target_type] || row.target_type;
    let sentence = " " + verb + " ";
    if (row.target_type === "profile" && ["remove_avatar", "reset_username", "remove_bio"].indexOf(row.action) !== -1) {
      sentence += row.note ? row.note : "a member";
    } else {
      sentence += (row.owner ? row.owner.username + "\u2019s " : "a ") + kind;
      if (row.note) sentence += ": \u201c" + row.note + "\u201d";
    }
    text.appendChild(document.createTextNode(sentence));
    const when = el("time", "log-time", new Date(row.created_at).toLocaleString(undefined,
      { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
    when.dateTime = row.created_at;
    item.append(mark, text, when);
    box.appendChild(item);
  });
  logShown = from + data.length;
  if (data.length === LOG_PAGE) {
    const btn = el("button", "btn btn-ghost load-more", "Show older");
    btn.type = "button";
    btn.addEventListener("click", () => loadLog(true));
    box.appendChild(btn);
  }
}

async function loadQueue() {
  const [{ data: products, error }, { data: everything }] = await Promise.all([
    supabaseClient
      .from("products")
      .select("id, name, brand, category, subcategory, photo_url, variations, created_at, profiles!suggested_by(username)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    // Every live or waiting product, to spot repeat suggestions
    supabaseClient.from("products").select("id, name, brand, status, created_at").neq("status", "rejected"),
  ]);

  queueEl.innerHTML = "";

  if (error) {
    queueEl.appendChild(el("p", "feed-empty", "Couldn't load the queue: " + error.message));
    return;
  }

  if (products.length === 0) {
    queueEl.appendChild(el("p", "feed-empty", "No pending suggestions right now."));
    return;
  }

  // Only flag against live products, or suggestions made BEFORE this one,
  // so the first of two repeat suggestions isn't the one marked duplicate
  products.forEach((p) => {
    const earlier = (everything || []).filter((o) => o.status === "approved" || new Date(o.created_at) < new Date(p.created_at));
    queueEl.appendChild(buildQueueItem(p, PRODUCT_MATCH.similar(p, earlier)));
  });
}

// matches: products that look like this one (see product-match.js)
function buildQueueItem(product, matches) {
  const article = el("article", "post");

  // Read-only view of the suggestion
  const view = el("div");
  view.appendChild(el("h2", "post-title", product.name));

  const meta = el("div", "post-meta");
  meta.appendChild(el("span", "post-author", product.brand));
  view.appendChild(meta);

  // Where it would be listed, e.g. "Makeup › Lipstick"
  const where = [product.category, product.subcategory].filter(Boolean).join(" \u203a ");
  if (where) {
    const tagRow = el("p", "mod-category-row");
    tagRow.appendChild(el("span", "post-category-tag", where));
    view.appendChild(tagRow);
  }

  const photo = product.photo_url ? safeUrl(product.photo_url) : null;
  if (photo) {
    const p = el("p", null);
    const a = document.createElement("a");
    a.href = photo;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "View submitted photo";
    p.appendChild(a);
    view.appendChild(p);
  }

  if (product.variations && product.variations.length > 0) {
    view.appendChild(el("p", "post-body", "Variations: " + product.variations.join(", ")));
    // Variations earn points when approved (up to 10 per product): the
    // member's for theirs, the moderator's for ones they add.
    // Sizes aren't variations (and never earn points): point them out.
    const sizes = product.variations.filter(PRODUCT_MATCH.looksLikeSize);
    if (sizes.length) {
      view.appendChild(el("p", "field-hint field-warning", (sizes.length === 1 ? "This looks like a size: " : "These look like sizes: ") +
        sizes.join(", ") + ". Sizes aren't variations, so please edit " + (sizes.length === 1 ? "it" : "them") + " out before approving."));
    }
    view.appendChild(el("p", "field-hint", "The variations the member entered earn them points when you approve (fixing a typo keeps their credit). Any real ones you add earn you points instead. Edit out any that aren't real first."));
  } else {
    // (database/2026-11-18-mod-variation-credit.sql)
    view.appendChild(el("p", "field-hint", "No variations entered. If it comes in shades, scents or finishes, add them with Edit: you'll earn points for each one you add."));
  }

  const suggestedBy = product.profiles ? product.profiles.username : "Unknown";
  view.appendChild(el("p", "feed-empty", "Suggested by " + suggestedBy));

  article.appendChild(view);

  const actions = el("div", "post-actions");

  const approveBtn = el("button", "action-btn mod-btn is-good", "Approve");
  approveBtn.type = "button";
  approveBtn.addEventListener("click", async () => {
    await supabaseClient.from("products").update({ status: "approved" }).eq("id", product.id);
    loadQueue();
  });

  const editBtn = el("button", "action-btn mod-btn", "Edit");
  editBtn.type = "button";
  editBtn.addEventListener("click", () => {
    if (article.querySelector(".edit-form")) return;
    view.hidden = true;
    actions.hidden = true;
    const form = buildEditForm(product, loadQueue, () => {
      form.remove();
      view.hidden = false;
      actions.hidden = false;
    });
    article.appendChild(form);
    form.querySelector("input").focus();
  });

  const rejectBtn = el("button", "action-btn mod-btn is-bad", "Reject");
  rejectBtn.type = "button";
  function openRejectForm(presetReason) {
    if (article.querySelector(".edit-form")) return;
    view.hidden = true;
    actions.hidden = true;
    const form = buildRejectForm(product, loadQueue, () => {
      form.remove();
      view.hidden = false;
      actions.hidden = false;
    }, presetReason);
    article.appendChild(form);
    form.querySelector("textarea").focus();
  }
  rejectBtn.addEventListener("click", () => openRejectForm());

  actions.append(approveBtn, editBtn, rejectBtn);

  // Possible repeat: show what it looks like, plus a one-click duplicate rejection
  if (matches && matches.length) {
    const box = el("div", "similar-box");
    box.appendChild(el("p", "similar-title", "Possible duplicate of:"));
    const list = el("ul");
    matches.slice(0, 3).forEach(({ product: p }) => {
      const where = p.status === "approved" ? "already listed" : "also waiting here, suggested " + new Date(p.created_at).toLocaleDateString();
      list.appendChild(el("li", null, p.brand + " \u2014 " + p.name + " (" + where + ")"));
    });
    box.appendChild(list);
    view.appendChild(box);

    const best = matches[0].product;
    const dupBtn = el("button", "action-btn mod-btn is-bad", "Reject as duplicate");
    dupBtn.type = "button";
    dupBtn.addEventListener("click", () => openRejectForm(
      best.status === "approved"
        ? "Thanks! This product is already listed as \u201c" + best.brand + " \u2014 " + best.name + "\u201d, so you can review it there."
        : "Thanks! Someone suggested this product just before you, so it's already on its way."));
    actions.appendChild(dupBtn);
  }
  article.appendChild(actions);

  return article;
}

// Rejecting needs a reason. It's included in the notification the
// person who suggested the product receives.
function buildRejectForm(product, onSaved, onCancel, presetReason) {
  const form = el("form", "edit-form");

  const label = el("label", "field-label", "Why is this being rejected? (shown to the person who suggested it)");
  const textarea = el("textarea");
  textarea.id = "reject-reason-" + product.id;
  label.htmlFor = textarea.id;
  textarea.rows = 3;
  textarea.maxLength = 500;
  textarea.required = true;
  textarea.placeholder = "e.g. This product is already listed under a different name.";
  if (presetReason) textarea.value = presetReason;

  // Quick picks that fill in the reason (it can still be edited)
  const picks = el("div", "reason-choices quick-picks");
  [
    ["Already listed", "Thanks! This product is already listed, so you can review it there."],
    ["Not a beauty product", "Thanks for the suggestion! Byome is just for beauty and personal care products, so this one isn't a fit."],
    ["Not enough detail", "Thanks! We couldn't tell exactly which product this is. Please suggest it again with the full name and brand."],
    ["Spelling or name", "Thanks! The name or brand didn't quite match the real product. Please suggest it again as it appears on the packaging."],
  ].forEach(([text, reason]) => {
    const b = el("button", "category-chip", text);
    b.type = "button";
    b.addEventListener("click", () => { textarea.value = reason; textarea.focus(); });
    picks.appendChild(b);
  });

  const message = el("p", "auth-message");
  message.setAttribute("aria-live", "polite"); // read out by screen readers
  const buttons = el("div", "edit-buttons");
  const confirmBtn = el("button", "btn btn-solid", "Reject suggestion");
  confirmBtn.type = "submit";
  const cancel = el("button", "action-btn", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", onCancel);
  buttons.append(confirmBtn, cancel);
  form.append(label, picks, textarea, buttons, message);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reason = textarea.value.trim();
    if (!reason) return;

    confirmBtn.disabled = true;
    const { data, error } = await supabaseClient
      .from("products")
      .update({ status: "rejected", rejection_reason: reason })
      .eq("id", product.id)
      .select("id");

    if (error || !data || data.length === 0) {
      message.textContent = error ? error.message : "Couldn't reject. Are you a moderator?";
      message.style.color = "#E07A5F";
      confirmBtn.disabled = false;
      return;
    }
    onSaved();
  });

  return form;
}

// Fix typos and formatting before approving. Saving keeps the
// suggestion pending, so you can look it over and then approve it.
function buildEditForm(product, onSaved, onCancel) {
  const form = el("form", "edit-form stacked-form");

  function field(labelText, id, value, attrs) {
    const label = el("label", null, labelText);
    label.htmlFor = id;
    const input = el("input");
    input.id = id;
    input.value = value || "";
    Object.assign(input, attrs || {});
    form.append(label, input);
    return input;
  }

  const nameInput = field("Product name", "edit-name-" + product.id, product.name, { type: "text", required: true });
  const brandInput = field("Brand", "edit-brand-" + product.id, product.brand, { type: "text", required: true });
  const photoInput = field("Photo URL (optional)", "edit-photo-" + product.id, product.photo_url, { type: "url" });
  const variationsInput = field(
    "Variations (optional, separate with commas)",
    "edit-variations-" + product.id,
    (product.variations || []).join(", "),
    { type: "text" }
  );

  const message = el("p", "auth-message");
  message.setAttribute("aria-live", "polite"); // read out by screen readers
  const buttons = el("div", "edit-buttons");
  const cancel = el("button", "action-btn", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", onCancel);
  const save = el("button", "btn btn-solid", "Save changes");
  save.type = "submit";
  buttons.append(save, cancel);
  form.append(buttons, message);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const variations = variationsInput.value
      .split(",").map((v) => v.trim()).filter((v) => v.length > 0);

    save.disabled = true;
    const { data, error } = await supabaseClient
      .from("products")
      .update({
        name: nameInput.value.trim(),
        brand: brandInput.value.trim(),
        photo_url: photoInput.value.trim() || null,
        variations: variations,
      })
      .eq("id", product.id)
      .select("id");

    if (error || !data || data.length === 0) {
      message.textContent = error ? error.message : "Couldn't save. Are you a moderator?";
      message.style.color = "#E07A5F";
      save.disabled = false;
      return;
    }
    onSaved();
  });

  return form;
}

init();

// ---------- Held by automod ----------

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function loadHeld() {
  const held = (q) => q.not("held_at", "is", null).order("held_at", { ascending: true });
  const [posts, comments, reviews, updates] = await Promise.all([
    held(supabaseClient.from("posts").select("id, title, body, held_at, profiles!user_id(username), polls(poll_options(label, position))")),
    held(supabaseClient.from("comments").select("id, body, held_at, profiles!user_id(username), posts!post_id(title)")),
    held(supabaseClient.from("reviews").select("id, title, body, held_at, profiles!user_id(username), products!product_id(brand, name)")),
    held(supabaseClient.from("review_updates").select("id, body, held_at, profiles!user_id(username), reviews!review_id(title)")),
  ]);

  heldEl.innerHTML = "";
  const failed = [posts, comments, reviews, updates].find((res) => res.error);
  if (failed) {
    heldEl.appendChild(el("p", "feed-empty", "Couldn't load held items: " + failed.error.message));
    return;
  }

  // One list, oldest first, whatever kind of thing it is
  const items = [].concat(
    posts.data.map((p) => ({ kind: "post", label: pollOptions(p) ? "Poll" : "Post", id: p.id, title: p.title, body: p.body,
      held_at: p.held_at, author: p.profiles, options: pollOptions(p) })),
    comments.data.map((c) => ({ kind: "comment", label: "Comment", id: c.id, body: c.body, held_at: c.held_at, author: c.profiles,
      context: c.posts ? "On the post \u201c" + c.posts.title + "\u201d" : null })),
    reviews.data.map((r) => ({ kind: "review", label: "Review", id: r.id, title: r.title, body: r.body, held_at: r.held_at, author: r.profiles,
      context: r.products ? "Review of " + r.products.brand + " \u2014 " + r.products.name : null })),
    updates.data.map((u) => ({ kind: "review_update", label: "Review update", id: u.id, body: u.body, held_at: u.held_at, author: u.profiles,
      context: u.reviews ? "Update to the review \u201c" + u.reviews.title + "\u201d" : null }))
  ).sort((a, b) => new Date(a.held_at) - new Date(b.held_at));

  if (items.length === 0) {
    heldEl.appendChild(el("p", "feed-empty", "Nothing held right now."));
    return;
  }
  items.forEach((item) => heldEl.appendChild(buildHeldItem(item)));
}

// Removing something: the moderator picks a reason (and can add a short
// note). Both are shown to the member, with their private copy.
// onConfirm(reason, note) should return an error message, or nothing.
function reasonPicker(what, onConfirm, onCancel) {
  const form = el("form", "reason-form");
  const legend = el("p", "field-label", "Why is this " + what + " being removed? The member will see this.");
  form.appendChild(legend);
  const choices = el("div", "reason-choices");
  choices.setAttribute("role", "radiogroup");
  const name = "reason-" + Math.random().toString(36).slice(2);
  UI.REMOVAL_REASONS.forEach(([key, label]) => {
    const option = el("label", "choice reason-choice");
    const input = el("input");
    input.type = "radio";
    input.name = name;
    input.value = key;
    input.required = true;
    option.append(input, el("span", null, label));
    choices.appendChild(option);
  });
  form.appendChild(choices);
  const noteLabel = el("label", "field-label", "A short note (optional)");
  const note = el("textarea", "reason-note");
  note.id = name + "-note";
  noteLabel.htmlFor = note.id;
  note.rows = 2;
  note.maxLength = 200;
  note.placeholder = "e.g. Please keep it to your experience with the product.";
  const message = el("p", "auth-message");
  message.setAttribute("aria-live", "polite"); // read out by screen readers
  const buttons = el("div", "post-actions");
  const go = el("button", "action-btn mod-btn is-bad", "Remove");
  go.type = "submit";
  const cancel = el("button", "action-btn mod-btn", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", onCancel);
  buttons.append(go, cancel);
  form.append(noteLabel, note, buttons, message);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const picked = form.querySelector("input:checked");
    if (!picked) return;
    go.disabled = true;
    const problem = await onConfirm(picked.value, note.value.trim());
    if (problem) {
      message.textContent = problem;
      message.style.color = "#E07A5F";
      go.disabled = false;
    }
  });
  return form;
}

// A poll's options (in order), or null for an ordinary post
function pollOptions(post) {
  const poll = post && (Array.isArray(post.polls) ? post.polls[0] : post.polls);
  if (!poll || !poll.poll_options) return null;
  return poll.poll_options.slice().sort((a, b) => a.position - b.position).map((o) => o.label);
}

// The options of a poll, as a list moderators can read
function pollList(options) {
  const list = el("ol", "mod-poll-options");
  list.setAttribute("aria-label", "Poll options");
  options.forEach((o) => list.appendChild(el("li", null, o)));
  return list;
}

function buildHeldItem(item) {
  const article = el("article", "post");
  const meta = el("div", "post-meta");
  meta.append(
    el("span", "review-tag", item.label),
    el("span", "post-author", item.author ? item.author.username : "Unknown"),
    el("span", null, "held " + formatDate(item.held_at))
  );
  article.appendChild(meta);
  if (item.context) article.appendChild(el("p", "feed-empty", item.context));
  if (item.title) article.appendChild(el("h3", "post-title", item.title));
  if (item.body) article.appendChild(el("p", "post-body", item.body));
  if (item.options) article.appendChild(pollList(item.options));

  const actions = el("div", "post-actions");
  const message = el("span", "auth-message");
  message.setAttribute("aria-live", "polite"); // read out by screen readers

  function decide(action, button, reason, note) {
    return async () => {
      if (action === "remove" && !reason) {
        // Ask why first
        actions.hidden = true;
        const picker = reasonPicker(item.label.toLowerCase(), async (r, n) => {
          const { error } = await supabaseClient.rpc("moderate_content",
            { p_kind: item.kind, p_id: item.id, p_action: "remove", p_reason: r, p_note: n || null });
          if (error) return "Couldn't remove: " + error.message;
          loadHeld();
        }, () => { picker.remove(); actions.hidden = false; });
        article.appendChild(picker);
        return;
      }
      actions.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      const { error } = await supabaseClient.rpc("moderate_content", { p_kind: item.kind, p_id: item.id, p_action: action });
      if (error) {
        message.textContent = "Couldn't " + action + ": " + error.message;
        message.style.color = "#E07A5F";
        actions.querySelectorAll("button").forEach((b) => { b.disabled = false; });
        return;
      }
      loadHeld();
    };
  }

  const approve = el("button", "action-btn mod-btn is-good", "Approve");
  approve.type = "button";
  approve.addEventListener("click", decide("approve", approve));
  const remove = el("button", "action-btn mod-btn is-bad", "Remove");
  remove.type = "button";
  remove.addEventListener("click", decide("remove", remove));
  actions.append(approve, remove, message);
  article.appendChild(actions);
  return article;
}

// ---------- Reported by members ----------

const REASON_LABELS = {
  spam: "Spam or advertising", harassment: "Harassment or bullying", hate: "Hate speech or slurs",
  inappropriate: "Inappropriate or explicit", misleading: "Misleading or false", other: "Something else",
};

async function loadReports() {
  const load = (profileColumns) => supabaseClient
    .from("content_reports")
    .select("id, kind, reason, details, created_at, reporter:profiles!reporter_id(username), " +
      "post:posts!post_id(id, title, body, author:profiles!user_id(username), polls(poll_options(label, position))), " +
      "comment:comments!comment_id(id, body, author:profiles!user_id(username), post:posts!post_id(title)), " +
      "review:reviews!review_id(id, title, body, author:profiles!user_id(username), product:products!product_id(brand, name)), " +
      "profile:profiles!profile_id(" + profileColumns + ")")
    .is("resolved_at", null)
    .order("created_at", { ascending: true });
  const profileColumns = "id, username, avatar_path, avatar_ring, profile_biome, show_biome_symbol, is_moderator, badge";
  // (bios come from database/2026-11-16-starter-checklist.sql)
  let { data, error } = await load(profileColumns + ", bio");
  if (error) ({ data, error } = await load(profileColumns));

  reportsEl.innerHTML = "";
  if (error) {
    reportsEl.appendChild(el("p", "feed-empty", "Couldn't load reports: " + error.message));
    return;
  }

  // Several people can report the same thing: show it once, with every report
  const groups = new Map();
  data.forEach((r) => {
    const content = r[r.kind];
    if (!content) return;
    const key = r.kind + ":" + content.id;
    if (!groups.has(key)) groups.set(key, { kind: r.kind, content: content, reports: [] });
    groups.get(key).reports.push(r);
  });

  if (groups.size === 0) {
    reportsEl.appendChild(el("p", "feed-empty", "No open reports."));
    return;
  }
  // Most-reported first
  Array.from(groups.values())
    .sort((a, b) => b.reports.length - a.reports.length)
    .forEach((g) => reportsEl.appendChild(buildReportedItem(g)));
}

function buildReportedItem(group) {
  const c = group.content;
  const label = { post: "Post", comment: "Comment", review: "Review", profile: "Profile" }[group.kind];
  const article = el("article", "post");
  const isProfile = group.kind === "profile";

  const meta = el("div", "post-meta");
  meta.append(
    el("span", "review-tag", label),
    isProfile ? PROFILES.authorLink(c) : el("span", "post-author", c.author ? c.author.username : "Unknown"),
    el("span", null, group.reports.length === 1 ? "1 report" : group.reports.length + " reports")
  );
  article.appendChild(meta);
  // A reported profile: show the picture big enough to judge
  if (isProfile) article.appendChild(PROFILES.avatar(c, "xl"));
  if (isProfile && c.bio) {
    const bio = el("p", "post-body profile-bio");
    bio.append(el("strong", null, "Bio: "), document.createTextNode(c.bio));
    article.appendChild(bio);
  }

  if (group.kind === "comment" && c.post) article.appendChild(el("p", "feed-empty", "On the post \u201c" + c.post.title + "\u201d"));
  if (group.kind === "review" && c.product) article.appendChild(el("p", "feed-empty", "Review of " + c.product.brand + " \u2014 " + c.product.name));
  if (c.title) article.appendChild(el("h3", "post-title", c.title));
  if (c.body) article.appendChild(el("p", "post-body", c.body));
  if (group.kind === "post" && pollOptions(c)) article.appendChild(pollList(pollOptions(c)));

  const list = el("ul", "report-list");
  group.reports.forEach((r) => {
    const li = el("li");
    li.appendChild(el("strong", null, REASON_LABELS[r.reason] || r.reason));
    li.appendChild(document.createTextNode(" \u00b7 " + (r.reporter ? r.reporter.username : "Unknown") + ", " + formatDate(r.created_at)));
    if (r.details) li.appendChild(el("p", "report-details", r.details));
    list.appendChild(li);
  });
  article.appendChild(list);

  const actions = el("div", "post-actions");
  const message = el("span", "auth-message");
  message.setAttribute("aria-live", "polite"); // read out by screen readers
  async function decide(action) {
    if (action === "remove") {
      // Ask why first
      actions.hidden = true;
      const picker = reasonPicker(group.kind, async (r, n) => {
        const { error } = await supabaseClient.rpc("resolve_reports",
          { p_kind: group.kind, p_id: c.id, p_action: "remove", p_reason: r, p_note: n || null });
        if (error) return "Couldn't remove: " + error.message;
        loadReports();
      }, () => { picker.remove(); actions.hidden = false; });
      article.appendChild(picker);
      return;
    }
    actions.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    const { error } = await supabaseClient.rpc("resolve_reports", { p_kind: group.kind, p_id: c.id, p_action: action });
    if (error) {
      message.textContent = "Couldn't " + action + ": " + error.message;
      message.style.color = "#E07A5F";
      actions.querySelectorAll("button").forEach((b) => { b.disabled = false; });
      return;
    }
    loadReports();
  }
  const keep = el("button", "action-btn mod-btn is-good", "Keep it");
  keep.type = "button";
  keep.addEventListener("click", () => decide("keep"));
  actions.appendChild(keep);

  if (isProfile) {
    // Profiles aren't removed: the picture or bio can be taken down, or
    // the username reset (the member is told to choose a new one)
    async function fixProfile(action, question) {
      if (!confirm(question)) return;
      actions.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      const { error } = await supabaseClient.rpc("moderate_profile", { p_id: c.id, p_action: action });
      if (error) {
        message.textContent = "Couldn't do that: " + error.message;
        message.style.color = "#E07A5F";
        actions.querySelectorAll("button").forEach((b) => { b.disabled = false; });
        return;
      }
      if (action === "remove_avatar" && c.avatar_path) supabaseClient.storage.from("avatars").remove([c.avatar_path]);
      loadReports();
    }
    if (c.avatar_path) {
      const pic = el("button", "action-btn mod-btn is-bad", "Remove picture");
      pic.type = "button";
      pic.addEventListener("click", () => fixProfile("remove_avatar", "Remove " + c.username + "'s profile picture? They'll be told why."));
      actions.appendChild(pic);
    }
    if (c.bio) {
      const bioBtn = el("button", "action-btn mod-btn is-bad", "Remove bio");
      bioBtn.type = "button";
      bioBtn.addEventListener("click", () => fixProfile("remove_bio", "Remove " + c.username + "'s bio? They'll be told why."));
      actions.appendChild(bioBtn);
    }
    const rename = el("button", "action-btn mod-btn is-bad", "Reset username");
    rename.type = "button";
    rename.addEventListener("click", () => fixProfile("reset_username", "Reset the username \u201c" + c.username + "\u201d? They'll be asked to choose a new one."));
    actions.appendChild(rename);
  } else {
    const remove = el("button", "action-btn mod-btn is-bad", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => decide("remove"));
    actions.appendChild(remove);
  }
  actions.appendChild(message);
  article.appendChild(actions);
  return article;
}

// ---------- Mod mail waiting ----------
// (database/2026-11-17-blocks-modmail.sql; without it, the line is hidden)
(async function () {
  const line = document.getElementById("mod-mail-line");
  const { data, error } = await supabaseClient.rpc("modmail_waiting");
  if (error) { line.hidden = true; return; }
  document.getElementById("mod-mail-waiting").textContent = data
    ? data + (data === 1 ? " conversation is" : " conversations are") + " waiting for a reply."
    : "Nothing waiting in mod mail.";
})();

// New moderators see the guide open the first time
(function () {
  const guide = document.getElementById("mod-guide");
  try {
    if (!localStorage.getItem("byome-mod-guide-seen")) { guide.open = true; localStorage.setItem("byome-mod-guide-seen", "1"); }
  } catch (e) { /* fine either way */ }
})();
