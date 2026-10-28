const form = document.getElementById("review-form");
const productSelect = document.getElementById("review-product");
const variationField = document.getElementById("variation-field");
const variationSelect = document.getElementById("review-variation");
const titleInput = document.getElementById("review-title");
const bodyInput = document.getElementById("review-body");
const messageEl = document.getElementById("review-message");
const listEl = document.getElementById("reviews");
const categoryFilter = document.getElementById("category-filter");
const subcategoryFilter = document.getElementById("subcategory-filter");
const searchInput = document.getElementById("review-search");
const searchStatus = document.getElementById("search-status");

let currentUser = null;
let isModerator = false;
let products = [];

// reviews.html?product=<id> is that product's page: a summary on top and
// only its reviews below, which can be narrowed to one skin type
const productParam = new URLSearchParams(window.location.search).get("product");
let skinFilter = "";
let sortBy = "newest"; // or "helpful"

document.querySelectorAll("#sort-chips .category-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (sortBy === chip.dataset.sort) return;
    sortBy = chip.dataset.sort;
    document.querySelectorAll("#sort-chips .category-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    startOverReviews();
  });
});

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

// Category and subcategory pills (like the community feed). They set the
// hidden dropdowns above, so the filtering itself works as before.
const categoryChips = document.getElementById("category-chips");
const subcategoryChips = document.getElementById("subcategory-chips");

function buildChips(box, select, allLabel) {
  box.replaceChildren();
  Array.from(select.options).forEach((option) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "category-chip";
    chip.textContent = option.value ? option.textContent : allLabel;
    chip.setAttribute("aria-pressed", String(select.value === option.value));
    chip.addEventListener("click", () => {
      if (select.value === option.value) return;
      select.value = option.value;
      box.querySelectorAll(".category-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      select.dispatchEvent(new Event("change"));
    });
    box.appendChild(chip);
  });
}

buildChips(categoryChips, categoryFilter, "All");
categoryFilter.addEventListener("change", () => {
  subcategoryChips.hidden = subcategoryFilter.disabled;
  if (!subcategoryFilter.disabled) buildChips(subcategoryChips, subcategoryFilter, "All " + categoryFilter.value.toLowerCase());
});

// The write form stays folded away until you ask for it, so the reviews
// come first
const writeToggle = document.getElementById("write-review-toggle");
// Event checkboxes on the review form ("I no longer use this", "This is a
// fall or seasonal product"): only shown, and only sent, while an event is on
const eventField = document.getElementById("event-review-field");
UI.liveEvent().then((event) => {
  // (visitors who aren't logged in have no review form)
  const legend = document.getElementById("event-review-legend");
  if (!event || !legend) return;
  legend.textContent = event.name + " (optional)";
  eventField.hidden = false;
});
function eventChoices() {
  if (eventField.hidden) return {};
  return {
    no_longer_using: document.getElementById("review-no-longer-using").checked,
    seasonal: document.getElementById("review-seasonal").checked,
  };
}

function setWriting(open) {
  form.hidden = !open;
  writeToggle.setAttribute("aria-expanded", String(open));
  writeToggle.textContent = open ? "Close" : "Write a review";
  writeToggle.classList.toggle("btn-solid", !open);
  writeToggle.classList.toggle("btn-ghost", open);
  if (!open) return;
  // On a product's page, the form starts with that product chosen
  if (prefillProductPage()) form.querySelector("input[name=rating]").focus();
  else document.getElementById("review-brand").focus();
}

// reviews.html?product=<id>: choose that product's brand and name in the
// form. Returns true if it's chosen. (Waits until the products have loaded.)
function prefillProductPage() {
  if (!productParam || !products.length || addingProduct) return false;
  const p = products.find((x) => x.id === productParam);
  if (!p) return false;
  if (productSelect.value !== p.id) {
    brandSearch.choose(p.brand);
    productSelect.value = p.id;
    productSelect.dispatchEvent(new Event("change", { bubbles: true }));
    productDropdown.refresh();
  }
  return true;
}
writeToggle.addEventListener("click", () => setWriting(form.hidden));
// reviews.html?write=1 (from the starter checklist) opens the form
if (new URLSearchParams(window.location.search).get("write") === "1") setWriting(true);

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
    input.addEventListener("change", () => {
      selected = n;
      paint(n);
      // The chosen leaves pop one after another
      leaves.slice(0, n).forEach((l, i) => {
        l.classList.remove("pop");
        void l.offsetWidth; // restart the animation
        l.style.animationDelay = i * 60 + "ms";
        l.classList.add("pop");
      });
    });

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
  search.setAttribute("role", "combobox");
  search.setAttribute("aria-autocomplete", "list");
  search.setAttribute("aria-expanded", "true");
  const list = el("ul", "dropdown-list");
  list.setAttribute("role", "listbox");
  list.tabIndex = -1;
  panel.append(search, list);
  wrap.append(btn, panel, select);

  // Screen readers hear the field's name with its current choice
  // ("Product, Paula's Choice BHA"), and which option is highlighted
  const baseId = (select.id || "dropdown") + "-dd";
  btn.id = baseId + "-btn";
  list.id = baseId + "-list";
  btn.setAttribute("aria-controls", list.id);
  const fieldLabel = select.id && document.querySelector('label[for="' + select.id + '"]');
  if (fieldLabel) {
    if (!fieldLabel.id) fieldLabel.id = baseId + "-label";
    btn.setAttribute("aria-labelledby", fieldLabel.id + " " + btn.id);
    list.setAttribute("aria-labelledby", fieldLabel.id);
    // the visible label now names the button, so clicking it opens the list
    fieldLabel.addEventListener("click", (e) => { e.preventDefault(); btn.focus(); });
  }

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
    const focusEl = search.hidden ? list : search;
    if (li && li.id) {
      focusEl.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView({ block: "nearest" });
    } else {
      focusEl.removeAttribute("aria-activedescendant");
    }
  }

  function renderList() {
    const q = search.value.trim().toLowerCase();
    shown = items.filter((i) => i.label.toLowerCase().includes(q));
    list.innerHTML = "";
    if (shown.length === 0) {
      list.appendChild(el("li", "dropdown-empty", "No matches"));
      return;
    }
    shown.forEach((item, i) => {
      const li = el("li", "dropdown-option");
      li.id = baseId + "-opt-" + i;
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
    search.setAttribute("aria-controls", list.id);
    (search.hidden ? list : search).focus();
    highlight();
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

// ---------- Product pages ----------

// The summary at the top of a product page: photo, name, average leaves,
// how many would repurchase, holy grails, and the spread of ratings.
// The skin-type pills narrow both the summary and the reviews below.
async function showProductPage() {
  const summary = document.getElementById("product-summary");
  ["review-search", "category-chips", "subcategory-chips", "suggest-line", "new-product-line"].forEach((id) => {
    const node = document.getElementById(id);
    if (node) (id === "review-search" ? node.closest(".review-search") : node).hidden = true;
  });
  document.getElementById("product-back").hidden = false;

  const [productRes, statsRes] = await Promise.all([
    supabaseClient.from("products").select("id, name, brand, photo_url, category, subcategory, variations")
      .eq("id", productParam).maybeSingle(),
    supabaseClient.from("reviews").select("rating, would_repurchase, holy_grail, profiles!user_id(skin_type)")
      .eq("product_id", productParam).is("held_at", null).limit(2000),
  ]);
  const product = productRes.data;
  if (!product) {
    document.querySelector(".page-head h1").textContent = "Product not found";
    return;
  }
  document.title = product.brand + " " + product.name + " reviews — Byome";
  document.querySelector(".page-head h1").textContent = product.name;
  const rows = statsRes.data || [];

  summary.replaceChildren();
  const head = el("div", "product-head");
  const photo = product.photo_url ? safeUrl(product.photo_url) : null;
  if (photo) {
    const img = document.createElement("img");
    img.className = "product-photo";
    img.src = photo;
    img.alt = product.name + " product photo";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove());
    head.appendChild(img);
  }
  const who = el("div", "product-who");
  who.appendChild(el("p", "product-brand", product.brand));
  if (product.category) {
    who.appendChild(el("span", "product-category-tag",
      product.subcategory ? product.category + " · " + product.subcategory : product.category));
  }
  head.appendChild(who);
  summary.appendChild(head);

  // Its shades or scents, and a way to suggest a new one (only for
  // products that come in variations)
  if (product.variations && product.variations.length) {
    const shades = el("p", "product-variations");
    shades.append(el("strong", null, "Comes in: "), document.createTextNode(product.variations.join(", ")));
    summary.appendChild(shades);
    if (currentUser) {
      const add = el("button", "link-btn", "Missing one? Suggest a new shade or scent");
      add.type = "button";
      add.addEventListener("click", () => {
        const form = UI.variationForm(product, () => { form.remove(); add.hidden = false; add.focus(); });
        add.hidden = true;
        add.after(form);
        form.querySelector("input").focus();
      });
      summary.appendChild(add);
    }
  }

  const statsBox = el("div", "product-stats");
  summary.appendChild(statsBox);

  // Skin type pills: everyone, or one skin type (your own is marked)
  let mySkin = null;
  if (currentUser) {
    const { data: me } = await supabaseClient.from("profiles").select("skin_type").eq("id", currentUser.id).maybeSingle();
    mySkin = me && me.skin_type;
  }
  const pills = el("div", "category-chips skin-chips");
  pills.setAttribute("role", "group");
  pills.setAttribute("aria-label", "Show reviews from people with this skin type");
  const label = el("span", "sort-label", "Skin type:");
  pills.appendChild(label);
  [["", "Everyone"]].concat(PROFILES.SKIN_TYPES).forEach(([key, text]) => {
    const count = key ? rows.filter((r) => r.profiles && r.profiles.skin_type === key).length : rows.length;
    const chip = el("button", "category-chip", text + (key === mySkin && key ? " (you)" : "") + " · " + count);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(key === skinFilter));
    chip.addEventListener("click", () => {
      if (skinFilter === key) return;
      skinFilter = key;
      pills.querySelectorAll(".category-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      paintStats(statsBox, key ? rows.filter((r) => r.profiles && r.profiles.skin_type === key) : rows, key);
      startOverReviews();
    });
    pills.appendChild(chip);
  });
  summary.appendChild(pills);
  paintStats(statsBox, rows, "");
  summary.hidden = false;
}

function paintStats(box, rows, skin) {
  box.replaceChildren();
  if (!rows.length) {
    box.appendChild(el("p", "feed-empty", skin
      ? "No reviews from people with " + PROFILES.label(PROFILES.SKIN_TYPES, skin).toLowerCase() + " skin yet."
      : "No reviews yet. Be the first!"));
    return;
  }
  const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;

  const top = el("div", "product-average");
  top.appendChild(el("strong", "product-average-number", avg.toFixed(1)));
  const leaves = el("div", "review-rating");
  for (let i = 1; i <= 5; i++) {
    // Half leaves round to the nearest whole leaf
    const s = el("span", "rating-leaf static" + (i <= Math.round(avg) ? " on" : ""));
    s.appendChild(leafIcon());
    leaves.appendChild(s);
  }
  leaves.setAttribute("role", "img");
  leaves.setAttribute("aria-label", "Average " + avg.toFixed(1) + " out of 5");
  top.appendChild(leaves);
  top.appendChild(el("span", "product-count", rows.length + (rows.length === 1 ? " review" : " reviews")));
  box.appendChild(top);

  const facts = el("ul", "product-facts");
  const answered = rows.filter((r) => r.would_repurchase !== null && r.would_repurchase !== undefined);
  if (answered.length) {
    const yes = answered.filter((r) => r.would_repurchase).length;
    facts.appendChild(el("li", null, Math.round((yes / answered.length) * 100) + "% would repurchase (" + yes + " of " + answered.length + ")"));
  }
  const grails = rows.filter((r) => r.holy_grail).length;
  if (grails) facts.appendChild(el("li", null, grails + (grails === 1 ? " member calls it a holy grail" : " members call it a holy grail")));
  if (facts.children.length) box.appendChild(facts);

  // How the ratings spread out, 5 leaves down to 1
  const bars = el("div", "rating-bars");
  for (let n = 5; n >= 1; n--) {
    const count = rows.filter((r) => r.rating === n).length;
    const row = el("div", "rating-bar-row");
    row.appendChild(el("span", "rating-bar-label", n + (n === 1 ? " leaf" : " leaves")));
    const track = el("span", "rating-bar-track");
    const fill = el("span", "rating-bar-fill");
    fill.style.width = (count / rows.length) * 100 + "%";
    track.appendChild(fill);
    row.append(track, el("span", "rating-bar-count", String(count)));
    bars.appendChild(row);
  }
  box.appendChild(bars);
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
    // One friendly line for visitors (suggesting a product needs an account too)
    const prompt = el("p", "guest-prompt");
    const login = el("a", "inline-link", "Log in");
    login.href = "login.html";
    const join = el("a", "inline-link", "join Byome");
    join.href = "signup.html";
    prompt.append(login, document.createTextNode(" or "), join,
      document.createTextNode(" to write a review or suggest a product."));
    form.replaceWith(prompt);
    writeToggle.remove();
    const suggestLine = document.getElementById("suggest-line");
    if (suggestLine) suggestLine.remove();
  }

  await Promise.all([loadProducts(), loadMyPendingProducts()]);
  if (productParam) await showProductPage();
  if (!form.hidden) prefillProductPage(); // opened with ?write=1
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
      const add = el("button", "link-btn", "Add the product with your review");
      add.type = "button";
      add.addEventListener("click", () => { close(); setAddingProduct(true, input.value.trim()); });
      li.appendChild(add);
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
    // pick a brand by its name (from "Is it one of these?")
    choose(label) {
      const hit = brands.find((b) => b.key === brandKey(label));
      if (hit) choose(hit);
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

// ---------- Adding a product that isn't on Byome yet ----------
// "Add it with your review" swaps the brand and product pickers for a few
// product fields. On posting, the product goes to the moderators as a
// suggestion and the review waits with it: it goes live as soon as the
// product is approved (database/2026-11-22-review-new-products.sql).
const newProductLine = document.getElementById("new-product-line");
const newProductField = document.getElementById("new-product-field");
const npBrand = document.getElementById("np-brand");
const npName = document.getElementById("np-name");
const npCategory = document.getElementById("np-category");
const npSubcategory = document.getElementById("np-subcategory");
const npVariation = document.getElementById("np-variation");
const npSimilar = document.getElementById("np-similar");
const npSizeWarning = document.getElementById("np-size-warning");
const pickerParts = [document.getElementById("review-brand").parentNode,
  document.querySelector('label[for="review-brand"]'), document.querySelector('label[for="review-product"]')];
let addingProduct = false;
let myPendingProducts = []; // your own suggestions still waiting, for the "already suggested" check
let savedNewProductId = null; // if the product saved but the review didn't, posting again reuses it

function setAddingProduct(on, brandText) {
  addingProduct = on;
  newProductField.hidden = !on;
  newProductLine.hidden = on;
  pickerParts.forEach((part) => { part.hidden = on; });
  productSelect.closest(".dropdown").hidden = on;
  productSelect.required = !on;
  if (on) {
    variationField.hidden = true;
    if (brandText !== undefined) npBrand.value = brandText;
    (npBrand.value ? npName : npBrand).focus();
    showNewProductMatches();
  } else {
    productSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

document.getElementById("new-product-open").addEventListener("click", () =>
  setAddingProduct(true, document.getElementById("review-brand").value.trim()));
document.getElementById("suggest-with-review").addEventListener("click", () => {
  setWriting(true);
  setAddingProduct(true, "");
  form.scrollIntoView({ block: "start" });
});
document.getElementById("new-product-close").addEventListener("click", () => {
  setAddingProduct(false);
  document.getElementById("review-brand").focus();
});

npCategory.addEventListener("change", () => {
  const options = SUBCATEGORIES[npCategory.value] || [];
  npSubcategory.innerHTML = "";
  npSubcategory.appendChild(option("", options.length ? "Choose a subcategory..." : "Choose a category first"));
  options.forEach((label) => npSubcategory.appendChild(option(label, label)));
  npSubcategory.disabled = options.length === 0;
  npSubcategoryDropdown.refresh();
});

// "Is it one of these?" Products already on Byome that look like the one
// being typed. Choosing one goes back to the normal pickers with it chosen.
function newProductMatches() {
  return PRODUCT_MATCH.similar({ brand: npBrand.value, name: npName.value },
    products.map((p) => Object.assign({ status: "approved" }, p)).concat(myPendingProducts));
}

function showNewProductMatches() {
  const matches = npName.value.trim() ? newProductMatches().slice(0, 3) : [];
  npSimilar.replaceChildren();
  npSimilar.hidden = matches.length === 0;
  if (!matches.length) return;
  npSimilar.appendChild(el("p", "similar-title",
    matches.length === 1 ? "Is it this one? It's already on Byome:" : "Is it one of these? They're already on Byome:"));
  const list = el("ul");
  matches.forEach(({ product }) => {
    const li = el("li");
    const label = product.brand + " \u2014 " + product.name;
    if (product.status === "approved") {
      const pick = el("button", "link-btn similar-pick", label);
      pick.type = "button";
      pick.addEventListener("click", () => chooseListedProduct(product));
      li.appendChild(pick);
    } else {
      li.textContent = label + " (you suggested this already; it's waiting for a moderator)";
    }
    list.appendChild(li);
  });
  npSimilar.appendChild(list);
}

function chooseListedProduct(product) {
  setAddingProduct(false);
  brandSearch.choose(product.brand);
  productSelect.value = product.id;
  productSelect.dispatchEvent(new Event("change", { bubbles: true }));
  productDropdown.refresh();
  messageEl.textContent = "Great, " + product.brand + " \u2014 " + product.name + " is chosen.";
  messageEl.style.color = "var(--cream)";
}

let npTimer = null;
[npBrand, npName].forEach((input) => input.addEventListener("input", () => {
  savedNewProductId = null; // a different product now
  clearTimeout(npTimer);
  npTimer = setTimeout(showNewProductMatches, 250);
}));

// Sizes aren't variations (same note as the suggest page)
npVariation.addEventListener("input", () => {
  const isSize = PRODUCT_MATCH.looksLikeSize(npVariation.value.trim());
  npSizeWarning.hidden = !isSize;
  npSizeWarning.textContent = isSize
    ? "\u201c" + npVariation.value.trim() + "\u201d looks like a size. Sizes aren't variations (reviews cover every size of a product), so please leave it out."
    : "";
});

// Checks the product fields, then saves the product. Returns its id, or
// null (with the reason shown) if it can't be saved.
async function saveNewProduct() {
  const brand = npBrand.value.trim();
  const name = npName.value.trim();
  const variation = npVariation.value.trim();
  const problem = !brand ? "Please add the product's brand."
    : !name ? "Please add the product's name."
    : !npCategory.value ? "Please choose a category for the product."
    : !npSubcategory.value ? "Please choose a subcategory for the product."
    : PRODUCT_MATCH.looksLikeSize(variation) ? "Please leave the size out of the shade or scent box."
    : "";
  if (problem) { showFormError(problem); return null; }
  if (savedNewProductId) return savedNewProductId;

  // A near-certain match gets one last check
  const best = newProductMatches()[0];
  if (best && best.score === 1 &&
      !confirm(best.product.brand + " \u2014 " + best.product.name + " looks like the same product. Add yours anyway?")) {
    messageEl.textContent = "";
    return null;
  }

  const id = crypto.randomUUID();
  const { error } = await supabaseClient.from("products").insert({
    id: id,
    name: name,
    brand: brand,
    category: npCategory.value,
    subcategory: npSubcategory.value,
    variations: variation ? [variation] : [],
    suggested_by: currentUser.id,
  });
  if (error) { showFormError(error.message); return null; }
  savedNewProductId = id;
  return id;
}

function showFormError(text) {
  messageEl.textContent = text;
  messageEl.style.color = "#E07A5F";
}

async function loadMyPendingProducts() {
  if (!currentUser) return;
  const { data } = await supabaseClient.from("products")
    .select("id, name, brand, status").eq("status", "pending").eq("suggested_by", currentUser.id);
  myPendingProducts = data || [];
}

form.addEventListener("reset", () => {
  npSimilar.hidden = true;
  npSizeWarning.hidden = true;
  setTimeout(() => { npCategory.dispatchEvent(new Event("change")); npCategoryDropdown.refresh(); }, 0);
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

// The event checkbox columns (database/2026-10-29-events-halloween.sql); left
// out if they aren't in the database yet
let REVIEW_EVENT_COLUMNS = "no_longer_using, seasonal, ";

async function loadReviews(more) {
  const from = more === true ? reviewsShown : 0;
  const to = (more === true ? reviewsShown + PAGE_SIZE : Math.max(PAGE_SIZE, reviewsShown)) - 1;
  // products!inner lets us filter reviews by a column on the joined
  // product (category/subcategory) — every review has a product, so
  // switching to an inner join never hides a review that would
  // otherwise have shown up.
  let query = supabaseClient
    .from("reviews")
    .select("id, product_id, rating, title, body, variation, would_repurchase, holy_grail, created_at, edited_at, held_at, user_id, helpful_count, " +
      REVIEW_EVENT_COLUMNS +
      // filtering by skin type needs an inner join on the reviewer's profile
      "profiles!user_id" + (skinFilter ? "!inner" : "") + "(username, avatar_path, avatar_ring, profile_biome, show_biome_symbol, is_moderator, badge, skin_type), " +
      "products!product_id!inner(name, brand, photo_url, category, subcategory), review_likes(user_id), review_updates(id, body, created_at, held_at), review_standouts(review_id)");
  if (sortBy === "helpful") query = query.order("helpful_count", { ascending: false });
  query = query.order("created_at", { ascending: false }).order("id").range(from, to);

  if (productParam) query = query.eq("product_id", productParam);
  if (skinFilter) query = query.eq("profiles.skin_type", skinFilter);

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
    if (matches.length === 1) {
      // One product: link to its page (average rating, skin types and more)
      searchStatus.textContent = "Reviews of " + matches[0].brand + " \u2014 " + matches[0].name + ". ";
      const link = el("a", "inline-link", "See its product page");
      link.href = "reviews.html?product=" + encodeURIComponent(matches[0].id);
      searchStatus.appendChild(link);
    } else {
      searchStatus.textContent = matches.length + " products match \u201c" + q + "\u201d";
    }
    query = query.in("product_id", matches.slice(0, 200).map((p) => p.id));
  }

  // Typing quickly starts several searches; only show the newest one
  const thisRequest = ++latestReviewsRequest;
  const { data: reviews, error } = await query;
  if (thisRequest !== latestReviewsRequest) return;

  if (more === true) listEl.querySelectorAll(".load-more").forEach((b) => b.remove());
  else listEl.innerHTML = "";
  if (error && REVIEW_EVENT_COLUMNS && /no_longer_using|seasonal/.test(error.message)) {
    // the event columns aren't in the database yet: load without them
    REVIEW_EVENT_COLUMNS = "";
    return loadReviews(more);
  }
  if (error) {
    listEl.appendChild(el("p", "feed-empty", "Couldn't load reviews: " + error.message));
    return;
  }
  if (reviews.length === 0 && more !== true) {
    reviewsShown = 0;
    const filtered = q || categoryFilter.value;
    listEl.appendChild(UI.emptyState({ image: "biome-assets/plant-daisies.png", text: filtered
      ? "No reviews match yet. Why not write the first one?"
      : "No reviews yet. Why not write the first one?" }));
    return;
  }
  reviews.forEach((r) => listEl.appendChild(buildReview(r)));
  reviewsShown = from + reviews.length;
  if (reviews.length === to - from + 1) {
    const btn = el("button", "btn btn-ghost load-more", "Load more");
    btn.type = "button";
    btn.addEventListener("click", () => { btn.disabled = true; btn.textContent = "Loading…"; btn.classList.add("is-loading"); loadReviews(true); });
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

// On reviews the leaf button means "Helpful". Same behavior as the leaf
// likes on the community feed (and it earns the same points).
function buildLikeButton(table, idColumn, id, likes, authorId) {
  let liked = currentUser ? likes.some((l) => l.user_id === currentUser.id) : false;
  let count = likes.length;

  const btn = el("button", "action-btn like-btn");
  btn.type = "button";
  // Your own review: just the count (you can't mark it helpful yourself)
  const own = Boolean(currentUser && authorId && authorId === currentUser.id);
  if (own) {
    btn.disabled = true;
    btn.title = "You can't mark your own review as helpful";
  }

  function paint() {
    btn.innerHTML = "";
    btn.append(leafIcon(), el("span", null, "Helpful" + (count ? " \u00b7 " + count : "")));
    btn.setAttribute("aria-pressed", String(liked));
    btn.setAttribute("aria-label", "Helpful, " + count + (count === 1 ? " person" : " people") + " found this helpful");
    btn.classList.toggle("is-liked", liked);
  }
  paint();

  btn.addEventListener("click", async () => {
    if (own) return;
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
    btn.classList.toggle("just-liked", liked); // the leaf gives a little pop
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
  message.setAttribute("aria-live", "polite"); // read out by screen readers
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
  UI.reviewIcons(r).forEach((icon) => titleEl.append(" ", icon));
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
  const productLine = el("p", "review-product");
  if (!productParam && r.product_id) {
    // The product name opens that product's page
    const a = el("a", "product-link", product);
    a.href = "reviews.html?product=" + encodeURIComponent(r.product_id);
    productLine.appendChild(a);
    if (r.variation) productLine.append(" (" + r.variation + ")");
  } else {
    productLine.textContent = r.variation ? product + " (" + r.variation + ")" : product;
  }
  info.appendChild(productLine);
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
  // (one review has at most one standout, so this comes back as a single
  // record, not a list)
  const isStandout = Boolean(r.review_standouts && (!Array.isArray(r.review_standouts) || r.review_standouts.length));
  if (isStandout) {
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
  if (tags.children.length) info.appendChild(tags);

  productRow.appendChild(info);
  article.appendChild(productRow);

  const meta = el("div", "post-meta");
  meta.append(authorLink(r.profiles), UI.timeTag(r.created_at));
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
  actions.appendChild(buildLikeButton("review_likes", "review_id", r.id, r.review_likes || [], r.user_id));

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

  const newProduct = addingProduct;
  const productId = newProduct ? await saveNewProduct() : productSelect.value;
  if (!productId) return;

  const { data: saved, error } = await supabaseClient.from("reviews").insert({
    product_id: productId,
    user_id: currentUser.id,
    rating: Number(form.elements["rating"].value),
    title: titleInput.value.trim(),
    body: bodyInput.value.trim(),
    variation: (newProduct ? npVariation.value.trim() : variationSelect.value) || null,
    ...extras.get(),
    ...eventChoices(),
  }).select("held_at").single();

  if (error) {
    showFormError(newProduct
      ? "Your product was sent to the moderators, but your review couldn't be posted: " + error.message +
        " Your words are still here, so you can try again."
      : error.message);
    return;
  }
  if (newProduct) {
    messageEl.textContent = "Thanks! A moderator will check the new product soon, usually within a day. " +
      "Your review goes live as soon as it's approved, and we'll let you know.";
    messageEl.style.color = "var(--gold)";
    savedNewProductId = null;
    setAddingProduct(false);
    loadMyPendingProducts();
  } else if (saved && saved.held_at) {
    messageEl.textContent = "Thanks! Your review is waiting for a quick check by a moderator before everyone can see it.";
    messageEl.style.color = "var(--gold)";
  } else {
    messageEl.textContent = "";
  }
  form.reset();
  variationField.hidden = true;
  setWriting(false);
  loadReviews();
});

const brandSearch = buildBrandSearch();
const productDropdown = enhanceSelect(productSelect);
const variationDropdown = enhanceSelect(variationSelect);
const npCategoryDropdown = enhanceSelect(npCategory);
const npSubcategoryDropdown = enhanceSelect(npSubcategory);
buildRatingWidget();
const extras = buildExtras();
init();
