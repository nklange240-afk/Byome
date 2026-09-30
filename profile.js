(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }
  const user = data.session.user;

  const { data: profile } = await supabaseClient
    .from("profiles").select("username").eq("id", user.id).single();

  document.getElementById("profile-name").textContent = profile ? profile.username : "Profile";
  document.getElementById("profile-since").textContent =
    "Member since " + new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  async function countOf(table) {
    const { count } = await supabaseClient
      .from(table).select("id", { count: "exact", head: true }).eq("user_id", user.id);
    return count || 0;
  }
  const [posts, reviews] = await Promise.all([countOf("posts"), countOf("reviews")]);
  document.getElementById("profile-stats").textContent = posts + " posts · " + reviews + " reviews";
})();
