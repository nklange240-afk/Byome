const form = document.getElementById("review-form");
const productSelect = document.getElementById("review-product");
const variationField = document.getElementById("variation-field");
const variationSelect = document.getElementById("review-variation");
const titleInput = document.getElementById("review-title");
const bodyInput = document.getElementById("review-body");
const countEl = document.getElementById("review-count");
const messageEl = document.getElementById("review-message");
const listEl = document.getElementById("reviews");
const categoryFilter = document.getElementById("category-filter");
const subcategoryFilter = document.getElementById("subcategory-filter");
const searchInput = document.getElementById("review-search");
const searchStatus = document.getElementById("search-status");

let currentUser = null;
let isModerator = false;
let products = [];

const SUBCATEGORIES = {
  "Hair Care": ["Shampoo & Conditioner", "Styling", "Treatments & Masks", "Scalp Care", "Tools & Accessories"],
  "Body Care": ["Body Wash & Soap", "Lotion & Moisturizer", "Exfoliants", "Sun Care", "Deodorant"],
  "Makeup": ["Eyes", "Lips", "Complexion", "Cheeks", "Brows", "Tools & Brushes"],
  "Skincare": ["Cleansers", "Moisturizers", "Serums & Treatments", "Masks", "Eye Care", "Sun Care"],
  "Fragrance": ["Perfume", "Body Spray", "Rollerballs & Travel"],
  "Nail Products": ["Polish", "Care & Treatment", "Tools", "Nail Art"],
};

categoryFilter.addEventListener("change", () => {
  const options = SUBCATEGORIES[categoryFilter.value] || [];
  subcategoryFilter.innerHTML = "";
  subcategoryFilter.appendChild(new Option("All subcategories", ""));
  options.forEach((label) => subcategoryFilter.appendChild(new Option(label, label)));
  subcategoryFilter.disabled = options.length === 0;
  startOverReviews();
});

subcategoryFilter.addEventListener("change", () => startOverReviews());

// ---------- Search ----------
// Type a product or brand; the list shows reviews of every matching
// product. Each word only has to appear somewhere in "brand + name",
// so "cerave cleanser" finds "CeraVe — Hydrating Facial Cleanser".

// Lowercase and strip accents, so "lancome" matches "Lancôme"
function normalize(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchingProducts(q) {
  const words = normalize(q).split(/\s+/).filter(Boolean);
  return products.filter((p) => {
    const haystack = normalize(p.brand + " " + p.name);
    return words.every((w) => haystack.includes(w));
  });
}

// Links like reviews.html?q=cerave open with that search filled in
searchInput.value = new URLSearchParams(window.location.search).get("q") || "";

let searchTimer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const url = new URL(window.location.href);
    const q = searchInput.value.trim();
    if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
    history.replaceState(null, "", url);
    startOverReviews();
  }, 250); // wait until typing pauses
});

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

  if (data.session) {
    currentUser = data.session.user;
    const { data: me } = await supabaseClient
      .from("profiles").select("is_moderator").eq("id", currentUser.id).single();
    isModerator = Boolean(me && me.is_moderator);
    await REPORTS.loadMine(currentUser.id); // so flags you've used start red
  } else {
    // No account — browsing and searching are still fully open, but
    // the write form isn't, since posting a review requires an account.
    const prompt = el("p", "feed-empty");
    const link = el("a", "inline-link", "Log in");
    link.href = "login.html";
    prompt.append(document.createTextNode("Want to write a review? "), link, document.createTextNode(" first."));
    form.replaceWith(prompt);
  }

  await loadProducts();
  loadReviews();
}

async function loadProducts() {
  const { data, error } = await supabaseClient
    .from("products").select("id, name, brand, variations")
    .eq("status", "approved").order("name");
  products = error ? [] : data;

  if (products.length === 0) {
    brandSearch.setBrands([]);
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

  brandSearch.setBrands(
    Array.from(brands.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((x, y) => x.label.localeCompare(y.label))
  );
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
    .sort((x, y) => x.name.localeCompare(y.name))
    .forEach((p) => productSelect.appendChild(option(p.id, p.name)));

  productSelect.value = "";
  // lets the variation picker hide itself for the cleared product
  productSelect.dispatchEvent(new Event("change", { bubbles: true }));
  productDropdown.refresh();
}

form.addEventListener("reset", () => setTimeout(() => showProductsForBrand(""), 0));

// Brand search: type a few letters, click a suggestion underneath.
// Scales to hundreds of brands because it only ever shows the top 8 matches.
function buildBrandSearch() {
  const input = document.getElementById("review-brand");
  const list = document.getElementById("brand-list");
  let brands = [];
  let shown = [];
  let active = -1;
  let selectedKey = "";

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function choose(brand) {
    selectedKey = brand.key;
    input.value = brand.label;
    close();
    showProductsForBrand(brand.key);
  }

  function paintActive() {
    Array.from(list.children).forEach((li, i) => {
      li.classList.toggle("is-active", i === active);
      if (li.getAttribute("role") === "option") li.setAttribute("aria-selected", String(i === active));
    });
    const li = list.children[active];
    if (active >= 0 && li) {
      input.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function render() {
    const q = input.value.trim().toLowerCase();
    // brands that START with what you typed come first
    shown = brands
      .filter((b) => b.label.toLowerCase().includes(q))
      .sort((x, y) => Number(y.label.toLowerCase().startsWith(q)) - Number(x.label.toLowerCase().startsWith(q)))
      .slice(0, 8);

    list.innerHTML = "";
    if (shown.length === 0) {
      const li = el("li", "combo-empty", "No brand matches that. ");
      const link = el("a", "inline-link", "Suggest a product");
      link.href = "suggest-product.html";
      li.appendChild(link);
      list.appendChild(li);
    }
    shown.forEach((b, i) => {
      const li = el("li", "combo-option", b.label);
      li.id = "brand-opt-" + i;
      li.setAttribute("role", "option");
      li.addEventListener("click", () => choose(b));
      list.appendChild(li);
    });

    active = q && shown.length ? 0 : -1;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    paintActive();
  }

  // If the typed text exactly matches a brand, treat it as chosen
  function matchExact() {
    const q = input.value.trim().toLowerCase();
    const hit = brands.find((b) => b.label.toLowerCase() === q);
    if (hit && selectedKey !== hit.key) choose(hit);
  }

  input.addEventListener("input", () => {
    // typing again means the earlier brand choice no longer applies
    if (selectedKey) { selectedKey = ""; showProductsForBrand(""); }
    render();
  });
  input.addEventListener("focus", () => { if (brands.length) render(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) { render(); return; }
      if (!shown.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      active = (active + step + shown.length) % shown.length;
      paintActive();
    } else if (e.key === "Enter") {
      e.preventDefault(); // Enter here should pick a brand, not submit the form
      if (!list.hidden && active >= 0) choose(shown[active]);
      else matchExact();
    } else if (e.key === "Escape" || e.key === "Tab") {
      close();
    }
  });
  input.addEventListener("blur", () => setTimeout(() => { if (!selectedKey) matchExact(); }, 150));
  document.addEventListener("click", (e) => {
    if (!list.hidden && !input.parentNode.contains(e.target)) close();
  });
  form.addEventListener("reset", () => { selectedKey = ""; close(); });

  return {
    setBrands(list) {
      brands = list;
      input.disabled = list.length === 0;
      input.placeholder = list.length ? "Start typing a brand..." : "No approved products yet";
    },
  };
}

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

let latestReviewsRequest = 0;

// Reviews load 20 at a time; "Load more" adds the next 20. Reloading after
// an edit or a new review keeps however many were already showing; a new
// search or filter starts again from the top.
const PAGE_SIZE = 20;
let reviewsShown = 0;

function startOverReviews() {
  reviewsShown = 0;
  loadReviews();
}

async function loadReviews(more) {
  const from = more === true ? reviewsShown : 0;
  const to = (more === true ? reviewsShown + PAGE_SIZE : Math.max(PAGE_SIZE, reviewsShown)) - 1;
  // products!inner lets us filter reviews by a column on the joined
  // product (category/subcategory) — every review has a product, so
  // switching to an inner join never hides a review that would
  // otherwise have shown up.
  let query = supabaseClient
    .from("reviews")
    .select("id, rating, title, body, variation, would_repurchase, holy_grail, created_at, edited_at, held_at, user_id, profiles!user_id(username, avatar_path), products!product_id!inner(name, brand, photo_url, category, subcategory), review_likes(user_id), review_updates(id, body, created_at, held_at), review_standouts(review_id)")
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);

  if (categoryFilter.value) {
    query = query.eq("products.category", categoryFilter.value);
  }
  if (subcategoryFilter.value) {
    query = query.eq("products.subcategory", subcategoryFilter.value);
  }

  const q = searchInput.value.trim();
  searchStatus.hidden = !q;
  if (q) {
    const matches = matchingProducts(q);
    if (matches.length === 0) {
      searchStatus.textContent = "";
      listEl.innerHTML = "";
      const empty = el("p", "feed-empty", "No products match \u201c" + q + "\u201d. ");
      const link = el("a", "inline-link", "Suggest it");
      link.href = "suggest-product.html";
      empty.appendChild(link);
      listEl.appendChild(empty);
      return;
    }
    searchStatus.textContent = matches.length === 1
      ? "Reviews of " + matches[0].brand + " \u2014 " + matches[0].name
      : matches.length + " products match \u201c" + q + "\u201d";
    query = query.in("product_id", matches.slice(0, 200).map((p) => p.id));
  }

  // Typing quickly starts several searches; only show the newest one
  const thisRequest = ++latestReviewsRequest;
  const { data: reviews, error } = await query;
  if (thisRequest !== latestReviewsRequest) return;

  if (more === true) listEl.querySelectorAll(".load-more").forEach((b) => b.remove());
  else listEl.innerHTML = "";
  if (error) {
    listEl.appendChild(el("p", "feed-empty", "Couldn't load reviews: " + error.message));
    return;
  }
  if (reviews.length === 0 && more !== true) {
    reviewsShown = 0;
    const filtered = q || categoryFilter.value;
    listEl.appendChild(el("p", "feed-empty", filtered
      ? "No reviews match yet. Be the first to write one above."
      : "No reviews yet. Write the first one above."));
    return;
  }
  reviews.forEach((r) => listEl.appendChild(buildReview(r)));
  reviewsShown = from + reviews.length;
  if (reviews.length === to - from + 1) {
    const btn = el("button", "btn btn-ghost load-more", "Load more");
    btn.type = "button";
    btn.addEventListener("click", () => { btn.disabled = true; btn.textContent = "Loading..."; loadReviews(true); });
    listEl.appendChild(btn);
  }
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
  let liked = currentUser ? likes.some((l) => l.user_id === currentUser.id) : false;
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
    if (!currentUser) { window.location.href = "login.html"; return; }
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

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// A username that links to that member's profile
function authorLink(profile) {
  return PROFILES.authorLink(profile);
}

// Shown (to the author and moderators only) on anything automod is holding
function heldNotice() {
  return el("p", "held-notice", "Waiting for a moderator to review. Only you and moderators can see this for now.");
}

function actionButton(label) {
  const btn = el("button", "action-btn", label);
  btn.type = "button";
  return btn;
}

// Gap between a review and a follow-up, e.g. "3 weeks later"
function describeGap(start, end) {
  const days = Math.floor((new Date(end) - new Date(start)) / 86400000);
  if (days < 1) return "Same day";
  if (days < 14) return days + (days === 1 ? " day later" : " days later");
  if (days < 60) return Math.round(days / 7) + " weeks later";
  return Math.round(days / 30) + " months later";
}

// A follow-up the author added later, shown in its own highlighted box
function buildUpdate(u, r) {
  const box = el("div", "review-update");
  const label = el("p", "review-update-label");
  label.append(
    el("strong", null, "Update"),
    document.createTextNode(" · " + describeGap(r.created_at, u.created_at) + " · " + formatDate(u.created_at))
  );
  box.append(label);
  if (u.held_at) box.appendChild(heldNotice());
  box.append(el("p", "review-update-body", u.body));

  if (currentUser && r.user_id === currentUser.id) {
    const del = actionButton("Delete update");
    del.addEventListener("click", async () => {
      if (!confirm("Delete this update?")) return;
      await supabaseClient.from("review_updates").delete().eq("id", u.id);
      loadReviews();
    });
    box.appendChild(del);
  }
  return box;
}

function buildUpdateForm(r, onSaved, onCancel) {
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
  const buttons = el("div", "edit-buttons");
  const cancel = actionButton("Cancel");
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
    const { error } = await supabaseClient
      .from("review_updates")
      .insert({ review_id: r.id, user_id: currentUser.id, body: body });
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

function buildReview(r) {
  const article = el("article", "post");
  const titleEl = el("h2", "post-title", r.title);
  article.appendChild(titleEl);

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
  if (r.products && r.products.category) {
    const catText = r.products.subcategory ? r.products.category + " · " + r.products.subcategory : r.products.category;
    info.appendChild(el("span", "product-category-tag", catText));
  }

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
  const isStandout = Boolean(r.review_standouts && r.review_standouts.length);
  if (isStandout) tags.appendChild(el("span", "review-tag standout", "Standout review"));
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
  const time = el("time", null, formatDate(r.created_at));
  time.dateTime = r.created_at;
  meta.append(authorLink(r.profiles), time);
  if (r.edited_at) {
    const tag = el("span", "edited-tag", "edited");
    tag.title = "Edited " + formatDate(r.edited_at);
    meta.appendChild(tag);
  }
  const bodyEl = el("p", "post-body", r.body);
  article.append(meta);
  if (r.held_at) article.appendChild(heldNotice());
  article.append(bodyEl);

  // Follow-up updates, oldest first
  const updates = (r.review_updates || []).slice()
    .sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
  if (updates.length) {
    const box = el("div", "review-updates");
    updates.forEach((u) => box.appendChild(buildUpdate(u, r)));
    article.appendChild(box);
  }

  const actions = el("div", "post-actions");
  actions.appendChild(buildLikeButton("review_likes", "review_id", r.id, r.review_likes || []));

  if (currentUser && r.user_id === currentUser.id) {
    const edit = actionButton("Edit");
    edit.addEventListener("click", () => {
      if (article.querySelector(".edit-form")) return;
      const hide = (hidden) => { titleEl.hidden = hidden; productRow.hidden = hidden; bodyEl.hidden = hidden; };
      hide(true);
      const editForm = EDIT_FORMS.review(r, product, loadReviews, () => { editForm.remove(); hide(false); });
      article.insertBefore(editForm, actions);
    });

    const addUpdate = actionButton("Add update");
    addUpdate.addEventListener("click", () => {
      const existing = article.querySelector(".update-form");
      if (existing) { existing.remove(); return; }
      const updateForm = buildUpdateForm(r, loadReviews, () => updateForm.remove());
      article.insertBefore(updateForm, actions);
      updateForm.querySelector("textarea").focus();
    });

    const del = actionButton("Delete");
    del.addEventListener("click", async () => {
      if (!confirm("Delete this review?")) return;
      await supabaseClient.from("reviews").delete().eq("id", r.id);
      loadReviews();
    });
    actions.append(edit, addUpdate, del);
  }

  // Moderators can mark other people's reviews as standout (bonus points)
  if (currentUser && isModerator && r.user_id !== currentUser.id && !isStandout) {
    const mark = actionButton("Mark standout");
    mark.addEventListener("click", async () => {
      mark.disabled = true;
      const { data: result, error } = await supabaseClient.rpc("grant_standout", { p_review_id: r.id });
      if (error) { mark.textContent = "Couldn't mark: " + error.message; return; }
      mark.textContent = result === "granted" ? "Marked standout ✓" : "Already standout";
    });
    actions.appendChild(mark);
  }
  if (currentUser && r.user_id !== currentUser.id) actions.appendChild(REPORTS.button("review", r.id));
  article.appendChild(actions);
  return article;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) { window.location.href = "login.html"; return; }
  messageEl.textContent = "Posting...";
  messageEl.style.color = "var(--cream)";

  const { data: saved, error } = await supabaseClient.from("reviews").insert({
    product_id: productSelect.value,
    user_id: currentUser.id,
    rating: Number(form.elements["rating"].value),
    title: titleInput.value.trim(),
    body: bodyInput.value.trim(),
    variation: variationSelect.value || null,
    ...extras.get(),
  }).select("held_at").single();

  if (error) {
    messageEl.textContent = error.message;
    messageEl.style.color = "#E07A5F";
    return;
  }
  if (saved && saved.held_at) {
    messageEl.textContent = "Thanks! Your review is waiting for a quick check by a moderator before everyone can see it.";
    messageEl.style.color = "var(--gold)";
  } else {
    messageEl.textContent = "";
  }
  form.reset();
  variationField.hidden = true;
  countEl.textContent = "0 / 2000";
  loadReviews();
});

bodyInput.addEventListener("input", () => {
  countEl.textContent = bodyInput.value.length + " / 2000";
});

const brandSearch = buildBrandSearch();
const productDropdown = enhanceSelect(productSelect);
const variationDropdown = enhanceSelect(variationSelect);
buildRatingWidget();
const extras = buildExtras();
init();
