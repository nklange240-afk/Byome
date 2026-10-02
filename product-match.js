// Spots products that are probably already listed (or already suggested),
// shared by the suggest page and the Moderate page.
//
// Two products "look the same" when their brands match (ignoring capitals,
// accents and punctuation, so "e.l.f." matches "elf" and "L'Oréal" matches
// "loreal") and most of the words in their names match, in any order.
const PRODUCT_MATCH = (function () {
  // Words that don't help tell products apart
  const FILLER = new Set(["the", "and", "a", "an", "by", "for", "with", "of", "in"]);

  function words(text) {
    return (text || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "") // drop accents
      .toLowerCase()
      .replace(/[-/&+,]/g, " ")
      .replace(/[^a-z0-9\s]/g, "") // "e.l.f." -> "elf", "l'oreal" -> "loreal"
      .split(/\s+/)
      .filter((w) => w && !FILLER.has(w));
  }

  function sameBrand(a, b) {
    const x = words(a).join(" "), y = words(b).join(" ");
    if (!x || !y) return false;
    // "elf" and "elf cosmetics" count as the same brand
    return x === y || x.startsWith(y + " ") || y.startsWith(x + " ");
  }

  // Long words count as the same with a one-letter difference, so spelling
  // variants and small typos still match ("moisturising" / "moisturizing")
  function sameWord(a, b) {
    if (a === b) return true;
    if (a.length < 6 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  // 0 to 1: how much two names overlap, word by word
  function nameScore(a, b) {
    const x = new Set(words(a)), y = new Set(words(b));
    if (!x.size || !y.size) return 0;
    let shared = 0;
    x.forEach((w) => { if (Array.from(y).some((v) => sameWord(w, v))) shared++; });
    // every word of the shorter name appears in the longer one
    if (shared === Math.min(x.size, y.size)) return Math.max(0.9, shared / Math.max(x.size, y.size));
    return shared / (x.size + y.size - shared);
  }

  // Products in `list` that look like `target` ({ id?, brand, name }),
  // best match first. Each result is { product, score } (1 = identical).
  function similar(target, list) {
    return list
      .filter((p) => p.id !== target.id && sameBrand(p.brand, target.brand))
      .map((p) => ({ product: p, score: nameScore(p.name, target.name) }))
      .filter((m) => m.score >= 0.6)
      .sort((a, b) => b.score - a.score);
  }

  return { similar };
})();
