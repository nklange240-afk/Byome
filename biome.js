// Biome shelf: draws a shelf with a pot (and maybe a plant) in each spot.
//
// Every position below was measured on the ORIGINAL 2700 x 3600 shelf
// artwork and is converted to a percentage of the shelf, so the whole
// thing scales cleanly to any screen size.
//
// Spots are numbered 0-3 (top row), 4-7 (middle row), 8-10 (bottom row).
const BIOME = (function () {
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

  // A plant's bottom edge (y=462 on its canvas, the bottom of the art area)
  // lands at y=80 on the pot's canvas: inside the pot opening, just behind
  // the front of the rim. The plant is drawn in front of the pot.
  const PLANT_BASE_Y = 462;
  const POT_SEAT_Y = 80;

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

  function img(className, src, alt) {
    const i = document.createElement("img");
    i.className = className;
    i.src = src;
    i.alt = alt;
    i.loading = "lazy";
    i.decoding = "async";
    i.addEventListener("error", () => i.remove());
    return i;
  }

  // items:   { key: { name, image, ... } } from the biome_items table
  // shelfKey: which shelf to draw
  // placed:  { slotNumber: { pot: key, plant: key or null } }
  // options: { editable, selected, onSelect(slot) } for arranging your own shelf
  function build(items, shelfKey, placed, options) {
    const opts = options || {};
    const wrap = document.createElement("div");
    wrap.className = "biome-shelf" + (opts.editable ? " is-editable" : "");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Biome shelf");

    const shelf = items[shelfKey] || items["default-shelf"];
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
        spot.title = description;
      }

      if (pot) spot.appendChild(img("biome-pot", pot.image, opts.editable ? "" : pot.name));
      if (pot && plant) spot.appendChild(img("biome-plant", plant.image, opts.editable ? "" : plant.name));
      wrap.appendChild(spot);
    });
    return wrap;
  }

  return { build, layoutSlots, sizeOfSlot, ART, PLANT_TOP: ((POT_SEAT_Y - PLANT_BASE_Y) / ART.canvas) * 100 };
})();
