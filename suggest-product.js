const form = document.getElementById("suggest-form");
const messageEl = document.getElementById("suggest-message");
const doneLink = document.getElementById("done-link");
const categorySelect = document.getElementById("product-category");
const subcategorySelect = document.getElementById("product-subcategory");

let currentUser = null;

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
}

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
