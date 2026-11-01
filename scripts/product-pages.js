// Byome: a page for every product, so search engines can find them.
//   node scripts/product-pages.js
// Reads the approved products and their published reviews from Supabase
// (the same public data anyone can see on the Reviews page, using the
// public key in supabase-client.js) and writes:
//   p/<brand-name-id>.html   one page per product: name, brand, average
//                            rating, shades, and the latest reviews, with
//                            a button to the full product page
//   p/index.html             every product, by brand
//   sitemap.xml              Byome's public pages, plus the product pages
// Pages for products that are gone are deleted. Products with no reviews
// yet still get a page, but search engines are asked to skip it until
// they have one.
// Runs every night on GitHub (.github/workflows/product-pages.yml).
// For testing without Supabase: BYOME_FIXTURE=file.json (with "products"
// and "reviews" lists in the same shape).

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "p");
const SITE = "https://byome.xyz";
const REVIEWS_SHOWN = 10;

// The public Supabase address and key, from the one file that holds them
function supabaseConfig() {
  const src = fs.readFileSync(path.join(root, "supabase-client.js"), "utf8");
  const url = (src.match(/SUPABASE_URL\s*=\s*"([^"]+)"/) || [])[1];
  const key = (src.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/) || [])[1];
  if (!url || !key) throw new Error("Couldn't find the Supabase address and key in supabase-client.js");
  return { url, key };
}

// Every row of a query, 1000 at a time
async function fetchAll(cfg, pathAndQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(cfg.url + "/rest/v1/" + pathAndQuery, {
      headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key, Range: from + "-" + (from + 999) },
    });
    if (!res.ok) throw new Error(pathAndQuery.split("?")[0] + ": " + res.status + " " + (await res.text()));
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function loadData() {
  if (process.env.BYOME_FIXTURE) return JSON.parse(fs.readFileSync(process.env.BYOME_FIXTURE, "utf8"));
  const cfg = supabaseConfig();
  const products = await fetchAll(cfg,
    "products?select=id,name,brand,category,subcategory,photo_url,variations&status=eq.approved&order=brand,name,id");
  const reviewColumns = "product_id,rating,title,body,created_at,would_repurchase,holy_grail,profiles!user_id(username)";
  const query = (extra) => "reviews?select=" + reviewColumns + extra + "&held_at=is.null&order=created_at.desc,id";
  // ("gifted" comes from database/2026-12-12-gifted-reviews.sql)
  let reviews;
  try { reviews = await fetchAll(cfg, query(",gifted")); } catch (e) { reviews = await fetchAll(cfg, query("")); }
  return { products, reviews };
}

// ---------- Helpers ----------
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function slugFor(p) {
  const words = (p.brand + " " + p.name).normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
  return (words || "product") + "-" + p.id.replace(/-/g, "").slice(0, 8);
}

function shorten(text, max) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function niceDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" });
}

function authorName(r) {
  const u = r.profiles && r.profiles.username;
  return !u || /^deleted-member/i.test(u) ? "Deleted member" : u;
}

function safePhoto(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.href : null;
  } catch (e) {
    return null;
  }
}

// The site's current ?v= version, so the pages load the same files
function siteVersion() {
  const m = fs.readFileSync(path.join(root, "index.html"), "utf8").match(/style\.css\?v=(\d+)/);
  return m ? m[1] : "1";
}

// ---------- Pages ----------
function pageShell({ title, description, canonical, noindex, jsonLd, main, v }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- Made by scripts/product-pages.js every night; changes here are overwritten -->
  <base href="/" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(canonical)}" />
${noindex ? '  <meta name="robots" content="noindex" />\n' : ""}  <link rel="icon" type="image/png" sizes="32x32" href="favicon-badge-32.png" />
  <link rel="apple-touch-icon" href="apple-touch-icon.png?v=2" />
  <meta name="theme-color" content="#24402F" />
  <meta property="og:site_name" content="Byome" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:image" content="${SITE}/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="style.css?v=${v}" />
  <script src="a11y.js?v=${v}"></script>
${jsonLd ? '  <script type="application/ld+json">\n' + JSON.stringify(jsonLd, null, 2).replace(/</g, "\\u003c") + "\n  </script>\n" : ""}</head>
<body>
  <header class="site-header">
    <a href="index.html" class="logo"><img src="logo-wordmark.png" alt="Byome home" width="1052" height="261" /></a>
    <button id="menu-toggle" class="hamburger-btn" aria-expanded="false" aria-controls="nav-menu" aria-label="Open menu">
      <span></span><span></span><span></span>
    </button>
    <nav id="nav-menu" class="nav-menu" hidden></nav>
  </header>
${main}
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="supabase-client.js?v=${v}"></script>
  <script src="nav-menu.js?v=${v}"></script>
  <script src="ui.js?v=${v}"></script>
</body>
</html>
`;
}

function productPage(p, reviews, v) {
  const slug = slugFor(p);
  const canonical = SITE + "/p/" + slug + ".html";
  const full = p.brand + " " + p.name;
  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  const avgText = count ? (Math.round(avg * 10) / 10).toFixed(1) : null;
  const repurchase = reviews.filter((r) => r.would_repurchase === true || r.would_repurchase === false);
  const yes = repurchase.filter((r) => r.would_repurchase).length;
  const grails = reviews.filter((r) => r.holy_grail).length;
  const kind = [p.category, p.subcategory].filter(Boolean).join(" · ");
  const shades = (p.variations || []).filter(Boolean);
  const live = "reviews.html?product=" + encodeURIComponent(p.id);

  const description = count
    ? `${full}: ${avgText} out of 5 from ${count} honest review${count === 1 ? "" : "s"} on Byome, by people who actually use it.` +
      (repurchase.length ? ` ${Math.round((yes / repurchase.length) * 100)}% would buy it again.` : "")
    : `Be the first to review ${full} on Byome, the community for honest beauty reviews.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    brand: { "@type": "Brand", name: p.brand },
    url: canonical,
  };
  if (kind) jsonLd.category = kind;
  const photo = safePhoto(p.photo_url);
  if (photo) jsonLd.image = photo;
  if (count) {
    jsonLd.aggregateRating = { "@type": "AggregateRating", ratingValue: avgText, reviewCount: count, bestRating: 5, worstRating: 1 };
    jsonLd.review = reviews.slice(0, 5).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: authorName(r) },
      datePublished: String(r.created_at).slice(0, 10),
      name: r.title,
      reviewBody: shorten(r.body, 500),
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
    }));
  }

  let html = `  <main class="feed-page product-static">
    <p class="product-static-back"><a class="inline-link" href="p/index.html">All products</a> · <a class="inline-link" href="reviews.html">Reviews</a></p>
    <h1>${esc(p.name)}</h1>
    <div class="product-head">
${photo ? `      <img class="product-photo" src="${esc(photo)}" alt="${esc(p.name)} product photo" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()" />\n` : ""}      <div class="product-who">
        <p class="product-brand">${esc(p.brand)}</p>
${kind ? `        <span class="product-category-tag">${esc(kind)}</span>\n` : ""}      </div>
    </div>
`;
  if (count) {
    html += `    <p class="product-static-score"><strong>${avgText} out of 5 leaves</strong> from ${count} review${count === 1 ? "" : "s"}` +
      (repurchase.length ? ` · ${yes} of ${repurchase.length} would buy it again` : "") +
      (grails ? ` · ${grails} holy grail${grails === 1 ? "" : "s"}` : "") + `</p>\n`;
  } else {
    html += `    <p class="product-static-score">No reviews yet. Be the first!</p>\n`;
  }
  if (shades.length) html += `    <p class="product-variations"><strong>Comes in:</strong> ${esc(shades.join(", "))}</p>\n`;
  html += `    <p class="product-static-cta"><a class="btn btn-solid" href="${esc(live)}">${count ? "Read all reviews and write your own" : "Write the first review"}</a></p>\n`;

  if (count) {
    html += `\n    <h2 class="section-title">${count > REVIEWS_SHOWN ? "Latest reviews" : "Reviews"}</h2>\n`;
    reviews.slice(0, REVIEWS_SHOWN).forEach((r) => {
      const tags = [];
      if (r.holy_grail) tags.push("Holy grail");
      if (r.would_repurchase === true) tags.push("Would repurchase");
      if (r.would_repurchase === false) tags.push("Wouldn't repurchase");
      if (r.gifted) tags.push("Gifted");
      html += `    <article class="post product-static-review">
      <h3 class="post-title">${esc(r.title)}</h3>
      <p class="product-static-rating">${r.rating} out of 5 leaves${tags.length ? " · " + esc(tags.join(" · ")) : ""}</p>
      <p class="post-body">${esc(shorten(r.body, 700))}</p>
      <p class="product-static-by">${esc(authorName(r))} · ${esc(niceDate(r.created_at))}</p>
    </article>
`;
    });
    if (count > REVIEWS_SHOWN) {
      html += `    <p class="product-static-cta"><a class="btn btn-ghost" href="${esc(live)}">See all ${count} reviews</a></p>\n`;
    }
  }
  html += "  </main>";

  return {
    slug,
    indexable: count > 0,
    lastmod: count ? String(reviews[0].created_at).slice(0, 10) : null,
    html: pageShell({ title: `${full} reviews — Byome`, description, canonical, noindex: !count, jsonLd, main: html, v }),
  };
}

function indexPage(entries, v) {
  const byBrand = {};
  entries.forEach((e) => (byBrand[e.p.brand] = byBrand[e.p.brand] || []).push(e));
  const brands = Object.keys(byBrand).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  let main = `  <main class="feed-page product-static">
    <h1>All products</h1>
    <p>Every product on Byome, by brand. Missing one? <a class="inline-link" href="suggest-product.html">Suggest it</a>.</p>
`;
  brands.forEach((b) => {
    main += `\n    <h2 class="section-title">${esc(b)}</h2>\n    <ul class="product-static-list">\n`;
    byBrand[b].forEach((e) => {
      main += `      <li><a class="inline-link" href="p/${e.slug}.html">${esc(e.p.name)}</a>${e.count ? ` <span class="product-static-count">(${e.count} review${e.count === 1 ? "" : "s"})</span>` : ""}</li>\n`;
    });
    main += "    </ul>\n";
  });
  main += "  </main>";
  return pageShell({
    title: "All products — Byome",
    description: "Every beauty product on Byome, by brand: makeup, skincare, hair care, fragrance, body care and nails, with honest reviews from the people who use them.",
    canonical: SITE + "/p/index.html",
    main, v,
  });
}

// Byome's own public pages, then the product pages
const STATIC_PAGES = [
  ["", "daily", "1.0"],
  ["reviews.html", "daily", "0.9"],
  ["p/index.html", "daily", "0.8"],
  ["about.html", "monthly", "0.8"],
  ["faq.html", "monthly", "0.8"],
  ["events.html", "weekly", "0.6"],
  ["signup.html", "yearly", "0.5"],
  ["terms.html", "yearly", "0.3"],
  ["privacy.html", "yearly", "0.3"],
];

function sitemap(pages) {
  const urls = STATIC_PAGES.map(([u, freq, pri]) =>
    `  <url><loc>${SITE}/${u}</loc><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`);
  pages.filter((pg) => pg.indexable).forEach((pg) => {
    urls.push(`  <url><loc>${SITE}/p/${pg.slug}.html</loc>${pg.lastmod ? `<lastmod>${pg.lastmod}</lastmod>` : ""}<changefreq>weekly</changefreq><priority>0.7</priority></url>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Byome's public pages, for search engines. Made by scripts/product-pages.js every night. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

// ---------- Write it all ----------
(async function () {
  const { products, reviews } = await loadData();
  const v = siteVersion();
  const byProduct = {};
  reviews.forEach((r) => (byProduct[r.product_id] = byProduct[r.product_id] || []).push(r));

  fs.mkdirSync(outDir, { recursive: true });
  const written = new Set(["index.html"]);
  const entries = [];
  const pages = [];
  products.forEach((p) => {
    const list = byProduct[p.id] || [];
    const page = productPage(p, list, v);
    fs.writeFileSync(path.join(outDir, page.slug + ".html"), page.html);
    written.add(page.slug + ".html");
    pages.push(page);
    entries.push({ p, slug: page.slug, count: list.length });
  });
  fs.writeFileSync(path.join(outDir, "index.html"), indexPage(entries, v));
  // products that were removed or renamed: their old pages go
  fs.readdirSync(outDir).filter((f) => f.endsWith(".html") && !written.has(f))
    .forEach((f) => fs.unlinkSync(path.join(outDir, f)));
  fs.writeFileSync(path.join(root, "sitemap.xml"), sitemap(pages));
  console.log(`Wrote ${products.length} product pages (${pages.filter((pg) => pg.indexable).length} with reviews), the product index and the sitemap.`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
