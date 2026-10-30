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

  // (banners come from database/2026-11-01-event-banner.sql; fine without)
  const list = (columns) => supabaseClient.from("events").select(columns).order("starts_at", { ascending: false });
  let { data: events, error } = await list("key, starts_at, banner_image, banner_alt");
  if (error) ({ data: events, error } = await list("key, starts_at"));
  if (error || !events || !events.length) {
    box.replaceChildren(el("p", "feed-empty", "No events yet. Check back soon!"));
    return;
  }
  const overviews = (await Promise.all(events.map((e) => supabaseClient.rpc("event_overview", { p_event: e.key }))))
    .map((res, i) => res.data && Object.assign(res.data, { banner_image: events[i].banner_image, banner_alt: events[i].banner_alt }))
    .filter(Boolean);
  const now = new Date().toISOString();
  const { data: shopItems } = await supabaseClient.from("biome_items").select("key")
    .not("available_until", "is", null).lte("available_from", now).gte("available_until", now);

  box.replaceChildren();
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
