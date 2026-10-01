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

(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }

  const listEl = document.getElementById("notification-list");
  const markBtn = document.getElementById("mark-read-btn");

  const { data: items, error } = await supabaseClient
    .from("notifications")
    .select("id, message, link, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(50);

  listEl.innerHTML = "";
  if (error) {
    listEl.appendChild(el("p", "feed-empty", "Couldn't load notifications: " + error.message));
    return;
  }
  if (items.length === 0) {
    listEl.appendChild(el("p", "feed-empty", "Nothing yet. Likes, comments and moderator updates will show up here."));
    return;
  }

  items.forEach((n) => {
    const article = el("article", "notification" + (n.read_at ? "" : " is-unread"));
    // only ever link to our own pages
    const safe = n.link && /^[a-z-]+\.html$/.test(n.link);
    if (safe) {
      const a = el("a", "notification-text", n.message);
      a.href = n.link;
      article.appendChild(a);
    } else {
      article.appendChild(el("p", "notification-text", n.message));
    }
    const time = el("time", "notification-time", timeAgo(n.created_at));
    time.dateTime = n.created_at;
    article.appendChild(time);
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
