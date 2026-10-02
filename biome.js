// Biome shelf: draws a shelf with a pot (and maybe a plant) in each spot.
//
// Every position below was measured on the ORIGINAL 2700 x 3600 shelf
// artwork and is converted to a percentage of the shelf, so the whole
// thing scales cleanly to any screen size.
//
// Spots are numbered 0-3 (top row), 4-7 (middle row), 8-10 (bottom row).
const BIOME = (function () {
  // Bump this whenever you replace a picture in biome-assets/ with a new
  // drawing under the same name. Browsers keep old pictures for a while;
  // a new number makes every browser fetch the new ones straight away.
  const ART_VERSION = "2";

  function src(path) {
    return path + (path.indexOf("?") === -1 ? "?" : "&") + "v=" + ART_VERSION;
  }

  const CANVAS = { w: 2700, h: 3600 };

  // The three openings in the shelf, top to bottom. "floor" is the y position
  // of the board a pot sits on; "sink" is how far the pot sits down onto it,
  // so pots rest ON the shelf instead of floating. The bottom board shows
  // more of its top surface, so pots sit further onto it.
  const ROWS = [
    { size: "small", count: 4, floor: 1189, sink: 25, name: "top shelf" },
    { size: "small", count: 4, floor: 2096, sink: 40, name: "middle shelf" },
    { size: "medium", count: 3, floor: 3212, sink: 90, name: "bottom shelf" },
  ];
  const OPENING = { left: 374, width: 1905 };

  // Pot and plant art: a square canvas (512px small, 640px medium) with the
  // same proportions at either size. Measured on the 512 canvas.
  const ART = { canvas: 512, left: 46, top: 54, width: 404, height: 392, bottom: 445 };

  // A potted plant is a sandwich, back to front:
  //   1. the complete pot   2. the plant   3. the pot's front overlay
  // The overlay is the front of the rim and body only, saved next to the pot
  // with "-front" added to its name (pot-terra-cotta.png ->
  // pot-terra-cotta-front.png). It hides the bottom of the plant and its soil,
  // so the plant looks like it's growing inside the pot.
  // The plant's bottom edge (y=462 on its canvas) lines up with y=110 on
  // the pot's canvas, which puts a soil mound drawn from about y=400 inside
  // the pot opening.
  const PLANT_BASE_Y = 462;
  const POT_SEAT_Y = 110;

  function frontOf(image) {
    return image.replace(/\.png$/, "-front.png");
  }

  // How wide a pot's art appears on the shelf, in shelf pixels.
  // Medium is 1.25x small (a 640 canvas), the most that fits the bottom row.
  const ART_WIDTH = { small: 404, medium: 505 };

  function sizeOfSlot(slot) {
    return slot >= 8 ? "medium" : "small";
  }

  // Where each spot's canvas box goes, as percentages of the shelf
  function layoutSlots() {
    const slots = [];
    let index = 0;
    ROWS.forEach((row) => {
      const artWidth = ART_WIDTH[row.size];
      const scale = artWidth / ART.width;
      const gap = (OPENING.width - row.count * artWidth) / (row.count + 1);
      for (let i = 0; i < row.count; i++) {
        const artLeft = OPENING.left + gap + i * (artWidth + gap);
        const left = artLeft - ART.left * scale;
        const top = row.floor + row.sink - ART.bottom * scale;
        slots.push({
          slot: index++,
          size: row.size,
          label: "Spot " + (i + 1) + " on the " + row.name,
          left: (left / CANVAS.w) * 100,
          top: (top / CANVAS.h) * 100,
          width: ((ART.canvas * scale) / CANVAS.w) * 100,
        });
      }
    });
    return slots;
  }

  function img(className, path, alt) {
    const i = document.createElement("img");
    i.className = className;
    i.src = src(path);
    i.alt = alt;
    i.loading = "lazy";
    i.decoding = "async";
    i.addEventListener("error", () => i.remove());
    return i;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const RARITY = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary" };

  // One item's part of the info box: name, rarity, its story, how it was earned
  function describe(item, prefix) {
    const part = el("div", "biome-tip-item");
    const head = el("div", "biome-tip-head");
    head.appendChild(el("strong", null, (prefix || "") + item.name));
    if (item.rarity) head.appendChild(el("span", "rarity rarity-" + item.rarity, RARITY[item.rarity] || item.rarity));
    part.appendChild(head);
    if (item.description) part.appendChild(el("p", "biome-tip-text", item.description));
    if (item.earnedWith) part.appendChild(el("p", "biome-tip-earned", "Earned with \u201c" + item.earnedWith + "\u201d"));
    return part;
  }

  // The info box shown when you hover over (or tap, or tab to) a plant, pot
  // or the shelf. It never takes clicks, sits above the item, and disappears
  // when you move away, tap elsewhere or press Escape.
  function addInfoBox(wrap, shelf) {
    const tip = el("div", "biome-tip");
    tip.id = "biome-tip-" + Math.random().toString(36).slice(2);
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    wrap.appendChild(tip);
    let current = null;

    function contentFor(target) {
      if (target === wrap) return shelf ? [describe(shelf)] : null;
      const pot = target._pot, plant = target._plant;
      return plant ? [describe(plant), describe(pot, "In a ")] : [describe(pot)];
    }

    function show(target) {
      const parts = contentFor(target);
      if (!parts) return;
      current = target;
      tip.replaceChildren(...parts);
      tip.hidden = false;

      // Place it above the item (above the plant if there is one), centred,
      // kept inside the shelf; below the item if there's no room above.
      const box = wrap.getBoundingClientRect();
      const anchor = target === wrap ? wrap.querySelector(".biome-shelf-img") : (target.querySelector(".biome-plant") || target.querySelector(".biome-pot"));
      const r = (anchor || target).getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = r.left - box.left + r.width / 2 - tw / 2;
      left = Math.max(4, Math.min(left, box.width - tw - 4));
      // Above the item, even if that pokes out over the top of the shelf
      // (so it never covers other plants); below only if it would go off
      // the top of the screen.
      let top = r.top - box.top - th - 6;
      if (target === wrap) top = box.height * 0.03; // shelf: along the top board
      else if (box.top + top < 4) top = r.bottom - box.top + 6;
      tip.style.left = left + "px";
      tip.style.top = top + "px";
      target.setAttribute("aria-describedby", tip.id);
    }

    function hide() {
      if (current) current.removeAttribute("aria-describedby");
      current = null;
      tip.hidden = true;
    }

    function targetOf(node) {
      const spot = node.closest(".biome-slot");
      return spot || (node.classList.contains("biome-shelf-img") ? wrap : null);
    }

    let lastPointer = "mouse";
    let pressing = false; // a tap/click also focuses the item; let the click decide
    wrap.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; pressing = true; });
    wrap.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const t = targetOf(e.target);
      if (t && t !== current) show(t); else if (!t) hide();
    });
    wrap.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    // Tap (phones): tap an item to show its box, tap it again or anywhere else to hide
    wrap.addEventListener("click", (e) => {
      pressing = false;
      if (lastPointer === "mouse") return;
      const t = targetOf(e.target);
      if (!t || t === current) hide(); else show(t);
    });
    document.addEventListener("click", (e) => { if (current && !wrap.contains(e.target)) hide(); });
    // Keyboard: Tab to an item to show its box
    wrap.addEventListener("focusin", (e) => {
      if (pressing) return;
      const t = e.target === wrap ? wrap : targetOf(e.target);
      if (t) show(t);
    });
    wrap.addEventListener("focusout", (e) => { if (!wrap.contains(e.relatedTarget)) hide(); });
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  }

  // items:   { key: { name, image, rarity, description, earnedWith } } from biome_items
  // shelfKey: which shelf to draw
  // placed:  { slotNumber: { pot: key, plant: key or null } }
  // options: { editable, selected, onSelect(slot) } for arranging your own shelf
  function build(items, shelfKey, placed, options) {
    const opts = options || {};
    const wrap = document.createElement("div");
    wrap.className = "biome-shelf" + (opts.editable ? " is-editable" : "");
    wrap.setAttribute("role", "group");

    const shelf = items[shelfKey] || items["default-shelf"];
    wrap.setAttribute("aria-label", shelf ? "Biome shelf: " + shelf.name : "Biome shelf");
    if (shelf) wrap.appendChild(img("biome-shelf-img", shelf.image, ""));

    layoutSlots().forEach((s) => {
      const here = (placed && placed[s.slot]) || {};
      const pot = here.pot && items[here.pot];
      const plant = here.plant && items[here.plant];
      if (!pot && !opts.editable) return; // empty spots are only drawn while arranging

      const spot = document.createElement(opts.editable ? "button" : "div");
      spot.className = "biome-slot biome-slot-" + s.size + (pot ? "" : " is-empty");
      spot.style.left = s.left.toFixed(3) + "%";
      spot.style.top = s.top.toFixed(3) + "%";
      spot.style.width = s.width.toFixed(3) + "%";
      spot.dataset.slot = String(s.slot);

      const description = pot ? (plant ? plant.name + " in a " + pot.name.toLowerCase() : pot.name) : "empty";
      if (opts.editable) {
        spot.type = "button";
        spot.setAttribute("aria-label", s.label + ": " + description);
        spot.setAttribute("aria-pressed", String(opts.selected === s.slot));
        spot.appendChild(Object.assign(document.createElement("span"), { className: "biome-slot-ring" }));
        spot.addEventListener("click", () => opts.onSelect && opts.onSelect(s.slot));
      } else {
        // Focusable, so keyboard users can open the info box too
        spot.tabIndex = 0;
        spot.setAttribute("role", "img");
        spot.setAttribute("aria-label", description);
        spot._pot = pot;
        spot._plant = plant;
      }

      if (pot) spot.appendChild(img("biome-pot", pot.image, ""));
      if (pot && plant) {
        spot.appendChild(img("biome-plant", plant.image, ""));
        spot.appendChild(img("biome-pot-front", frontOf(pot.image), ""));
      }
      wrap.appendChild(spot);
    });

    if (!opts.editable) {
      wrap.tabIndex = 0; // focusing the shelf itself shows the shelf's info
      addInfoBox(wrap, shelf);
    }
    return wrap;
  }

  return { build, layoutSlots, sizeOfSlot, src, ART };
})();
