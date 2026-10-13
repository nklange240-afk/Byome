// Byome Shop: spend Byome points on pots, plants and shelves.
// Prices, stock and balances are all checked by the database
// (buy_biome_item), so this page only has to show them.
const shopEl = document.getElementById("shop");
const balanceEl = document.getElementById("shop-balance");
const messageEl = document.getElementById("shop-message");

// The shop is in two halves, with an ad sign hanging between them
// (shopEl above it, shopMoreEl below)
const shopMoreEl = document.getElementById("shop-more");
const SECTIONS = [
  { kind: "pot", title: "Pots" },
  { kind: "plant", title: "Plants", empty: "Plants are on their way. Check back soon!" },
  { kind: "shelf", title: "Shelves", lower: true },
  { kind: "biome", title: "Biomes", lower: true },
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

// Shop order: by rarity (common first), then cheapest first within each.
const RARITY_ORDER = ["common", "uncommon", "rare", "heirloom"];
function rarityRank(item) {
  const i = RARITY_ORDER.indexOf(item.rarity);
  return i === -1 ? RARITY_ORDER.length : i;
}
function shopOrder(a, b) {
  return rarityRank(a) - rarityRank(b) || a.price - b.price || a.name.localeCompare(b.name);
}

function shopItems(extra) {
  return supabaseClient.from("biome_items")
    .select("key, kind, size, name, description, rarity, price, max_supply, max_per_member, sold, image, over_pot, " + extra + "starter")
    .eq("available", true).eq("starter", false).not("price", "is", null)
    .order("price").order("name");
}

// Limited-time items only show while their window is open
function inWindow(item) {
  const now = Date.now();
  return (!item.available_from || new Date(item.available_from).getTime() <= now)
    && (!item.available_until || new Date(item.available_until).getTime() >= now);
}

async function loadShop() {
  const [pointsRes, itemsRes, ownedRes] = await Promise.all([
    supabaseClient.from("user_points").select("biome, pending_biome").eq("user_id", currentUser.id).maybeSingle(),
    // (limited-time windows come from database/2026-10-29-events-halloween.sql)
    shopItems("available_from, available_until, ").then((res) => (res.error ? shopItems("") : res)),
    supabaseClient.from("biome_inventory").select("item_key").eq("user_id", currentUser.id),
  ]);

  shopEl.innerHTML = "";
  shopMoreEl.innerHTML = "";
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
    const items = itemsRes.data.filter((it) => it.kind === section.kind && inWindow(it)).sort(shopOrder);
    if (!items.length && !section.empty) return;
    const into = section.lower ? shopMoreEl : shopEl;
    into.appendChild(el("h2", "section-title", section.title));
    if (!items.length) {
      into.appendChild(UI.emptyState({ image: "biome-assets/plant-welcome-sprout.png", text: section.empty }));
      return;
    }
    const grid = el("div", "shop-grid");
    items.forEach((it) => grid.appendChild(buildCard(it, balance, owned[it.key] || 0)));
    into.appendChild(grid);
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

  const sparkly = item.rarity === "rare" || item.rarity === "heirloom";
  card.appendChild(el("span", "rarity rarity-" + item.rarity, (sparkly ? "\u2726 " : "") + item.rarity));
  card.appendChild(el("h3", null, item.name));
  if (item.description) card.appendChild(el("p", "shop-meta", item.description));
  if (item.available_until) {
    card.appendChild(el("p", "shop-meta shop-limited", "Limited time: in the shop until " +
      new Date(item.available_until).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric" }) + "."));
  }
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
      (item.kind === "biome" ? "! Choose it on Edit profile." : "! It's waiting on your profile: tap Edit my shelf to place it."), true);
    UI.celebrate({
      label: item.kind === "biome" ? "A new biome" : "New for your shelf",
      heading: item.name,
      text: (data && data.serial ? "Number " + data.serial + " of " + item.max_supply + ". " : "") +
        (item.kind === "biome" ? "Choose it on Edit profile to set your profile in it." : "It's waiting for you. Tap below to put it on your shelf."),
      item: item,
    });
    loadShop();
  });
  if (item.kind === "biome") card.appendChild(UI.previewButton(item));
  card.appendChild(buy);
  return card;
}

// ---------- The hanging ad signs ----------
// Ads only ever appear here in the Byome Shop, inside the hand-drawn
// signs, and never on Reviews or in the Community. The AdSense code is
// loaded on this page only. (In AdSense, keep Auto ads off, so Google
// never adds ads anywhere else.) Set AD_CLIENT to null to turn ads off;
// byome-shop.html?adpreview then shows the signs with sample ads.
// Two signs: one midway (between Plants and Shelves) and one at the
// bottom with the note about ads.
// Behind the bottom ad is one of Byome's own cards (HOUSE_ADS, picked at
// random), which shows whenever Google has no ad to fill the space; the
// middle sign just disappears instead, so cards never stack up. A card
// about an item (hideIfOwned) isn't shown to members who already own it.
const AD_CLIENT = "ca-pub-1517865451153702"; // Byome's AdSense account
const AD_SIGNS = [
  { box: "ad-sign-middle", slot: "5772047833" },             // "Byome 300x250 Mid-Scroll"
  { box: "ad-sign", slot: "4710247604", bottom: true },      // "Byome 300x250"
];

const HOUSE_ADS = [
  { image: "biome-assets/ad-house-thanks.png", text: "Thank you for joining Byome!" },
  { image: "biome-assets/ad-house-better-place.png", text: "You make Byome a better place!" },
  { image: "biome-assets/ad-house-terry.png", text: "Rare: Terry pot now available!", hideIfOwned: "terry" },
];

async function houseAd() {
  const items = HOUSE_ADS.filter((c) => c.hideIfOwned).map((c) => c.hideIfOwned);
  const { data } = await supabaseClient.from("biome_inventory").select("item_key")
    .eq("user_id", currentUser.id).in("item_key", items);
  const owned = new Set((data || []).map((r) => r.item_key));
  const cards = HOUSE_ADS.filter((c) => !owned.has(c.hideIfOwned));
  const card = cards[Math.floor(Math.random() * cards.length)];
  const img = el("img", "ad-house");
  img.src = card.image;
  img.alt = card.text;
  return img;
}

async function showAdSigns() {
  const preview = new URLSearchParams(window.location.search).has("adpreview");
  if (!AD_CLIENT && !preview) return;

  for (const [i, spot] of AD_SIGNS.entries()) {
    const box = document.getElementById(spot.box);
    const sign = el("aside", "ad-sign");
    // the word on the sign is painted; each sign gets its own name so
    // screen readers can tell them apart
    sign.setAttribute("aria-label", AD_SIGNS.length > 1 ? "Advertisement " + (i + 1) + " of " + AD_SIGNS.length : "Advertisement");
    const frame = el("img", "ad-sign-frame");
    frame.src = "biome-assets/ad-sign.png";
    frame.alt = "";
    const slot = el("div", "ad-slot");
    if (AD_CLIENT) {
      if (spot.bottom) slot.appendChild(await houseAd());
      const ad = el("ins", "adsbygoogle");
      ad.style.cssText = "display:inline-block;width:300px;height:250px";
      ad.dataset.adClient = AD_CLIENT;
      ad.dataset.adSlot = spot.slot;
      slot.appendChild(ad);
    } else {
      slot.classList.add("is-sample");
      slot.textContent = "Sample ad (300 × 250)";
    }
    sign.append(frame, slot);
    box.appendChild(sign);
    if (spot.bottom) {
      box.appendChild(el("p", "ad-note",
        "Ads help keep Byome running. They only appear here in the shop, never on Reviews or in the Community."));
    }
    box.hidden = false;
  }

  if (!AD_CLIENT) return;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + AD_CLIENT;
  document.head.appendChild(script);
  AD_SIGNS.forEach(() => (window.adsbygoogle = window.adsbygoogle || []).push({}));
}

(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }
  currentUser = data.session.user;
  loadShop();
  showAdSigns();
})();
