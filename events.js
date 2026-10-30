// Events: seasonal events with their own achievements, points and items.
// Upcoming events only say when they start. Live ones list their
// achievements, rewards and (logged in) your progress. Past ones stay
// here as a view-only archive. What's in each event comes from
// event_overview() in database/2026-10-29-events-halloween.sql.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shortDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
}

// Where to go to work on each achievement
const ACTION_LINKS = {
  "hh-cobwebs": { href: "reviews.html", text: "Write a review" },
  "hh-pumpkin-spice": { href: "reviews.html", text: "Write a review" },
  "hh-fresh-blood": { href: "suggest-product.html", text: "Suggest a product" },
  "hh-friendly-ghost": { href: "invite.html", text: "Invite friends" },
  "hh-bait-the-trap": { href: "feed.html", text: "Start a poll" },
  "hh-back-from-the-dead": { href: "profile.html", text: "Find your older reviews" },
  "beta-make-it-yours": { href: "edit-profile.html", text: "Edit profile" },
  "beta-first-impressions": { href: "reviews.html", text: "Write a review" },
  "beta-say-hello": { href: "feed.html", text: "Go to the Community" },
  "beta-join-the-conversation": { href: "feed.html", text: "Go to the Community" },
  "beta-speak-up": { href: "modmail.html?new=feedback", text: "Send feedback" },
  "beta-green-thumb": { href: "feed.html", text: "Find today's surprise" },
  "beta-home-sweet-shelf": { href: "profile.html", text: "Go to your shelf" },
  "beta-wall-of-text": { href: "feed.html", text: "Start a post" },
};

function achievementCard(a, ev, loggedIn) {
  const card = el("li", "event-achievement" + (a.earned ? " is-earned" : a.qualified ? " is-qualified" : ""));

  const art = el("div", "event-reward");
  if (a.reward) {
    art.appendChild(UI.itemArt(a.reward, "event-reward-art"));
  } else {
    art.appendChild(el("span", "event-reward-soon", "Reward coming soon"));
  }
  card.appendChild(art);

  const body = el("div", "event-achievement-body");
  body.appendChild(el("h3", "event-achievement-name", a.name));
  if (a.how_to) body.appendChild(el("p", "event-achievement-how", a.how_to));

  const meta = el("p", "event-achievement-meta");
  meta.appendChild(el("span", "event-points", "+" + a.points + " Byome points"));
  if (a.reward) meta.appendChild(el("span", "event-reward-name", a.reward.name));
  body.appendChild(meta);

  // Your progress
  if (loggedIn) {
    let status = null;
    if (a.earned) status = el("p", "event-status is-earned", "✓ Earned");
    else if (a.qualified) status = el("p", "event-status is-qualified", "✓ Done! Your reward is on its way.");
    else if (a.progress) status = el("p", "event-status", Math.min(a.progress.have, a.progress.need) + " of " + a.progress.need);
    if (status) body.appendChild(status);
  }

  // How to get started (only while it can still be earned)
  if (ev.status === "live" && !a.earned && !a.qualified) {
    let link = ACTION_LINKS[a.key];
    if (a.key === "hh-horror-story" && ev.story_post_id) {
      link = { href: "feed.html?post=" + encodeURIComponent(ev.story_post_id), text: "Go to the post" };
    }
    if (link) {
      const go = el("a", "inline-link event-go", link.text);
      go.href = link.href;
      body.appendChild(go);
    }
  }
  card.appendChild(body);
  return card;
}

// A list of the event's posts; each opens in the Community with its comments
function postList(posts, title, className) {
  const wrap = el("div", "event-posts " + (className || ""));
  wrap.appendChild(el("h3", "event-posts-title", title));
  const ul = el("ul", "event-post-list");
  posts.forEach((p) => {
    const li = el("li", "event-post");
    const link = el("a", "event-post-link", p.title || "(untitled post)");
    link.href = "feed.html?post=" + encodeURIComponent(p.id) + "&comments=open";
    li.appendChild(link);
    const bits = [p.username, p.category, p.comments === 1 ? "1 comment" : p.comments + " comments"].filter(Boolean);
    li.appendChild(el("span", "event-post-meta", bits.join(" \u00b7 ")));
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  return wrap;
}

function eventSection(ev, loggedIn, shopItems) {
  const section = el("section", "event-card is-" + ev.status);
  // A picture across the top of the event (a sneak peek before it starts)
  if (ev.banner_image) {
    const banner = document.createElement("img");
    banner.className = "event-banner-art";
    banner.src = ev.banner_image;
    banner.alt = ev.banner_alt || "";
    banner.addEventListener("error", () => banner.remove());
    section.appendChild(banner);
  }
  const head = el("div", "event-head");
  if (ev.badge_image) {
    const badge = document.createElement("img");
    badge.className = "event-badge";
    badge.src = ev.badge_image;
    badge.alt = "";
    badge.addEventListener("error", () => badge.remove());
    head.appendChild(badge);
  }
  const titles = el("div");
  titles.appendChild(el("h2", "event-name", ev.name));
  const when = el("p", "event-when");
  if (ev.status === "upcoming") {
    when.appendChild(el("span", "event-pill", "Coming soon"));
    when.append(" Starts " + UI.centralTime(ev.starts_at) + ".");
  } else {
    when.textContent = shortDate(ev.starts_at) + " – " + shortDate(ev.ends_at) + ", " + new Date(ev.ends_at).getFullYear();
    if (ev.status === "live") when.prepend(el("span", "event-pill is-live", "On now"), " ");
  }
  titles.appendChild(when);
  head.appendChild(titles);
  section.appendChild(head);

  if (ev.status === "upcoming") {
    section.appendChild(el("p", "event-tagline", "Check back when it starts for achievements, Byome points and limited-edition treats."));
    return section;
  }

  if (ev.tagline) section.appendChild(el("p", "event-tagline", ev.tagline));
  const note = el("p", "event-note");
  if (ev.status === "live") {
    note.textContent = "On until " + UI.centralTime(ev.ends_at) + ". Each achievement can be earned once.";
  } else if (ev.status === "finishing") {
    note.textContent = "This event has ended, but things started during it still count until " + UI.centralTime(ev.grace_until) +
      ": friends finishing their first post and review, poll votes and product approvals.";
  } else {
    note.textContent = "This event has ended. Thanks to everyone who took part!";
  }
  section.appendChild(note);
  if (ev.status === "live" && !loggedIn) {
    const join = el("p", "event-note");
    const link = el("a", "inline-link", "Log in");
    link.href = "login.html";
    join.append(link, " to take part and see your progress.");
    section.appendChild(join);
  }

  if (ev.featured && ev.featured.length) section.appendChild(postList(ev.featured, "Featured", "is-featured"));

  const list = el("ul", "event-achievements");
  (ev.achievements || []).forEach((a) => list.appendChild(achievementCard(a, ev, loggedIn)));
  section.appendChild(list);

  if (ev.posts && ev.posts.length) {
    section.appendChild(postList(ev.posts, "From the community"));
  } else if (ev.status === "live") {
    const none = el("p", "event-note");
    none.append("Posts marked as part of " + ev.name + " will show up here. ");
    const link = el("a", "inline-link", "Start one in the Community");
    link.href = "feed.html";
    none.append(link, ".");
    section.appendChild(none);
  }

  if (ev.status === "live" && shopItems.length) {
    const shop = el("p", "event-note");
    const link = el("a", "inline-link", "Byome Shop");
    link.href = "byome-shop.html";
    shop.append("Limited-edition treats are in the ", link, " while the event's on.");
    section.appendChild(shop);
  }
  return section;
}

// ---------- Beta Testing: Sugar and Spice ----------
// Only beta testers get this (database/2026-12-08-beta-event.sql). Two
// sides of tasks, each with a prize, and an heirloom for both.
const BETA_SIDES = {
  sugar: { icon: "🍬", name: "Sugar", about: "Using Byome as it's meant to be used." },
  spice: { icon: "🌶️", name: "Spice", about: "Trying to break it." },
};

function betaTask(t, live) {
  const done = t.earned || t.qualified;
  const li = el("li", "beta-task" + (done ? " is-done" : ""));
  const head = el("div", "beta-task-head");
  head.appendChild(el("h4", "beta-task-name", t.name));
  head.appendChild(el("span", "event-points", "+" + t.points));
  li.appendChild(head);
  if (t.how_to) li.appendChild(el("p", "beta-task-how", t.how_to));
  let status = null;
  if (done) status = el("p", "event-status is-earned", "✓ Done");
  else if (t.need > 1) status = el("p", "event-status", Math.min(t.have, t.need) + " of " + t.need);
  if (status) li.appendChild(status);
  const link = ACTION_LINKS[t.key];
  if (live && !done && link) {
    const go = el("a", "inline-link event-go", link.text);
    go.href = link.href;
    li.appendChild(go);
  }
  return li;
}

function betaSide(key, tasks, live) {
  const side = BETA_SIDES[key];
  const prize = tasks.find((t) => t.is_prize);
  const list = tasks.filter((t) => !t.is_prize);
  const done = list.filter((t) => t.earned || t.qualified).length;
  const box = el("section", "beta-side is-" + key);
  const head = el("div", "beta-side-head");
  head.appendChild(el("h3", "beta-side-name", side.icon + " " + side.name));
  head.appendChild(el("span", "beta-side-count", done + " of " + list.length + " done"));
  box.appendChild(head);
  box.appendChild(el("p", "beta-side-about", side.about + " Finish any " + prize.need + " of the " + list.length + " for the " + side.name + " prize."));

  // How close the prize is
  const meter = el("div", "beta-meter");
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-label", side.name + " prize");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", String(prize.need));
  meter.setAttribute("aria-valuenow", String(Math.min(done, prize.need)));
  const fill = el("span", "beta-meter-fill");
  fill.style.width = Math.min(100, (done / prize.need) * 100) + "%";
  meter.appendChild(fill);
  box.appendChild(meter);

  const ul = el("ul", "beta-tasks");
  list.forEach((t) => ul.appendChild(betaTask(t, live)));
  box.appendChild(ul);

  const prizeList = el("ul", "event-achievements beta-prize");
  prizeList.appendChild(achievementCard(Object.assign({}, prize, { progress: { have: done, need: prize.need } }), { status: "ended" }, true));
  box.appendChild(prizeList);
  return box;
}

function betaSection(ev) {
  const live = ev.status === "live";
  const section = el("section", "event-card is-beta" + (live ? " is-live" : ""));
  const head = el("div", "event-head");
  if (ev.badge_image) {
    const badge = document.createElement("img");
    badge.className = "event-badge";
    badge.src = ev.badge_image;
    badge.alt = "";
    badge.addEventListener("error", () => badge.remove());
    head.appendChild(badge);
  }
  const titles = el("div");
  titles.appendChild(el("h2", "event-name", ev.name));
  const when = el("p", "event-when");
  when.append(el("span", "event-pill is-beta", "Beta testers only"), " ");
  if (live) when.append(el("span", "event-pill is-live", "On now"), " ");
  when.append(shortDate(ev.starts_at) + " – " + shortDate(ev.ends_at) + ", " + new Date(ev.ends_at).getFullYear());
  titles.appendChild(when);
  head.appendChild(titles);
  section.appendChild(head);

  if (ev.tagline) section.appendChild(el("p", "event-tagline", ev.tagline));
  const note = el("p", "event-note");
  const tab = el("a", "inline-link", "Beta Testing tab");
  tab.href = "feed.html?tab=beta";
  note.append("Only beta testers can see this event. Each task is worth 25 Byome points. Chat with other testers in the Community's ", tab, ".");
  section.appendChild(note);

  const tasks = ev.tasks || [];
  const sides = el("div", "beta-sides");
  ["sugar", "spice"].forEach((key) => sides.appendChild(betaSide(key, tasks.filter((t) => t.side === key), live)));
  section.appendChild(sides);

  const both = tasks.find((t) => t.side === "both");
  if (both) {
    const prizes = tasks.filter((t) => t.is_prize && t.side !== "both");
    const have = prizes.filter((t) => t.earned || t.qualified).length;
    const heirloom = el("ul", "event-achievements beta-heirloom");
    heirloom.appendChild(achievementCard(Object.assign({}, both, { progress: { have: have, need: prizes.length } }), { status: "ended" }, true));
    section.appendChild(heirloom);
  }
  return section;
}

// The next event's date and biome, if one is set and still to come
async function nextEvent() {
  const { data } = await supabaseClient.from("site_settings").select("value").eq("key", "next_event").maybeSingle();
  const next = data && data.value;
  if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next.date || "")) return null;
  // (the date is a Central-time day; it's shown until the day itself has passed)
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  return next.date >= today ? next : null;
}

function teaserCard(next) {
  const card = el("section", "event-card is-teaser");
  const day = new Date(next.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
  // (a non-breaking space keeps "November 27" together on one line)
  card.appendChild(el("h2", "event-name", "New event coming " + day.replace(" ", "\u00a0")));
  card.appendChild(el("p", "event-tagline", "Check back then for achievements, Byome points and limited-edition treats."));
  return card;
}

(async function () {
  const box = document.getElementById("events");
  const { data: session } = await supabaseClient.auth.getSession();
  const loggedIn = Boolean(session.session);

  // (banners come from database/2026-11-01-event-banner.sql, and beta-only
  // events from database/2026-12-08-beta-event.sql; fine without)
  const list = (columns) => supabaseClient.from("events").select(columns).order("starts_at", { ascending: false });
  let { data: events, error } = await list("key, starts_at, banner_image, banner_alt, beta_only");
  if (error) ({ data: events, error } = await list("key, starts_at, banner_image, banner_alt"));
  if (error) ({ data: events, error } = await list("key, starts_at"));
  if (error || !events || !events.length) {
    box.replaceChildren(el("p", "feed-empty", "No events yet. Check back soon!"));
    return;
  }
  // Beta testers also see the beta event, on its own at the top
  const betaEvents = events.filter((e) => e.beta_only);
  events = events.filter((e) => !e.beta_only);
  const betas = (await Promise.all(betaEvents.map(() => supabaseClient.rpc("beta_overview"))))
    .map((res) => res.data).filter(Boolean);
  const overviews = (await Promise.all(events.map((e) => supabaseClient.rpc("event_overview", { p_event: e.key }))))
    .map((res, i) => res.data && Object.assign(res.data, { banner_image: events[i].banner_image, banner_alt: events[i].banner_alt }))
    .filter(Boolean);
  const now = new Date().toISOString();
  const { data: shopItems } = await supabaseClient.from("biome_items").select("key")
    .not("available_until", "is", null).lte("available_from", now).gte("available_until", now);

  box.replaceChildren();
  betas.filter((ev) => ev.status !== "ended").forEach((ev) => box.appendChild(betaSection(ev)));
  const current = overviews.filter((ev) => ev.status !== "ended");
  const past = overviews.filter((ev) => ev.status === "ended");
  // Between events (nothing on or coming soon): "New event coming ..." in
  // the biome chosen for it (database/2026-12-06-next-event-teaser.sql)
  const teaser = current.some((ev) => ev.status === "live" || ev.status === "upcoming") ? null : await nextEvent();
  // The page is set in the current (or most recent) event's own biome
  const lead = current[current.length - 1] || past[0];
  // (the ended event keeps its biome until its wrap-up time is over too)
  if (teaser && teaser.biome && !current.length) UI.setBiome(teaser.biome);
  else if (lead && lead.biome) UI.setBiome(lead.biome);
  if (teaser) box.appendChild(teaserCard(teaser));
  current.forEach((ev) => box.appendChild(eventSection(ev, loggedIn, shopItems || [])));
  if (!current.length && !teaser) box.appendChild(el("p", "feed-empty", "No events on right now. Check back soon!"));
  if (past.length) {
    box.appendChild(el("h2", "section-title events-past-title", "Past events"));
    past.forEach((ev) => box.appendChild(eventSection(ev, loggedIn, [])));
  }
})();
