// Homepage: members who are logged in get a welcome back and shortcuts,
// instead of the "join the community" pitch meant for visitors.
(async function () {
  // While an event is on, everyone sees a banner for it at the top
  if (typeof UI !== "undefined") UI.eventBanner(document.querySelector("main"));
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) return;
  const { data: me } = await supabaseClient.from("profiles")
    .select("username").eq("id", data.session.user.id).maybeSingle();

  document.getElementById("hero-title").textContent =
    "Welcome back" + (me && me.username ? ", " + me.username : "") + " \u{1F331}";
  document.getElementById("hero-sub").textContent =
    "Catch up on the community, find your next favorite product, or tend to your shelf.";

  const actions = document.getElementById("hero-actions");
  actions.replaceChildren();
  [["feed.html", "Community", "btn-solid"], ["reviews.html", "Reviews", "btn-ghost"], ["profile.html", "My shelf", "btn-ghost"]]
    .forEach(([href, text, style]) => {
      const a = document.createElement("a");
      a.href = href;
      a.className = "btn " + style;
      a.textContent = text;
      actions.appendChild(a);
    });
})();
