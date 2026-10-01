const queueEl = document.getElementById("queue");

// Small helper: create an element with a class and text in one line.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
    return;
  }

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

  if (product.photo_url) {
    const p = el("p", null);
    const a = document.createElement("a");
    a.href = product.photo_url;
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
