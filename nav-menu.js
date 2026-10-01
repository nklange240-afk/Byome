// Shared hamburger menu: open/close, username, moderator link,
// notifications link with unread count, log out.
(function () {
  const toggle = document.getElementById("menu-toggle");
  const menu = document.getElementById("nav-menu");

  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  toggle.addEventListener("click", () => setOpen(menu.hidden));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) { setOpen(false); toggle.focus(); }
  });

  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
  });

  (async () => {
    const { data } = await supabaseClient.auth.getSession();
    if (!data.session) return;

    // Notifications link, with a count of unread ones
    const { count } = await supabaseClient
      .from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
    const link = document.createElement("a");
    link.href = "notifications.html";
    link.className = "btn btn-ghost";
    link.textContent = "Notifications";
    if (count) {
      const badge = document.createElement("span");
      badge.className = "nav-badge";
      badge.textContent = count > 9 ? "9+" : String(count);
      link.appendChild(badge);
      toggle.classList.add("has-unread");
    }
    const anchor = menu.querySelector('a[href="profile.html"]');
    if (anchor) anchor.insertAdjacentElement("afterend", link);

    const { data: profile } = await supabaseClient
      .from("profiles").select("username, is_moderator")
      .eq("id", data.session.user.id).single();
    if (!profile) return;
    document.getElementById("header-username").textContent = profile.username;
    if (profile.is_moderator) document.getElementById("moderate-link").hidden = false;

    // On pages that show Log in / Sign up for guests (currently just
    // the homepage), hide those and reveal Log out now that we know
    // someone's signed in. Harmless no-op on pages without them.
    const loginLink = document.getElementById("login-link");
    const signupLink = document.getElementById("signup-link");
    if (loginLink) loginLink.hidden = true;
    if (signupLink) signupLink.hidden = true;
    document.getElementById("logout-btn").hidden = false;
  })();
})();
