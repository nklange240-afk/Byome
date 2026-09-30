const queueEl = document.getElementById("queue");
const usernameEl = document.getElementById("header-username");
const logoutBtn = document.getElementById("logout-btn");

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

  usernameEl.textContent = profile ? profile.username : "";

  // This page's data is already protected by RLS (a non-moderator's
  // query simply won't return anyone else's pending suggestions), but
  // we also check here so non-moderators see a clear message instead
  // of an empty, confusing page.
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

  article.appendChild(el("h2", "post-title", product.name));

  const meta = el("div", "post-meta");
  meta.appendChild(el("span", "post-author", product.brand));
  article.appendChild(meta);

  if (product.photo_url) {
    const p = el("p", null);
    const a = document.createElement("a");
    a.href = product.photo_url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "View submitted photo";
    p.appendChild(a);
    article.appendChild(p);
  }

  if (product.variations && product.variations.length > 0) {
    article.appendChild(el("p", "post-body", "Variations: " + product.variations.join(", ")));
  }

  const suggestedBy = product.profiles ? product.profiles.username : "Unknown";
  article.appendChild(el("p", "feed-empty", "Suggested by " + suggestedBy));

  const actions = el("div", "post-actions");

  const approveBtn = el("button", "action-btn", "Approve");
  approveBtn.type = "button";
  approveBtn.addEventListener("click", async () => {
    await supabaseClient.from("products").update({ status: "approved" }).eq("id", product.id);
    loadQueue();
  });

  const rejectBtn = el("button", "action-btn", "Reject");
  rejectBtn.type = "button";
  rejectBtn.addEventListener("click", async () => {
    if (!confirm("Reject this suggestion?")) return;
    await supabaseClient.from("products").update({ status: "rejected" }).eq("id", product.id);
    loadQueue();
  });

  actions.append(approveBtn, rejectBtn);
  article.appendChild(actions);

  return article;
}

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});

init();
