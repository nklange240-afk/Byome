function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + (mins === 1 ? " minute ago" : " minutes ago");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  const days = Math.floor(hours / 24);
  if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// A small icon for each kind of notification, so they're easy to scan
const ICONS = {
  // a sprout: achievements
  achievement: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 15c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
  // a sparkle: points
  points: '<path d="M12 3c.6 4.6 3.4 7.4 8 8-4.6.6-7.4 3.4-8 8-.6-4.6-3.4-7.4-8-8 4.6-.6 7.4-3.4 8-8z"/>',
  // a leaf (byome's "like")
  like: '<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14z"/><path d="M5 19l8-8"/>',
  // a speech bubble: comments and replies
  comment: '<path d="M4 5h16v11H9l-5 4z"/>',
  // a flag: moderation
  moderation: '<path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6"/>',
};
const ICON_FOR = {
  achievement: "achievement", points: "points",
  post_like: "like", comment_like: "like", review_like: "like",
  comment: "comment", reply: "comment",
  moderation: "moderation", moderation_queue: "moderation",
};

// Moderation flags: green when it went your way (approved, your report was
// acted on), red when it didn't, gold for moderators' "new in the queue"
function typeIcon(type, tone) {
  const kind = ICON_FOR[type] || "points";
  let shade = "";
  if (type === "moderation_queue") shade = " is-queue";
  else if (kind === "moderation") shade = tone === "positive" ? " is-positive" : " is-negative";
  const wrap = el("span", "notification-icon icon-" + kind + shade);
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[kind] + "</svg>";
  return wrap;
}

(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }

  const listEl = document.getElementById("notification-list");
  const markBtn = document.getElementById("mark-read-btn");

  // "tone" (green/red flags) comes from database/2026-10-11-moderation-log.sql.
  // If that hasn't been run yet, load without it rather than failing.
  const load = (columns) => supabaseClient.from("notifications").select(columns)
    .order("created_at", { ascending: false }).limit(50);
  let { data: items, error } = await load("id, type, tone, message, link, created_at, read_at");
  if (error && /tone/.test(error.message)) {
    ({ data: items, error } = await load("id, type, message, link, created_at, read_at"));
  }

  listEl.innerHTML = "";
  if (error) {
    listEl.appendChild(el("p", "feed-empty", "Couldn't load notifications: " + error.message));
    return;
  }
  if (items.length === 0) {
    listEl.appendChild(UI.emptyState({ image: "biome-assets/plant-welcome-sprout.png",
      text: "All quiet for now. Likes, comments and moderator updates will show up here." }));
    return;
  }

  items.forEach((n) => {
    const article = el("article", "notification" + (n.read_at ? "" : " is-unread"));
    article.appendChild(typeIcon(n.type, n.tone));
    const textBox = el("div", "notification-main");
    article.appendChild(textBox);
    // only ever link to our own pages
    const safe = n.link && /^[a-z-]+\.html$/.test(n.link);
    if (safe) {
      const a = el("a", "notification-text", n.message);
      a.href = n.link;
      textBox.appendChild(a);
    } else {
      textBox.appendChild(el("p", "notification-text", n.message));
    }
    const time = el("time", "notification-time", timeAgo(n.created_at));
    time.dateTime = n.created_at;
    textBox.appendChild(time);
    listEl.appendChild(article);
  });

  if (items.some((n) => !n.read_at)) {
    markBtn.hidden = false;
    markBtn.addEventListener("click", async () => {
      const { error: rpcError } = await supabaseClient.rpc("mark_notifications_read");
      if (rpcError) return;
      listEl.querySelectorAll(".is-unread").forEach((n) => n.classList.remove("is-unread"));
      document.querySelectorAll(".nav-badge").forEach((b) => b.remove());
      document.querySelectorAll(".has-unread").forEach((b) => b.classList.remove("has-unread"));
      markBtn.hidden = true;
    });
  }
})();
