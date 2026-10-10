// Biome shop: spend Byome points on pots, plants and shelves.
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
  if (ownedCount) pic.appendChild(el("span", "owned-tag", ownedCount > 1 ? "Owned ×" + ownedCount : "Owned"));
  card.appendChild(pic);

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
  card.appendChild(buy);
  return card;
}

(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }
  currentUser = data.session.user;
  loadShop();
})();
