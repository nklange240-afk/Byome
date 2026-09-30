// Shared hamburger menu: open/close, username, moderator link, log out.
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
    const { data: profile } = await supabaseClient
      .from("profiles").select("username, is_moderator")
      .eq("id", data.session.user.id).single();
    if (!profile) return;
    document.getElementById("header-username").textContent = profile.username;
    if (profile.is_moderator) document.getElementById("moderate-link").hidden = false;
  })();
})();
