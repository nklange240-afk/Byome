// Profile details shared across pages: the skin and hair options, profile
// pictures, and how a member's name is shown.
// The option keys must match the checks in database/2026-10-03-profiles.sql.
const PROFILES = (function () {
  const SKIN_TYPES = [
    ["dry", "Dry"], ["oily", "Oily"], ["combination", "Combination"], ["normal", "Normal"], ["sensitive", "Sensitive"],
  ];
  const SKIN_CONCERNS = [
    ["acne", "Acne & breakouts"], ["fine-lines", "Fine lines & wrinkles"], ["hyperpigmentation", "Dark spots & hyperpigmentation"],
    ["redness", "Redness"], ["texture", "Texture"], ["dullness", "Dullness"], ["sensitivity", "Sensitivity"],
    ["dehydration", "Dehydration"], ["large-pores", "Large pores"], ["dark-circles", "Dark circles"],
  ];
  const HAIR_TYPES = [["straight", "Straight"], ["wavy", "Wavy"], ["curly", "Curly"], ["coily", "Coily"]];
  const HAIR_TEXTURES = [["fine", "Fine"], ["medium", "Medium"], ["thick", "Thick"]];
  // Ring around the profile picture (must match the list in
  // database/2026-10-03-avatar-ring.sql). Gold is the default.
  const RING_COLORS = [
    ["gold", "Gold", "#E0A83E"], ["leaf", "Leaf green", "#8DBB6E"], ["cream", "Cream", "#F3EDE0"],
    ["rose", "Rose", "#E89AB4"], ["lavender", "Lavender", "#B9A3E3"], ["sky", "Sky blue", "#8EC3E6"],
    ["terracotta", "Terracotta", "#E07A5F"],
  ];

  function ringColor(key) {
    const found = RING_COLORS.find(([k]) => k === key);
    return (found || RING_COLORS[0])[2];
  }

  function label(list, key) {
    const found = list.find(([k]) => k === key);
    return found ? found[1] : key;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Accounts deleted by their owners keep their reviews under this name
  function isDeleted(profile) {
    return Boolean(profile && profile.username && profile.username.indexOf("deleted-member-") === 0);
  }

  function displayName(profile) {
    if (!profile || !profile.username) return "Unknown";
    return isDeleted(profile) ? "Deleted member" : profile.username;
  }

  function avatarUrl(path) {
    return path ? supabaseClient.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;
  }

  // A round profile picture, or the first letter of their name if they have none.
  // size: "small" (next to names), "large" (profile page) or "xl" (edit page)
  function avatar(profile, size) {
    const url = profile && !isDeleted(profile) ? avatarUrl(profile.avatar_path) : null;
    const box = el("span", "avatar avatar-" + (size || "small"));
    box.setAttribute("aria-hidden", "true");
    // Their chosen ring color (a deleted member's picture gets a plain ring)
    box.style.borderColor = isDeleted(profile) ? "var(--moss)" : ringColor(profile && profile.avatar_ring);
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => { img.remove(); box.textContent = initial(profile); });
      box.appendChild(img);
    } else {
      box.textContent = initial(profile);
    }
    return box;
  }

  function initial(profile) {
    const name = displayName(profile);
    return isDeleted(profile) ? "?" : name.charAt(0).toUpperCase();
  }

  // A member's small picture and name, linking to their profile
  function authorLink(profile) {
    const wrap = el("span", "post-author-wrap");
    wrap.appendChild(avatar(profile, "small"));
    if (!profile || !profile.username || isDeleted(profile)) {
      wrap.appendChild(el("span", "post-author is-deleted", displayName(profile)));
    } else {
      const a = el("a", "post-author", profile.username);
      a.href = "profile.html?user=" + encodeURIComponent(profile.username);
      wrap.appendChild(a);
    }
    return wrap;
  }

  return { SKIN_TYPES, SKIN_CONCERNS, HAIR_TYPES, HAIR_TEXTURES, RING_COLORS, ringColor, label, isDeleted, displayName, avatarUrl, avatar, authorLink };
})();
