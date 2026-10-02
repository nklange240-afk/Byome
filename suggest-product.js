const form = document.getElementById("suggest-form");
const messageEl = document.getElementById("suggest-message");
const doneLink = document.getElementById("done-link");
const categorySelect = document.getElementById("product-category");
const subcategorySelect = document.getElementById("product-subcategory");

let currentUser = null;
let knownProducts = []; // approved products, plus your own pending suggestions

const SUBCATEGORIES = {
  "Hair Care": ["Shampoo & Conditioner", "Styling", "Treatments & Masks", "Scalp Care", "Tools & Accessories"],
  "Body Care": ["Body Wash & Soap", "Lotion & Moisturizer", "Exfoliants", "Sun Care", "Deodorant"],
  "Makeup": ["Eyes", "Lips", "Complexion", "Cheeks", "Brows", "Tools & Brushes"],
  "Skincare": ["Cleansers", "Moisturizers", "Serums & Treatments", "Masks", "Eye Care", "Sun Care"],
  "Fragrance": ["Perfume", "Body Spray", "Rollerballs & Travel"],
  "Nail Products": ["Polish", "Care & Treatment", "Tools", "Nail Art"],
};

form.addEventListener("reset", () => {
  subcategorySelect.innerHTML = "";
  subcategorySelect.appendChild(new Option("Choose a category first", ""));
  subcategorySelect.disabled = true;
});

categorySelect.addEventListener("change", () => {
  const options = SUBCATEGORIES[categorySelect.value] || [];
  subcategorySelect.innerHTML = "";

  if (options.length === 0) {
    subcategorySelect.appendChild(new Option("Choose a category first", ""));
    subcategorySelect.disabled = true;
    return;
  }

  subcategorySelect.appendChild(new Option("Choose a subcategory...", ""));
  options.forEach((label) => subcategorySelect.appendChild(new Option(label, label)));
  subcategorySelect.disabled = false;
});

async function init() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
    return;
  }

  currentUser = data.session.user;

  const { data: products } = await supabaseClient
    .from("products").select("id, name, brand, status, suggested_by").neq("status", "rejected");
  knownProducts = products || [];
}

// ---------- "Is it already here?" ----------
// While you type, list products that look like the one you're entering.
// It's only a heads-up: you can still submit.
const nameInput = document.getElementById("product-name");
const brandInput = document.getElementById("product-brand");
const similarBox = document.getElementById("similar-products");

function currentMatches() {
  return PRODUCT_MATCH.similar({ brand: brandInput.value, name: nameInput.value }, knownProducts);
}

function showSimilar() {
  const matches = currentMatches().slice(0, 3);
  similarBox.innerHTML = "";
  similarBox.hidden = matches.length === 0;
  if (!matches.length) return;

  const title = document.createElement("p");
  title.className = "similar-title";
  title.textContent = matches.length === 1 ? "Is it this one? It's already on byome:" : "Is it one of these? They're already on byome:";
  const list = document.createElement("ul");
  matches.forEach(({ product }) => {
    const li = document.createElement("li");
    const label = product.brand + " \u2014 " + product.name;
    if (product.status === "approved") {
      const a = document.createElement("a");
      a.className = "inline-link";
      a.href = "reviews.html?q=" + encodeURIComponent(product.brand + " " + product.name);
      a.textContent = label;
      li.append(a);
    } else {
      li.textContent = label + " (you suggested this already; it's waiting for a moderator)";
    }
    list.appendChild(li);
  });
  similarBox.append(title, list);
}

let similarTimer = null;
[nameInput, brandInput].forEach((input) => input.addEventListener("input", () => {
  clearTimeout(similarTimer);
  similarTimer = setTimeout(showSimilar, 250);
}));
form.addEventListener("reset", () => { similarBox.hidden = true; });

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("product-name").value.trim();
  const brand = document.getElementById("product-brand").value.trim();
  const photoUrl = document.getElementById("product-photo").value.trim();
  const variationsRaw = document.getElementById("product-variations").value.trim();

  // Turn "Vanilla, Mint, Rose" into ["Vanilla", "Mint", "Rose"],
  // trimming whitespace and dropping any empty entries
  const variations = variationsRaw
    ? variationsRaw.split(",").map((v) => v.trim()).filter((v) => v.length > 0)
    : [];

  // A near-certain match gets one last check before submitting
  const best = currentMatches()[0];
  if (best && best.score === 1 &&
      !confirm(best.product.brand + " \u2014 " + best.product.name + " looks like the same product. Submit anyway?")) {
    return;
  }

  messageEl.textContent = "Submitting...";
  messageEl.style.color = "var(--cream)";
  doneLink.hidden = true;

  const { error } = await supabaseClient.from("products").insert({
    name: name,
    brand: brand,
    category: categorySelect.value,
    subcategory: subcategorySelect.value,
    photo_url: photoUrl || null,
    variations: variations,
    suggested_by: currentUser.id,
  });

  if (error) {
    messageEl.textContent = error.message;
    messageEl.style.color = "#E07A5F";
    return;
  }

  messageEl.textContent = "Thanks! A moderator will review your suggestion soon.";
  messageEl.style.color = "var(--gold)";
  form.reset();

  // Show the Done button, which goes back to the main feed
  doneLink.hidden = false;
  doneLink.focus();
});

init();
