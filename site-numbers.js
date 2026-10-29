// The Site numbers page: how Byome is doing (active members, new members
// settling in, activity, moderation, most-reviewed brands) and how often
// each hanging sign in the Byome Shop is seen and tapped. Only for people
// given access (database/2026-12-03-site-numbers.sql and
// database/2026-12-02-shop-sign-stats.sql).

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const box = document.getElementById("site-numbers");
const periods = document.getElementById("site-periods");

const num = (n) => Number(n).toLocaleString();
const rate = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 + "%" : "–");
function shortDate(day) {
  // (dates are Central-time days, so read them as plain dates)
  return new Date(day + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------- Building blocks ----------
function section(title, note) {
  const s = el("section", "stats-section");
  s.appendChild(el("h2", "section-title", title));
  if (note) s.appendChild(el("p", "stats-note", note));
  box.appendChild(s);
  return s;
}

// Big numbers with a label underneath each
function tiles(items) {
  const list = el("dl", "stat-tiles");
  items.forEach(([label, value]) => {
    const tile = el("div", "stat-tile");
    tile.append(el("dt", null, label), el("dd", null, value));
    list.appendChild(tile);
  });
  return list;
}

function table(caption, head, rows, compact) {
  const wrap = el("div", "stats-table-wrap");
  const t = el("table", compact ? "stats-table is-compact" : "stats-table");
  t.appendChild(el("caption", "visually-hidden", caption));
  const tr = el("tr");
  head.forEach((h, i) => {
    const th = el("th", i ? "is-number" : null, h);
    th.scope = "col";
    tr.appendChild(th);
  });
  t.appendChild(el("thead")).appendChild(tr);
  const body = el("tbody");
  rows.forEach((cells) => {
    const row = el("tr");
    cells.forEach((c, i) => {
      const cell = el(i ? "td" : "th", i ? "is-number" : null);
      if (!i) cell.scope = "row";
      if (c instanceof Node) cell.appendChild(c); else cell.textContent = c;
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
  t.appendChild(body);
  wrap.appendChild(t);
  return wrap;
}

// A number with a smaller line underneath (a share, or a date)
function withSub(main, sub) {
  const cell = el("span", null, main);
  if (sub) cell.appendChild(el("span", "stats-sub", sub));
  return cell;
}

// (the newest week comes first)
function weekLabel(week, i) {
  return withSub(shortDate(week), i === 0 ? "this week" : null);
}

function hours(h) {
  if (h === null || h === undefined) return "–";
  if (h < 1) return "Under an hour";
  if (h < 48) return Math.round(h) + (Math.round(h) === 1 ? " hour" : " hours");
  return Math.round(h / 24) + " days";
}

// ---------- The site ----------
function renderSite(r) {
  section("Members", "Active means they did something: posted, commented, reviewed, liked, voted, opened the daily surprise, suggested something or visited the shop. Just reading isn't recorded, so it's a slight undercount.")
    .appendChild(tiles([
      ["Active today", num(r.active.today)],
      ["Active in the last 7 days", num(r.active.week)],
      ["Active in the last 30 days", num(r.active.month)],
      ["Active in this period", num(r.active.period)],
      ["Joined in this period", num(r.members.new)],
      ["Members now", num(r.members.total)],
    ]));

  section("Activity in this period").appendChild(tiles([
    ["Reviews", num(r.activity.reviews)],
    ["Posts and polls", num(r.activity.posts)],
    ["Comments", num(r.activity.comments)],
    ["Helpful marks", num(r.activity.helpful)],
    ["Product and shade suggestions", num(r.activity.suggestions)],
  ]));

  const weeks = section("Week by week", "The last 12 weeks, newest first.");
  weeks.appendChild(el("h3", "stats-subtitle", "Members"));
  weeks.appendChild(table("Members, week by week", ["Week of", "Active", "Joined"],
    r.weeks.map((w, i) => [weekLabel(w.week, i), num(w.active), num(w.new)])));
  weeks.appendChild(el("h3", "stats-subtitle", "Activity"));
  weeks.appendChild(table("Activity, week by week", ["Week of", "Reviews", "Posts", "Comments"],
    r.weeks.map((w, i) => [weekLabel(w.week, i), num(w.reviews), num(w.posts), num(w.comments)])));

  const settling = section("New members settling in",
    "For each week's new members: Reviewed is how many wrote a review within 7 days of joining. Next week and Week after are how many were active again in the weeks that followed. A dash means it's too soon to tell.");
  const share = (n, joined) => (n === null ? "–" : withSub(num(n), joined ? Math.round((n / joined) * 100) + "%" : null));
  settling.appendChild(table("New members settling in", ["Week", "Joined", "Reviewed", "Next week", "Week after"],
    r.cohorts.map((c, i) => [weekLabel(c.week, i), num(c.joined),
      share(c.reviewed, c.joined), share(c.next_week, c.joined), share(c.week_after, c.joined)]), true));

  const m = r.moderation;
  section("Moderation", "Reports, held posts and suggestions. Waiting right now includes everything in the Moderate page's queues.")
    .appendChild(tiles([
      ["Reports in this period", num(m.reports)],
      ["Average wait for a report", hours(m.avg_hours)],
      ["Moderator decisions in this period", num(m.decisions)],
      ["Waiting right now", num(m.waiting)],
    ]));

  const top = section("Most reviewed in this period");
  if (!r.brands.length) {
    top.appendChild(el("p", "stats-note", "No reviews in this period."));
  } else {
    top.appendChild(el("h3", "stats-subtitle", "Brands"));
    top.appendChild(table("Most-reviewed brands", ["Brand", "Reviews", "Reviewers"],
      r.brands.map((b) => [b.brand, num(b.reviews), num(b.reviewers)])));
    top.appendChild(el("h3", "stats-subtitle", "Categories"));
    top.appendChild(table("Reviews by category", ["Category", "Reviews"],
      r.categories.map((c) => [c.category, num(c.reviews)])));
  }
}

// ---------- The shop's signs ----------
const KINDS = [
  { kind: "google", title: "Google ads", note: "Taps on Google's ads are in your AdSense reports, not here.", empty: "No Google ads seen in this period." },
  { kind: "house", title: "Byome cards", note: "Shown in the bottom sign whenever Google has no ad.", empty: "No Byome cards seen in this period." },
  { kind: "sponsor", title: "Sponsors",
    empty: "No sponsor signs yet. When you run one, add it to the shop_signs table (the steps are at the top of database/2026-12-02-shop-sign-stats.sql) and its numbers appear here." },
];

function totals(rows) {
  return rows.reduce((t, r) => ({
    views: t.views + r.views, people: t.people + r.people, taps: t.taps + r.taps, tappers: t.tappers + r.tappers,
  }), { views: 0, people: 0, taps: 0, tappers: 0 });
}

function signName(sign) {
  if (sign.kind !== "sponsor" || !(sign.starts_on || sign.ends_on)) return sign.name;
  return withSub(sign.name,
    (sign.starts_on ? shortDate(sign.starts_on) : "…") + " to " + (sign.ends_on ? shortDate(sign.ends_on) : "…"));
}

// Taps, with the share of views that were tapped underneath
function tapCell(sign, t) {
  if (sign.kind === "google") return "–";
  return withSub(num(t.taps), rate(t.taps, t.views));
}

function renderSigns(report) {
  const shop = section("Shop signs",
    "How often the hanging signs in the Byome Shop are seen and tapped. A view counts when at least half a sign has been on screen for a second. Viewers counts each member once a day. Under each number of taps is the share of views that were tapped.");
  const signs = report.signs.slice();
  // Any key that isn't in shop_signs yet still shows, under its key
  const known = new Set(signs.map((s) => s.key));
  report.days.forEach((d) => {
    if (known.has(d.sign)) return;
    known.add(d.sign);
    signs.push({ key: d.sign, name: d.sign, kind: d.sign.startsWith("google-") ? "google" : "house" });
  });
  const byKey = {};
  report.days.forEach((d) => (byKey[d.sign] = byKey[d.sign] || []).push(d));

  // How often Google filled the bottom sign, when it was seen
  const google = totals(byKey["google-bottom"] || []).views;
  const cards = signs.filter((s) => s.kind === "house").reduce((n, s) => n + totals(byKey[s.key] || []).views, 0);
  if (google + cards) {
    shop.appendChild(el("p", "stats-coverage",
      "Bottom sign: Google filled it " + Math.round((google / (google + cards)) * 100) + "% of the times it was seen. " +
      "The rest of the time it showed a Byome card."));
  }

  KINDS.forEach(({ kind, title, note, empty }) => {
    shop.appendChild(el("h3", "stats-subtitle", title));
    if (note) shop.appendChild(el("p", "stats-note", note));
    const seen = signs.filter((s) => s.kind === kind && (byKey[s.key] || []).length);
    if (!seen.length) {
      shop.appendChild(el("p", "stats-note", empty));
      return;
    }
    shop.appendChild(table(title, ["Sign", "Views", "Viewers", "Taps"], seen.map((s) => {
      const t = totals(byKey[s.key]);
      return [signName(s), num(t.views), num(t.people), tapCell(s, t)];
    })));
    // Each sign's days, folded away
    seen.forEach((s) => {
      const details = el("details", "stats-days");
      details.appendChild(el("summary", null, s.name + ": day by day"));
      details.appendChild(table(s.name + ", day by day", ["Day", "Views", "Viewers", "Taps"],
        byKey[s.key].map((d) => [shortDate(d.day), num(d.views), num(d.people), s.kind === "google" ? "–" : num(d.taps)])));
      shop.appendChild(details);
    });
  });
}

// ---------- Loading ----------
async function load(days) {
  periods.querySelectorAll("[data-days]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.days === days)));
  const [site, signs] = await Promise.all([
    supabaseClient.rpc("site_numbers_report", { p_days: days }),
    supabaseClient.rpc("sign_stats_report", { p_days: days }),
  ]);
  const error = site.error || signs.error;
  if (error) {
    periods.hidden = true;
    box.replaceChildren(el("p", "feed-empty", /access/.test(error.message)
      ? "This page is only for people with access to the site numbers."
      : "Couldn't load the numbers. Please try again in a moment."));
    return;
  }
  periods.hidden = false;
  box.replaceChildren(el("p", "stats-period",
    shortDate(site.data.since) + " to " + shortDate(site.data.today) + " (Central time)"));
  renderSite(site.data);
  renderSigns(signs.data);
}

periods.addEventListener("click", (e) => {
  const b = e.target.closest("[data-days]");
  if (b) load(+b.dataset.days);
});

(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }
  load(30);
})();
