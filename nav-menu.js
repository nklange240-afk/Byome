// Shared hamburger menu. The items are built here, so every page shows the
// same menu in the same order:
//   Guests:  Reviews, Log in, Sign up
//   Members: Community, Reviews, Suggest a product, Byome Shop |
//            My profile, Notifications (unread count), Moderate (moderators) |
//            username, Log out
(function () {
  const toggle = document.getElementById("menu-toggle");
  const menu = document.getElementById("nav-menu");
  const here = window.location.pathname.split("/").pop() || "index.html";

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

  function link(href, text, solid) {
    const a = document.createElement("a");
    a.href = href;
    a.className = "btn " + (solid ? "btn-solid" : "btn-ghost");
    a.textContent = text;
    if (href === here) a.setAttribute("aria-current", "page");
    menu.appendChild(a);
    return a;
  }

  function line() {
    menu.appendChild(document.createElement("hr"));
  }

  function badge(a, count, label) {
    const b = document.createElement("span");
    b.className = "nav-badge";
    b.textContent = count > 9 ? "9+" : String(count);
    a.appendChild(b);
    a.setAttribute("aria-label", label + " (" + count + ")");
    toggle.classList.add("has-unread");
  }

  function guestMenu() {
    menu.replaceChildren();
    link("reviews.html", "Reviews");
    link("events.html", "Events");
    line();
    link("login.html", "Log in");
    link("signup.html", "Sign up", true);
  }

  (async () => {
    const { data } = await supabaseClient.auth.getSession();
    if (!data.session) { guestMenu(); return; }

    menu.replaceChildren();
    link("feed.html", "Community");
    link("reviews.html", "Reviews");
    link("suggest-product.html", "Suggest a product");
    link("byome-shop.html", "Byome Shop");
    link("events.html", "Events");
    link("invite.html", "Invite friends");
    line();
    link("profile.html", "My profile");
    const notes = link("notifications.html", "Notifications");
    const modLink = link("moderate-products.html", "Moderate");
    modLink.hidden = true; // shown below for moderators
    line();
    const name = document.createElement("span");
    name.id = "header-username"; // edit-profile.js updates this after a rename
    name.className = "header-username";
    menu.appendChild(name);
    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "btn btn-ghost";
    logout.textContent = "Log out";
    logout.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    });
    menu.appendChild(logout);

    // The homepage also has Log in / Sign up buttons in its header
    ["login-link", "signup-link"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });

    const { count } = await supabaseClient
      .from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
    if (count) badge(notes, count, "Notifications");

    const { data: profile } = await supabaseClient
      .from("profiles").select("username, is_moderator")
      .eq("id", data.session.user.id).single();
    if (!profile) return;
    name.textContent = profile.username;
    if (profile.is_moderator) {
      modLink.hidden = false;
      // How many things are waiting for a moderator
      const { data: waiting } = await supabaseClient.rpc("moderation_counts");
      if (waiting) badge(modLink, waiting, "Moderate, waiting");
    }
  })();
})();
