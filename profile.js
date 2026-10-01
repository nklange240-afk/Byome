// Public profile page. profile.html?user=NAME shows that member;
// plain profile.html shows your own (plus your points).
const params = new URLSearchParams(window.location.search);

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

function starIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "star-icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M12 2c.7 5.6 3.9 9.3 10 10-6.1.7-9.3 4.4-10 10-.7-5.6-3.9-9.3-10-10 6.1-.7 9.3-4.4 10-10z");
  svg.appendChild(path);
  return svg;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

function showMessage(container, text) {
  container.innerHTML = "";
  container.appendChild(el("p", "feed-empty", text));
}

function metaRow(createdAt, editedAt) {
  const meta = el("div", "post-meta");
  const time = el("time", null, formatDate(createdAt));
  time.dateTime = createdAt;
  meta.appendChild(time);
  if (editedAt) meta.appendChild(el("span", "edited-tag", "edited"));
  return meta;
}

function buildPostCard(p) {
  const article = el("article", "post");
  if (p.title) article.appendChild(el("h2", "post-title", p.title));
  article.append(metaRow(p.created_at, p.edited_at), el("p", "post-body", p.body));
  const likes = p.likes ? p.likes.length : 0;
  const comments = p.comments && p.comments.length ? p.comments[0].count : 0;
  article.appendChild(el("p", "profile-counts", plural(likes, "like") + " · " + plural(comments, "comment")));
  return article;
}

function buildReviewCard(r) {
  const article = el("article", "post");
  article.appendChild(el("h2", "post-title", r.title));

  const product = r.products ? r.products.brand + " — " + r.products.name : "Unknown product";
  article.appendChild(el("p", "review-product", r.variation ? product + " (" + r.variation + ")" : product));

  const rating = el("div", "review-rating");
  for (let i = 1; i <= 5; i++) {
    const s = el("span", "rating-leaf static" + (i <= r.rating ? " on" : ""));
    s.appendChild(leafIcon());
    rating.appendChild(s);
  }
  rating.setAttribute("role", "img");
  rating.setAttribute("aria-label", r.rating + " out of 5");
  article.appendChild(rating);

  const tags = el("div", "review-tags");
  if (r.review_standouts && r.review_standouts.length) tags.appendChild(el("span", "review-tag standout", "Standout review"));
  if (r.holy_grail) {
    const tag = el("span", "review-tag holy-grail");
    tag.append(starIcon(), document.createTextNode("Holy grail"));
    tags.appendChild(tag);
  }
  if (r.would_repurchase !== null && r.would_repurchase !== undefined) {
    tags.appendChild(el("span", "review-tag", r.would_repurchase ? "Would repurchase" : "Wouldn't repurchase"));
  }
  if (tags.children.length) article.appendChild(tags);

  article.append(metaRow(r.created_at, r.edited_at), el("p", "post-body", r.body));
  const likes = r.review_likes ? r.review_likes.length : 0;
  article.appendChild(el("p", "profile-counts", plural(likes, "like")));
  return article;
}

// Your own points: balances, what's still pending, and recent activity
async function showPoints(userId) {
  const panel = document.getElementById("points-panel");

  const [totalsRes, ledgerRes, rulesRes] = await Promise.all([
    supabaseClient.from("user_points")
      .select("community, biome, pending_community, pending_biome").eq("user_id", userId).maybeSingle(),
    supabaseClient.from("point_ledger")
      .select("action, community_points, biome_points, created_at, available_at, revoked_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabaseClient.from("point_rules").select("action, label"),
  ]);
  if (totalsRes.error && ledgerRes.error) return; // points aren't set up yet

  const totals = totalsRes.data || { community: 0, biome: 0, pending_community: 0, pending_biome: 0 };
  const labels = {};
  (rulesRes.data || []).forEach((r) => { labels[r.action] = r.label; });

  panel.innerHTML = "";
  panel.appendChild(el("h2", "section-title", "Your points"));

  const stats = el("div", "points-stats");
  [["Community points", totals.community], ["Biome points", totals.biome]].forEach(([label, value]) => {
    const box = el("div", "points-stat");
    box.append(el("span", "points-number", String(value)), el("span", "points-label", label));
    stats.appendChild(box);
  });
  panel.appendChild(stats);

  if (totals.pending_community || totals.pending_biome) {
    panel.appendChild(el("p", "points-pending",
      "Pending: +" + totals.pending_community + " community and +" + totals.pending_biome +
      " biome points, available after the waiting period."));
  }
  panel.appendChild(el("p", "points-note",
    "Community points are for future real-world rewards. Biome points will buy plants and pots for your biome (coming soon)."));

  const rows = ledgerRes.data || [];
  if (rows.length) {
    panel.appendChild(el("h3", "points-subtitle", "Recent activity"));
    const list = el("ul", "points-log");
    rows.forEach((row) => {
      let text = (labels[row.action] || row.action) + ": +" + row.community_points +
        " community, +" + row.biome_points + " biome";
      let cls = "";
      if (row.revoked_at) { text += " (removed)"; cls = "is-revoked"; }
      else if (new Date(row.available_at) > new Date()) text += " (available " + formatDate(row.available_at) + ")";
      list.appendChild(el("li", cls, text));
    });
    panel.appendChild(list);
  }
  panel.hidden = false;
}

(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }
  const me = data.session.user.id;
  const wanted = params.get("user");

  const nameEl = document.getElementById("profile-name");
  const reviewsEl = document.getElementById("profile-reviews");
  const postsEl = document.getElementById("profile-posts");

  let query = supabaseClient.from("profiles").select("id, username, created_at");
  query = wanted ? query.eq("username", wanted) : query.eq("id", me);
  const { data: profile } = await query.maybeSingle();

  if (!profile) {
    nameEl.textContent = "Profile not found";
    showMessage(reviewsEl, "We couldn't find that member.");
    showMessage(postsEl, "");
    return;
  }

  document.title = profile.username + " — byome";
  nameEl.textContent = profile.username;
  if (profile.created_at) {
    document.getElementById("profile-since").textContent =
      "Member since " + new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  if (profile.id === me) showPoints(profile.id);

  const [reviewsRes, postsRes] = await Promise.all([
    supabaseClient.from("reviews")
      .select("id, rating, title, body, variation, would_repurchase, holy_grail, created_at, edited_at, products!product_id(name, brand), review_likes(user_id), review_standouts(review_id)", { count: "exact" })
      .eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30),
    supabaseClient.from("posts")
      .select("id, title, body, created_at, edited_at, likes(user_id), comments(count)", { count: "exact" })
      .eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30),
  ]);

  document.getElementById("profile-stats").textContent =
    plural(reviewsRes.count || 0, "review") + " · " + plural(postsRes.count || 0, "post");

  reviewsEl.innerHTML = "";
  if (reviewsRes.error) showMessage(reviewsEl, "Couldn't load reviews: " + reviewsRes.error.message);
  else if (!reviewsRes.data.length) showMessage(reviewsEl, "No reviews yet.");
  else reviewsRes.data.forEach((r) => reviewsEl.appendChild(buildReviewCard(r)));

  postsEl.innerHTML = "";
  if (postsRes.error) showMessage(postsEl, "Couldn't load posts: " + postsRes.error.message);
  else if (!postsRes.data.length) showMessage(postsEl, "No posts yet.");
  else postsRes.data.forEach((p) => postsEl.appendChild(buildPostCard(p)));
})();
