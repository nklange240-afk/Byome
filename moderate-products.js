const queueEl = document.getElementById("queue");
const heldEl = document.getElementById("held-queue");

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
  loadQueue();
}

async function loadQueue() {
  const { data: products, error } = await supabaseClient
    .from("products")
    .select("id, name, brand, photo_url, variations, created_at, profiles!suggested_by(username)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  queueEl.innerHTML = "";

  if (error) {
    queueEl.appendChild(el("p", "feed-empty", "Couldn't load the queue: " + error.message));
    return;
  }

  if (products.length === 0) {
    queueEl.appendChild(el("p", "feed-empty", "No pending suggestions right now."));
    return;
  }

  products.forEach((p) => queueEl.appendChild(buildQueueItem(p)));
}

function buildQueueItem(product) {
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
  rejectBtn.addEventListener("click", () => {
    if (article.querySelector(".edit-form")) return;
    view.hidden = true;
    actions.hidden = true;
    const form = buildRejectForm(product, loadQueue, () => {
      form.remove();
      view.hidden = false;
      actions.hidden = false;
    });
    article.appendChild(form);
    form.querySelector("textarea").focus();
  });

  actions.append(approveBtn, editBtn, rejectBtn);
  article.appendChild(actions);

  return article;
}

// Rejecting needs a reason. It's included in the notification the
// person who suggested the product receives.
function buildRejectForm(product, onSaved, onCancel) {
  const form = el("form", "edit-form");

  const label = el("label", "field-label", "Why is this being rejected? (shown to the person who suggested it)");
  const textarea = el("textarea");
  textarea.id = "reject-reason-" + product.id;
  label.htmlFor = textarea.id;
  textarea.rows = 3;
  textarea.maxLength = 500;
  textarea.required = true;
  textarea.placeholder = "e.g. This product is already listed under a different name.";

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
