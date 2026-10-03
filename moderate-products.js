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

  loadHeld();
  loadReports();
  loadQueue();
}

async function loadQueue() {
  const [{ data: products, error }, { data: everything }] = await Promise.all([
    supabaseClient
      .from("products")
      .select("id, name, brand, photo_url, variations, created_at, profiles!suggested_by(username)")
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
  }

  const suggestedBy = product.profiles ? product.profiles.username : "Unknown";
  view.appendChild(el("p", "feed-empty", "Suggested by " + suggestedBy));

  article.appendChild(view);

  const actions = el("div", "post-actions");

  const approveBtn = el("button", "action-btn", "Approve");
  approveBtn.type = "button";
  approveBtn.addEventListener("click", async () => {
    await supabaseClient.from("products").update({ status: "approved" }).eq("id", product.id);
    loadQueue();
  });

  const editBtn = el("button", "action-btn", "Edit");
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

  const rejectBtn = el("button", "action-btn", "Reject");
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
    const dupBtn = el("button", "action-btn", "Reject as duplicate");
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

  const message = el("p", "auth-message");
  const buttons = el("div", "edit-buttons");
  const confirmBtn = el("button", "btn btn-solid", "Reject suggestion");
  confirmBtn.type = "submit";
  const cancel = el("button", "action-btn", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", onCancel);
  buttons.append(confirmBtn, cancel);
  form.append(label, textarea, buttons, message);

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
    held(supabaseClient.from("posts").select("id, title, body, held_at, profiles!user_id(username)")),
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
    posts.data.map((p) => ({ kind: "post", label: "Post", id: p.id, title: p.title, body: p.body, held_at: p.held_at, author: p.profiles })),
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
  article.appendChild(el("p", "post-body", item.body));

  const actions = el("div", "post-actions");
  const message = el("span", "auth-message");

  function decide(action, button) {
    return async () => {
      if (action === "remove" && !confirm("Remove this " + item.label.toLowerCase() + " for good? The author will be told it broke the guidelines.")) return;
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

  const approve = el("button", "action-btn", "Approve");
  approve.type = "button";
  approve.addEventListener("click", decide("approve", approve));
  const remove = el("button", "action-btn", "Remove");
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
  const { data, error } = await supabaseClient
    .from("content_reports")
    .select("id, kind, reason, details, created_at, reporter:profiles!reporter_id(username), " +
      "post:posts!post_id(id, title, body, author:profiles!user_id(username)), " +
      "comment:comments!comment_id(id, body, author:profiles!user_id(username), post:posts!post_id(title)), " +
      "review:reviews!review_id(id, title, body, author:profiles!user_id(username), product:products!product_id(brand, name)), " +
      "profile:profiles!profile_id(id, username, avatar_path, avatar_ring)")
    .is("resolved_at", null)
    .order("created_at", { ascending: true });

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

  if (group.kind === "comment" && c.post) article.appendChild(el("p", "feed-empty", "On the post \u201c" + c.post.title + "\u201d"));
  if (group.kind === "review" && c.product) article.appendChild(el("p", "feed-empty", "Review of " + c.product.brand + " \u2014 " + c.product.name));
  if (c.title) article.appendChild(el("h3", "post-title", c.title));
  if (c.body) article.appendChild(el("p", "post-body", c.body));

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
  async function decide(action) {
    if (action === "remove" && !confirm("Remove this " + group.kind + " for good? The author will be told it broke the guidelines.")) return;
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
  const keep = el("button", "action-btn", "Keep it");
  keep.type = "button";
  keep.addEventListener("click", () => decide("keep"));
  actions.appendChild(keep);

  if (isProfile) {
    // Profiles aren't removed: the picture can be taken down, or the
    // username reset (the member is told to choose a new one)
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
      const pic = el("button", "action-btn", "Remove picture");
      pic.type = "button";
      pic.addEventListener("click", () => fixProfile("remove_avatar", "Remove " + c.username + "'s profile picture? They'll be told why."));
      actions.appendChild(pic);
    }
    const rename = el("button", "action-btn", "Reset username");
    rename.type = "button";
    rename.addEventListener("click", () => fixProfile("reset_username", "Reset the username \u201c" + c.username + "\u201d? They'll be asked to choose a new one."));
    actions.appendChild(rename);
  } else {
    const remove = el("button", "action-btn", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => decide("remove"));
    actions.appendChild(remove);
  }
  actions.appendChild(message);
  article.appendChild(actions);
  return article;
}
