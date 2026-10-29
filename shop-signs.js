// The Shop signs page: how often each hanging sign in the Byome Shop
// (Google ads, Byome's own cards and, later, sponsor signs) is seen and
// tapped. Only for people given access (database/2026-12-02-shop-sign-stats.sql).

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const box = document.getElementById("sign-stats");
const periods = document.getElementById("sign-stats-periods");

const KINDS = [
  { kind: "google", title: "Google ads", note: "Taps on Google's ads are in your AdSense reports, not here.", empty: "No Google ads seen in this period." },
  { kind: "house", title: "Byome cards", note: "Shown in the bottom sign whenever Google has no ad.", empty: "No Byome cards seen in this period." },
  { kind: "sponsor", title: "Sponsors",
    empty: "No sponsor signs yet. When you run one, add it to the shop_signs table (the steps are at the top of database/2026-12-02-shop-sign-stats.sql) and its numbers appear here." },
];

const num = (n) => n.toLocaleString();
const rate = (taps, views) => (views ? Math.round((taps / views) * 1000) / 10 + "%" : "–");
function shortDate(day) {
  // (dates are Central-time days, so read them as plain dates)
  return new Date(day + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function totals(rows) {
  return rows.reduce((t, r) => ({
    views: t.views + r.views, people: t.people + r.people, taps: t.taps + r.taps, tappers: t.tappers + r.tappers,
  }), { views: 0, people: 0, taps: 0, tappers: 0 });
}

function table(caption, head, rows) {
  const wrap = el("div", "stats-table-wrap");
  const t = el("table", "stats-table");
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

function signName(sign) {
  const name = el("span", null, sign.name);
  if (sign.kind === "sponsor" && (sign.starts_on || sign.ends_on)) {
    name.appendChild(el("span", "stats-sub",
      (sign.starts_on ? shortDate(sign.starts_on) : "…") + " to " + (sign.ends_on ? shortDate(sign.ends_on) : "…")));
  }
  return name;
}

// Taps, with the share of views that were tapped underneath
function tapCell(sign, t) {
  if (sign.kind === "google") return "–";
  const cell = el("span", null, num(t.taps));
  cell.appendChild(el("span", "stats-sub", rate(t.taps, t.views)));
  return cell;
}

function render(report, days) {
  box.replaceChildren();
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

  box.appendChild(el("p", "stats-period",
    (days === 1 ? "Today" : shortDate(report.since) + " to " + shortDate(report.today)) + " (Central time)"));

  // How often Google filled the bottom sign, when it was seen
  const google = totals(byKey["google-bottom"] || []).views;
  const cards = signs.filter((s) => s.kind === "house").reduce((n, s) => n + totals(byKey[s.key] || []).views, 0);
  if (google + cards) {
    box.appendChild(el("p", "stats-coverage",
      "Bottom sign: Google filled it " + Math.round((google / (google + cards)) * 100) + "% of the times it was seen. " +
      "The rest of the time it showed a Byome card."));
  }

  KINDS.forEach(({ kind, title, note, empty }) => {
    const group = signs.filter((s) => s.kind === kind);
    const section = el("section", "stats-section");
    section.appendChild(el("h2", "section-title", title));
    if (note) section.appendChild(el("p", "stats-note", note));
    const seen = group.filter((s) => (byKey[s.key] || []).length);
    if (!seen.length) {
      section.appendChild(el("p", "stats-note", empty));
      box.appendChild(section);
      return;
    }
    section.appendChild(table(title, ["Sign", "Views", "Viewers", "Taps"], seen.map((s) => {
      const t = totals(byKey[s.key]);
      return [signName(s), num(t.views), num(t.people), tapCell(s, t)];
    })));
    // Each sign's days, folded away
    seen.forEach((s) => {
      const details = el("details", "stats-days");
      details.appendChild(el("summary", null, s.name + ": day by day"));
      details.appendChild(table(s.name + ", day by day", ["Day", "Views", "Viewers", "Taps"],
        byKey[s.key].map((d) => [shortDate(d.day), num(d.views), num(d.people), s.kind === "google" ? "–" : num(d.taps)])));
      section.appendChild(details);
    });
    box.appendChild(section);
  });
}

async function load(days) {
  periods.querySelectorAll("[data-days]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.days === days)));
  const { data, error } = await supabaseClient.rpc("sign_stats_report", { p_days: days });
  if (error) {
    periods.hidden = true;
    box.replaceChildren(el("p", "feed-empty", /access/.test(error.message)
      ? "This page is only for people with access to the shop sign numbers."
      : "Couldn't load the numbers. Please try again in a moment."));
    return;
  }
  periods.hidden = false;
  render(data, days);
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
