// Biome shelf: the shelf artwork with a pot in each slot.
//
// Every position below was measured on the ORIGINAL 2700 x 3600 shelf
// artwork and is converted to a percentage of the shelf, so the whole
// thing scales cleanly to any screen size.
const BIOME = (function () {
  const CANVAS = { w: 2700, h: 3600 };

  // The three openings in the shelf, top to bottom. "floor" is the y
  // position of the board a pot sits on. Row sizes: 4 small, 4 small, 3 medium.
  const ROWS = [
    { size: "small", count: 4, floor: 1189 },
    { size: "small", count: 4, floor: 2096 },
    { size: "medium", count: 3, floor: 3212 },
  ];
  const OPENING = { left: 374, width: 1905 };

  // The pot artwork is a 512px square. The pot itself is 404px wide and its
  // bottom edge is at y=445 within that square.
  const POT = { canvas: 512, artLeft: 46, artWidth: 404, artBottom: 445 };

  // How wide the pot should appear on the shelf. Medium pots reuse the small
  // pot artwork, scaled up, until real medium pots are drawn.
  const ART_WIDTH = { small: 404, medium: 560 };

  // How far a pot sinks onto the board, so it sits ON the shelf and doesn't float
  const SINK = 6;

  const POTS = {
    "terra-cotta": { name: "Terra cotta pot", image: "biome-assets/pot-terra-cotta.png" },
    "blue-speckled": { name: "Blue speckled pot", image: "biome-assets/pot-blue-speckled.png" },
    "painted-green": { name: "Painted green pot", image: "biome-assets/pot-painted-green.png" },
  };
  const DEFAULT_POT = "terra-cotta";

  const SHELVES = {
    default: "biome-assets/shelf-default.png",
    painted: "biome-assets/shelf-painted.png",
  };

  // Work out where each of the 11 slots goes (slot 0-3 top row, 4-7 middle, 8-10 bottom)
  function layoutSlots() {
    const slots = [];
    let index = 0;
    ROWS.forEach((row) => {
      const artWidth = ART_WIDTH[row.size];
      const scale = artWidth / POT.artWidth;
      const gap = (OPENING.width - row.count * artWidth) / (row.count + 1);
      for (let i = 0; i < row.count; i++) {
        const artLeft = OPENING.left + gap + i * (artWidth + gap);
        const left = artLeft - POT.artLeft * scale;
        const top = row.floor + SINK - POT.artBottom * scale;
        slots.push({
          slot: index++,
          size: row.size,
          left: (left / CANVAS.w) * 100,
          top: (top / CANVAS.h) * 100,
          width: ((POT.canvas * scale) / CANVAS.w) * 100,
        });
      }
    });
    return slots;
  }

  // chosen: { slotNumber: potKey }. Anything not chosen (or unknown) gets the default pot.
  function build(chosen, shelfKey) {
    const wrap = document.createElement("div");
    wrap.className = "biome-shelf";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Biome shelf");

    const shelf = document.createElement("img");
    shelf.className = "biome-shelf-img";
    shelf.src = SHELVES[shelfKey] || SHELVES.default;
    shelf.alt = "";
    wrap.appendChild(shelf);

    layoutSlots().forEach((s) => {
      const pot = POTS[chosen && chosen[s.slot]] || POTS[DEFAULT_POT];
      const img = document.createElement("img");
      img.className = "biome-pot biome-pot-" + s.size;
      img.src = pot.image;
      img.alt = pot.name;
      img.title = pot.name;
      img.loading = "lazy";
      img.dataset.slot = String(s.slot);
      img.style.left = s.left.toFixed(3) + "%";
      img.style.top = s.top.toFixed(3) + "%";
      img.style.width = s.width.toFixed(3) + "%";
      img.addEventListener("error", () => img.remove());
      wrap.appendChild(img);
    });
    return wrap;
  }

  return { layoutSlots, build, POTS, DEFAULT_POT };
})();
