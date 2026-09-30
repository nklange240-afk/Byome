const form = document.getElementById("review-form");
const brandSelect = document.getElementById("review-brand");
const productSelect = document.getElementById("review-product");
const variationField = document.getElementById("variation-field");
const variationSelect = document.getElementById("review-variation");
const titleInput = document.getElementById("review-title");
const bodyInput = document.getElementById("review-body");
const countEl = document.getElementById("review-count");
const messageEl = document.getElementById("review-message");
const listEl = document.getElementById("reviews");

let currentUser = null;
let products = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function option(value, label) {
  const o = el("option", null, label);
  o.value = value;
  return o;
}

const RATING_LABELS = { 1: "Didn't work for me", 2: "Not great", 3: "It's okay", 4: "Really good", 5: "Love it" };

// Same leaf drawing used for likes on the message board
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

// Five leaves that are really radio buttons underneath, so the rating
// works with a keyboard and screen readers too. Hovering previews a
// rating (and shows its description); clicking locks it in.
function buildRatingWidget() {
  const box = document.getElementById("rating-leaves");
  const labelEl = document.getElementById("rating-label");
  const leaves = [];
  let selected = 0;

  function paint(value) {
    leaves.forEach((leaf, i) => leaf.classList.toggle("on", i < value));
    labelEl.textContent = value ? RATING_LABELS[value] : "Select a rating";
  }

  for (let n = 1; n <= 5; n++) {
    const leaf = el("label", "rating-leaf");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "rating";
    input.value = String(n);
    input.required = true;
    input.className = "visually-hidden";
    leaf.append(input, leafIcon(), el("span", "visually-hidden", n + " out of 5: " + RATING_LABELS[n]));

    leaf.addEventListener("mouseenter", () => paint(n));
    input.addEventListener("change", () => { selected = n; paint(n); });

    leaves.push(leaf);
    box.appendChild(leaf);
  }

  box.addEventListener("mouseleave", () => paint(selected));
  form.addEventListener("reset", () => { selected = 0; paint(0); });
  paint(0);
}

// Replaces the browser's plain <select> menu with a styled dropdown.
// The real <select> stays in the page (hidden), so the form, validation
// and the rest of this file keep working exactly as before.
function enhanceSelect(select) {
  const wrap = el("div", "dropdown");
  select.parentNode.insertBefore(wrap, select);
  select.classList.add("visually-hidden");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const btn = el("button", "dropdown-btn");
  btn.type = "button";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");

  const panel = el("div", "dropdown-panel");
  panel.hidden = true;
  const search = el("input", "dropdown-search");
  search.type = "text";
  search.placeholder = "Search...";
  search.setAttribute("aria-label", "Search options");
  const list = el("ul", "dropdown-list");
  list.setAttribute("role", "listbox");
  list.tabIndex = -1;
  panel.append(search, list);
  wrap.append(btn, panel, select);

  let items = [];
  let shown = [];
  let active = 0;

  function updateButton() {
    const chosen = select.options[select.selectedIndex];
    btn.textContent = chosen ? chosen.text : "";
    btn.classList.toggle("is-placeholder", !chosen || chosen.value === "");
    btn.disabled = items.length === 0;
  }

  function highlight() {
    Array.from(list.children).forEach((li, i) => li.classList.toggle("is-active", i === active));
    const li = list.children[active];
    if (li) li.scrollIntoView({ block: "nearest" });
  }

  function renderList() {
    const q = search.value.trim().toLowerCase();
    shown = items.filter((i) => i.label.toLowerCase().includes(q));
    list.innerHTML = "";
    if (shown.length === 0) {
      list.appendChild(el("li", "dropdown-empty", "No matches"));
      return;
    }
    shown.forEach((item) => {
      const li = el("li", "dropdown-option");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(item.value === select.value));
      if (item.name) {
        li.append(el("span", "opt-main", item.name), el("span", "opt-sub", item.brand));
      } else {
        li.appendChild(el("span", "opt-main", item.label));
      }
      li.addEventListener("click", () => choose(item));
      list.appendChild(li);
    });
    highlight();
  }

  function open() {
    if (btn.disabled) return;
    search.value = "";
    search.hidden = items.length <= 6; // only offer search for longer lists
    active = Math.max(0, items.findIndex((i) => i.value === select.value));
    renderList();
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    (search.hidden ? list : search).focus();
  }

  function close(returnFocus) {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (returnFocus) btn.focus();
  }

  function choose(item) {
    select.value = item.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    updateButton();
    close(true);
  }

  function move(step) {
    if (shown.length === 0) return;
    active = (active + step + shown.length) % shown.length;
    highlight();
  }

  btn.addEventListener("click", () => (panel.hidden ? open() : close(true)));
  search.addEventListener("input", () => { active = 0; renderList(); });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (e.key === "Escape") { e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close(false);
  });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !wrap.contains(e.target)) close(false);
  });
  form.addEventListener("reset", () => setTimeout(updateButton, 0));

  // Call this whenever the <select>'s options change
  function refresh() {
    items = Array.from(select.options)
      .filter((o) => o.value !== "")
      .map((o) => ({ value: o.value, label: o.text, name: o.dataset.name, brand: o.dataset.brand }));
    updateButton();
  }
  refresh();
  return { refresh };
}

async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }
  currentUser = data.session.user;
  await loadProducts();
  loadReviews();
}

async function loadProducts() {
  const { data, error } = await supabaseClient
    .from("products").select("id, name, brand, variations")
    .eq("status", "approved").order("name");
  products = error ? [] : data;

  brandSelect.innerHTML = "";
  if (products.length === 0) {
    brandSelect.appendChild(option("", "No approved products yet"));
    brandDropdown.refresh();
    showProductsForBrand("");
    form.querySelector("button[type=submit]").disabled = true;
    return;
  }

  // One entry per brand. Capitalization and stray spaces are ignored,
  // so "CeraVe" and "cerave " end up in the same group.
  const brands = new Map();
  products.forEach((p) => {
    const key = brandKey(p.brand);
    if (!brands.has(key)) brands.set(key, p.brand.trim());
  });

  brandSelect.appendChild(option("", "Choose a brand..."));
  Array.from(brands.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([key, label]) => brandSelect.appendChild(option(key, label)));

  brandDropdown.refresh();
  showProductsForBrand("");
}

function brandKey(brand) {
  return brand.trim().toLowerCase();
}

// Fill the product list with only the products from one brand.
// Passing "" (no brand chosen yet) leaves it empty and disabled.
function showProductsForBrand(key) {
  productSelect.innerHTML = "";
  productSelect.appendChild(option("", key ? "Choose a product..." : "Choose a brand first"));

  products
    .filter((p) => key && brandKey(p.brand) === key)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((p) => productSelect.appendChild(option(p.id, p.name)));

  productSelect.value = "";
  // lets the variation picker hide itself for the cleared product
  productSelect.dispatchEvent(new Event("change", { bubbles: true }));
  productDropdown.refresh();
}

brandSelect.addEventListener("change", () => showProductsForBrand(brandSelect.value));
form.addEventListener("reset", () => setTimeout(() => showProductsForBrand(""), 0));

// Show the variation picker only for products that have variations
productSelect.addEventListener("change", () => {
  const p = products.find((x) => x.id === productSelect.value);
  variationSelect.innerHTML = "";
  if (p && p.variations && p.variations.length) {
    variationSelect.appendChild(option("", "Not specified"));
    p.variations.forEach((v) => variationSelect.appendChild(option(v, v)));
    variationField.hidden = false;
  } else {
    variationField.hidden = true;
  }
  variationDropdown.refresh();
});

async function loadReviews() {
  const { data: reviews, error } = await supabaseClient
    .from("reviews")
    .select("id, rating, title, body, variation, would_repurchase, holy_grail, created_at, user_id, profiles!user_id(username), products!product_id(name, brand, photo_url), review_likes(user_id)")
    .order("created_at", { ascending: false })
    .limit(50);

  listEl.innerHTML = "";
  if (error) {
    listEl.appendChild(el("p", "feed-empty", "Couldn't load reviews: " + error.message));
    return;
  }
  if (reviews.length === 0) {
    listEl.appendChild(el("p", "feed-empty", "No reviews yet. Write the first one above."));
    return;
  }
  reviews.forEach((r) => listEl.appendChild(buildReview(r)));
}

// Only allow normal web addresses for product photos
function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch (e) {
    return null;
  }
}

// Four-point star used for "Holy grail"
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

// Leaf like button, same behavior as on the message board
function buildLikeButton(table, idColumn, id, likes) {
  let liked = likes.some((l) => l.user_id === currentUser.id);
  let count = likes.length;

  const btn = el("button", "action-btn like-btn");
  btn.type = "button";

  function paint() {
    btn.innerHTML = "";
    btn.append(leafIcon(), el("span", null, String(count)));
    btn.setAttribute("aria-pressed", String(liked));
    btn.setAttribute("aria-label", (liked ? "Unlike" : "Like") + " (" + count + " likes)");
    btn.classList.toggle("is-liked", liked);
  }
  paint();

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    if (liked) {
      const { error } = await supabaseClient
        .from(table).delete().eq(idColumn, id).eq("user_id", currentUser.id);
      if (!error) { liked = false; count--; }
    } else {
      const { error } = await supabaseClient
        .from(table).insert({ [idColumn]: id, user_id: currentUser.id });
      if (!error) { liked = true; count++; }
    }
    paint();
    btn.disabled = false;
  });
  return btn;
}

// "Would you repurchase?" (yes / no / unanswered) and "Holy grail".
// Clicking a selected Yes/No again clears it. Holy grail only unlocks
// when the rating is 5 leaves, and clears itself if the rating drops.
function buildExtras() {
  const group = document.getElementById("repurchase-group");
  const grailBtn = document.getElementById("holy-grail-btn");
  let repurchase = null;
  let grail = false;

  function paint() {
    group.querySelectorAll(".toggle-btn").forEach((b) => {
      const pressed = repurchase !== null && (b.dataset.value === "yes") === repurchase;
      b.setAttribute("aria-pressed", String(pressed));
    });
    const hasFive = form.elements["rating"].value === "5";
    if (!hasFive) grail = false;
    grailBtn.disabled = !hasFive;
    grailBtn.setAttribute("aria-pressed", String(grail));
  }

  group.addEventListener("click", (e) => {
    const b = e.target.closest(".toggle-btn");
    if (!b) return;
    const value = b.dataset.value === "yes";
    repurchase = repurchase === value ? null : value;
    paint();
  });
  grailBtn.addEventListener("click", () => { grail = !grail; paint(); });
  form.addEventListener("change", (e) => { if (e.target.name === "rating") paint(); });
  form.addEventListener("reset", () => { repurchase = null; grail = false; setTimeout(paint, 0); });
  paint();

  return { get: () => ({ would_repurchase: repurchase, holy_grail: grail }) };
}

function buildReview(r) {
  const article = el("article", "post");
  article.appendChild(el("h2", "post-title", r.title));

  // Product photo (if it has one) beside the product name and rating
  const productRow = el("div", "review-product-row");
  const photo = r.products && r.products.photo_url ? safeUrl(r.products.photo_url) : null;
  if (photo) {
    const img = document.createElement("img");
    img.className = "review-photo";
    img.src = photo;
    img.alt = r.products.name + " product photo";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove()); // broken link: just hide it
    productRow.appendChild(img);
  }

  const info = el("div", "review-product-info");
  const product = r.products ? r.products.brand + " — " + r.products.name : "Unknown product";
  info.appendChild(el("p", "review-product", r.variation ? product + " (" + r.variation + ")" : product));

  const rating = el("div", "review-rating");
  for (let i = 1; i <= 5; i++) {
    const s = el("span", "rating-leaf static" + (i <= r.rating ? " on" : ""));
    s.appendChild(leafIcon());
    rating.appendChild(s);
  }
  rating.setAttribute("role", "img");
  rating.setAttribute("aria-label", r.rating + " out of 5");
  info.appendChild(rating);

  const tags = el("div", "review-tags");
  if (r.holy_grail) {
    const tag = el("span", "review-tag holy-grail");
    tag.append(starIcon(), document.createTextNode("Holy grail"));
    tags.appendChild(tag);
  }
  if (r.would_repurchase !== null && r.would_repurchase !== undefined) {
    tags.appendChild(el("span", "review-tag", r.would_repurchase ? "Would repurchase" : "Wouldn't repurchase"));
  }
  if (tags.children.length) info.appendChild(tags);

  productRow.appendChild(info);
  article.appendChild(productRow);

  const meta = el("div", "post-meta");
  const time = el("time", null, new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }));
  time.dateTime = r.created_at;
  meta.append(el("span", "post-author", r.profiles ? r.profiles.username : "Unknown"), time);
  article.append(meta, el("p", "post-body", r.body));

  const actions = el("div", "post-actions");
  actions.appendChild(buildLikeButton("review_likes", "review_id", r.id, r.review_likes || []));

  if (r.user_id === currentUser.id) {
    const del = el("button", "action-btn", "Delete");
    del.type = "button";
    del.addEventListener("click", async () => {
      if (!confirm("Delete this review?")) return;
      await supabaseClient.from("reviews").delete().eq("id", r.id);
      loadReviews();
    });
    actions.appendChild(del);
  }
  article.appendChild(actions);
  return article;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  messageEl.textContent = "Posting...";
  messageEl.style.color = "var(--cream)";

  const { error } = await supabaseClient.from("reviews").insert({
    product_id: productSelect.value,
    user_id: currentUser.id,
    rating: Number(form.elements["rating"].value),
    title: titleInput.value.trim(),
    body: bodyInput.value.trim(),
    variation: variationSelect.value || null,
    ...extras.get(),
  });

  if (error) {
    messageEl.textContent = error.message;
    messageEl.style.color = "#E07A5F";
    return;
  }
  messageEl.textContent = "";
  form.reset();
  variationField.hidden = true;
  countEl.textContent = "0 / 2000";
  loadReviews();
});

bodyInput.addEventListener("input", () => {
  countEl.textContent = bodyInput.value.length + " / 2000";
});

const brandDropdown = enhanceSelect(brandSelect);
const productDropdown = enhanceSelect(productSelect);
const variationDropdown = enhanceSelect(variationSelect);
buildRatingWidget();
const extras = buildExtras();
init();
