// Edit profile: picture, username, skin and hair details, delete account.
// The database checks everything again (update_my_profile, set_my_avatar,
// delete_my_account), so this page can't be used to bend the rules.
let me = null;       // your user id
let profile = null;  // your profile row

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function say(id, text, good) {
  const m = document.getElementById(id);
  m.textContent = text;
  m.style.color = good ? "var(--gold)" : "#E07A5F";
}

// ---------- Profile picture ----------

function paintAvatar() {
  document.getElementById("avatar-preview").replaceChildren(PROFILES.avatar(profile, "xl"));
  document.getElementById("avatar-remove").hidden = !profile.avatar_path;
}

// Crop to the middle square and shrink to 400x400, so uploads are small
// (well under the 2 MB limit) and every picture fits the circle.
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 400;
      canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 400, 400);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that picture"))), "image/webp", 0.85);
    };
    img.onerror = () => reject(new Error("That file doesn't look like a picture"));
    img.src = URL.createObjectURL(file);
  });
}

document.getElementById("avatar-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  say("avatar-message", "Uploading...", true);
  try {
    const blob = await shrinkImage(file);
    // Some browsers can't make WebP and fall back to PNG; both are allowed
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
    const path = me + "/avatar-" + Date.now() + "." + ext;
    const { error: upErr } = await supabaseClient.storage.from("avatars").upload(path, blob, { contentType: blob.type });
    if (upErr) throw upErr;
    const { error: setErr } = await supabaseClient.rpc("set_my_avatar", { p_path: path });
    if (setErr) throw setErr;
    const old = profile.avatar_path;
    profile.avatar_path = path;
    paintAvatar();
    if (old) supabaseClient.storage.from("avatars").remove([old]); // tidy up the previous one
    say("avatar-message", "Profile picture updated.", true);
  } catch (err) {
    say("avatar-message", err.message || "Couldn't upload that picture.", false);
  }
});

document.getElementById("avatar-remove").addEventListener("click", async () => {
  const old = profile.avatar_path;
  const { error } = await supabaseClient.rpc("set_my_avatar", { p_path: null });
  if (error) { say("avatar-message", error.message, false); return; }
  profile.avatar_path = null;
  paintAvatar();
  if (old) supabaseClient.storage.from("avatars").remove([old]);
  say("avatar-message", "Profile picture removed.", true);
});

// ---------- About you ----------

// A row of pill-shaped options. Radios get a "Not saying" choice so any
// answer can be taken back; checkboxes can simply be unticked.
function buildChoices(fieldsetId, name, options, type, selected) {
  const box = document.getElementById(fieldsetId);
  const row = el("div", "choice-row");
  const all = type === "radio" ? [["", "Not saying"]].concat(options) : options;
  all.forEach(([value, text]) => {
    const label = el("label", "choice");
    const input = el("input");
    input.type = type;
    input.name = name;
    input.value = value;
    input.checked = type === "radio" ? (selected || "") === value : (selected || []).includes(value);
    label.append(input, el("span", null, text));
    row.appendChild(label);
  });
  box.appendChild(row);
}

const USERNAME_PROBLEMS = {
  invalid: "Usernames are 3–20 characters: letters, numbers, and _ . or - (no spaces).",
  taken: "That username is already taken. Try another.",
  not_allowed: "That username isn't allowed. Please choose a different one.",
};

document.getElementById("profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const picked = (name) => (form.querySelector('input[name="' + name + '"]:checked') || {}).value || "";
  const concerns = Array.from(form.querySelectorAll('input[name="skin-concerns"]:checked')).map((i) => i.value);
  const username = document.getElementById("username").value.trim();

  say("profile-message", "Saving...", true);
  const { data: result, error } = await supabaseClient.rpc("update_my_profile", {
    p_username: username,
    p_skin_type: picked("skin-type"),
    p_skin_concerns: concerns,
    p_hair_type: picked("hair-type"),
    p_hair_texture: picked("hair-texture"),
  });
  if (error) { say("profile-message", error.message, false); return; }
  if (result !== "ok") { say("profile-message", USERNAME_PROBLEMS[result] || "Couldn't save.", false); return; }
  profile.username = username;
  document.getElementById("header-username").textContent = username;
  say("profile-message", "Saved!", true);
});

// ---------- Delete account ----------

const confirmInput = document.getElementById("delete-confirm");
const deleteBtn = document.getElementById("delete-account");
confirmInput.addEventListener("input", () => {
  deleteBtn.disabled = confirmInput.value.trim().toUpperCase() !== "DELETE";
});

deleteBtn.addEventListener("click", async () => {
  const everything = document.getElementById("delete-content").checked;
  const sure = confirm(everything
    ? "Delete your account AND all your reviews, posts and comments? This can't be undone."
    : "Delete your account? Your reviews, posts and comments will stay up as “Deleted member”. This can't be undone.");
  if (!sure) return;

  deleteBtn.disabled = true;
  say("delete-message", "Deleting...", true);
  // Pictures live in file storage, which only the browser can tidy up
  const { data: files } = await supabaseClient.storage.from("avatars").list(me);
  if (files && files.length) await supabaseClient.storage.from("avatars").remove(files.map((f) => me + "/" + f.name));

  const { error } = await supabaseClient.rpc("delete_my_account", { p_delete_content: everything });
  if (error) {
    say("delete-message", "Couldn't delete your account: " + error.message, false);
    deleteBtn.disabled = false;
    return;
  }
  await supabaseClient.auth.signOut().catch(() => {});
  alert("Your account has been deleted. Thank you for being part of byome.");
  window.location.href = "index.html";
});

// ---------- Start ----------

(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return; }
  me = data.session.user.id;

  const { data: row, error } = await supabaseClient
    .from("profiles")
    .select("username, avatar_path, skin_type, skin_concerns, hair_type, hair_texture")
    .eq("id", me).single();
  if (error) { say("profile-message", "Couldn't load your profile: " + error.message, false); return; }
  profile = row;

  paintAvatar();
  document.getElementById("username").value = profile.username;
  buildChoices("skin-type", "skin-type", PROFILES.SKIN_TYPES, "radio", profile.skin_type);
  buildChoices("skin-concerns", "skin-concerns", PROFILES.SKIN_CONCERNS, "checkbox", profile.skin_concerns);
  buildChoices("hair-type", "hair-type", PROFILES.HAIR_TYPES, "radio", profile.hair_type);
  buildChoices("hair-texture", "hair-texture", PROFILES.HAIR_TEXTURES, "radio", profile.hair_texture);
})();
