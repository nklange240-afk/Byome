// Byome Shop: spend Byome points on pots, plants and shelves.
// Prices, stock and balances are all checked by the database
// (buy_biome_item), so this page only has to show them.
const shopEl = document.getElementById("shop");
const balanceEl = document.getElementById("shop-balance");
const messageEl = document.getElementById("shop-message");

const SECTIONS = [
  { kind: "pot", title: "Pots" },
  { kind: "plant", title: "Plants", empty: "Plants are on their way. Check back soon!" },
  { kind: "shelf", title: "Shelves" },
  { kind: "biome", title: "Biomes" },
];

let currentUser = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

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

function showMessage(text, good) {
  messageEl.textContent = text;
  messageEl.style.color = good ? "var(--gold)" : "#E07A5F";
}

async function loadShop() {
  const [pointsRes, itemsRes, ownedRes] = await Promise.all([
    supabaseClient.from("user_points").select("biome, pending_biome").eq("user_id", currentUser.id).maybeSingle(),
    supabaseClient.from("biome_items")
      .select("key, kind, size, name, description, rarity, price, max_supply, max_per_member, sold, image, over_pot")
      .eq("available", true).eq("starter", false).not("price", "is", null)
      .order("sort_order").order("price"),
    supabaseClient.from("biome_inventory").select("item_key").eq("user_id", currentUser.id),
  ]);

  shopEl.innerHTML = "";
  if (itemsRes.error) {
    shopEl.appendChild(el("p", "feed-empty", "The shop isn't open yet. Check back soon!"));
    return;
  }

  const balance = pointsRes.data ? pointsRes.data.biome : 0;
  const pending = pointsRes.data ? pointsRes.data.pending_biome : 0;
  balanceEl.innerHTML = "";
  balanceEl.append(leafIcon(), el("strong", null, String(balance)), el("span", null, "Byome points"));
  if (pending) balanceEl.appendChild(el("span", "shop-meta", "(+" + pending + " pending)"));

  const owned = {};
  (ownedRes.data || []).forEach((row) => { owned[row.item_key] = (owned[row.item_key] || 0) + 1; });

  SECTIONS.forEach((section) => {
    const items = itemsRes.data.filter((it) => it.kind === section.kind);
    if (!items.length && !section.empty) return;
    shopEl.appendChild(el("h2", "section-title", section.title));
    if (!items.length) {
      shopEl.appendChild(UI.emptyState({ image: "biome-assets/plant-welcome-sprout.png", text: section.empty }));
      return;
    }
    const grid = el("div", "shop-grid");
    items.forEach((it) => grid.appendChild(buildCard(it, balance, owned[it.key] || 0)));
    shopEl.appendChild(grid);
  });
}

function buildCard(item, balance, ownedCount) {
  const card = el("article", "shop-card rarity-edge-" + item.rarity);

  // Plants are shown in the starter pot; rare things sparkle
  const pic = UI.itemArt(item, "shop-art");
  pic.setAttribute("role", "img");
  pic.setAttribute("aria-label", item.name);
  card.appendChild(pic);
  // Biomes can be previewed: click the picture (or rest the mouse on it)
  if (item.kind === "biome") {
    pic.classList.add("is-previewable");
    pic.addEventListener("click", () => UI.openBiomePreview(item));
    UI.previewOnHover(pic, item);
  }
  if (ownedCount) card.appendChild(el("span", "owned-tag", ownedCount > 1 ? "Owned ×" + ownedCount : "Owned"));

  const sparkly = item.rarity === "rare" || item.rarity === "legendary";
  card.appendChild(el("span", "rarity rarity-" + item.rarity, (sparkly ? "\u2726 " : "") + item.rarity));
  card.appendChild(el("h3", null, item.name));
  if (item.description) card.appendChild(el("p", "shop-meta", item.description));
  if (item.size) card.appendChild(el("p", "shop-meta", item.size === "small" ? "Can be placed on the top two shelves" : "Can be placed on the bottom shelf"));
  if (item.kind === "biome") card.appendChild(el("p", "shop-meta", "Sets the scene on your profile. Choose it on Edit profile."));

  const price = el("p", "shop-price");
  price.append(leafIcon(), el("span", null, String(item.price)));
  card.appendChild(price);

  const left = item.max_supply ? item.max_supply - item.sold : null;
  if (item.max_supply) {
    card.appendChild(el("p", "shop-meta", left > 0
      ? "Limited edition: " + left + " of " + item.max_supply + " left"
      : "Limited edition: sold out"));
  }
  if (item.max_per_member) card.appendChild(el("p", "shop-meta", "Limit " + item.max_per_member + " per member"));

  const buy = el("button", "btn btn-solid", "Buy");
  buy.type = "button";
  if (left !== null && left <= 0) { buy.disabled = true; buy.textContent = "Sold out"; }
  else if (item.kind === "shelf" && ownedCount) { buy.disabled = true; buy.textContent = "Owned"; }
  else if (item.max_per_member && ownedCount >= item.max_per_member) { buy.disabled = true; buy.textContent = "Owned"; }
  else if (balance < item.price) { buy.disabled = true; buy.textContent = "Need " + (item.price - balance) + " more"; }

  buy.addEventListener("click", async () => {
    if (!confirm("Buy the " + item.name.toLowerCase() + " for " + item.price + " Byome points?")) return;
    buy.disabled = true;
    const { data, error } = await supabaseClient.rpc("buy_biome_item", { p_key: item.key });
    if (error) {
      showMessage(error.message, false);
      loadShop();
      return;
    }
    showMessage("You bought the " + item.name.toLowerCase() +
      (data && data.serial ? " (#" + data.serial + " of " + item.max_supply + ")" : "") +
      (item.kind === "biome" ? "! Choose it on Edit profile." : "! Put it on your shelf from your profile."), true);
    UI.celebrate({
      label: "New for your biome",
      heading: item.name,
      text: (data && data.serial ? "Number " + data.serial + " of " + item.max_supply + ". " : "") +
        (item.kind === "biome" ? "Choose it on Edit profile to set your profile in it." : "Arrange it on your shelf from your profile."),
      item: item,
    });
    loadShop();
  });
  if (item.kind === "biome") card.appendChild(UI.previewButton(item));
  card.appendChild(buy);
  return card;
}

// ---------- The hanging ad sign ----------
// Ads only ever appear here in the Byome Shop, inside the hand-drawn sign,
// and never on Reviews or in the Community. The AdSense code is loaded
// on this page only. (In AdSense, keep Auto ads off, so Google never adds
// ads anywhere else.) Set AD_CLIENT to null to turn ads off;
// biome-shop.html?adpreview then shows the sign with a sample ad.
// Behind the ad is Byome's own "Thank you for joining Byome!" card, which
// shows whenever Google has no ad to fill the space.
const AD_CLIENT = "ca-pub-1517865451153702"; // Byome's AdSense account
const AD_SLOT = "4710247604";                // the "Byome 300x250" ad unit

function showAdSign() {
  const preview = new URLSearchParams(window.location.search).has("adpreview");
  if (!(AD_CLIENT && AD_SLOT) && !preview) return;
  const box = document.getElementById("ad-sign");

  const sign = el("aside", "ad-sign");
  sign.setAttribute("aria-label", "Advertisement"); // the word on the sign is painted
  const frame = el("img", "ad-sign-frame");
  frame.src = "biome-assets/ad-sign.png";
  frame.alt = "";
  const slot = el("div", "ad-slot");
  if (AD_CLIENT && AD_SLOT) {
    const thanks = el("img", "ad-house");
    thanks.src = "biome-assets/ad-house-thanks.png";
    thanks.alt = "Thank you for joining Byome!";
    slot.appendChild(thanks);
    const ad = el("ins", "adsbygoogle");
    ad.style.cssText = "display:inline-block;width:300px;height:250px";
    ad.dataset.adClient = AD_CLIENT;
    ad.dataset.adSlot = AD_SLOT;
    slot.appendChild(ad);
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + AD_CLIENT;
    document.head.appendChild(script);
  } else {
    slot.classList.add("is-sample");
    slot.textContent = "Sample ad (300 × 250)";
  }
  sign.append(frame, slot);
  box.append(sign, el("p", "ad-note",
    "Ads help keep Byome running. They only appear here in the shop, never on Reviews or in the Community."));
  box.hidden = false;
  if (AD_CLIENT && AD_SLOT) (window.adsbygoogle = window.adsbygoogle || []).push({});
}

(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }
  currentUser = data.session.user;
  loadShop();
  showAdSign();
})();
