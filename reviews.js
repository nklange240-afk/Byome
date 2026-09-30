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
    .select("id, rating, title, body, variation, created_at, user_id, profiles!user_id(username), products!product_id(name, brand)")
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

function buildReview(r) {
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

  const meta = el("div", "post-meta");
  const time = el("time", null, new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }));
  time.dateTime = r.created_at;
  meta.append(el("span", "post-author", r.profiles ? r.profiles.username : "Unknown"), time);
  article.append(meta, el("p", "post-body", r.body));

  if (r.user_id === currentUser.id) {
    const actions = el("div", "post-actions");
    const del = el("button", "action-btn", "Delete");
    del.type = "button";
    del.addEventListener("click", async () => {
      if (!confirm("Delete this review?")) return;
      await supabaseClient.from("reviews").delete().eq("id", r.id);
      loadReviews();
    });
    actions.appendChild(del);
    article.appendChild(actions);
  }
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
init();
