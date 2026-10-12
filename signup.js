// Grab the form and the message paragraph so we can work with them
const signupForm = document.getElementById("signup-form");
const messageEl = document.getElementById("signup-message");

// ----- Invite codes -----
// A friend's invite link (signup.html?ref=CODE) fills the code in; it's
// remembered for this visit in case they look around first. The hint shows
// who invited them, or that the code wasn't found.
const inviteInput = document.getElementById("invite-code");
const inviteHint = document.getElementById("invite-hint");
const INVITE_HINT = inviteHint.textContent;
let inviteOk = true;   // an empty code is fine
let inviteTimer = null;

async function checkInvite() {
  const code = inviteInput.value.trim().toUpperCase();
  try { sessionStorage.setItem("byome-invite", code); } catch (e) { /* not needed */ }
  if (!code) { inviteOk = true; inviteHint.textContent = INVITE_HINT; inviteHint.classList.remove("is-good", "is-bad"); return; }
  const { data: inviter } = await supabaseClient.rpc("referral_inviter", { p_code: code });
  if (inputCode() !== code) return; // they kept typing
  inviteOk = Boolean(inviter);
  inviteHint.textContent = inviter ? "Invited by " + inviter + ". Welcome!" : "We couldn't find that code. Check it, or leave this empty.";
  inviteHint.classList.toggle("is-good", inviteOk);
  inviteHint.classList.toggle("is-bad", !inviteOk);
}
function inputCode() { return inviteInput.value.trim().toUpperCase(); }

inviteInput.addEventListener("input", () => { clearTimeout(inviteTimer); inviteTimer = setTimeout(checkInvite, 400); });
(function () {
  let code = new URLSearchParams(window.location.search).get("ref");
  if (!code) { try { code = sessionStorage.getItem("byome-invite"); } catch (e) { code = null; } }
  if (code) { inviteInput.value = code.trim().toUpperCase().slice(0, 12); checkInvite(); }
})();

// Runs whenever the form is submitted (the button is clicked)
signupForm.addEventListener("submit", async (event) => {
  event.preventDefault(); // stops the page from reloading, which is the browser's default

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  // The browser already requires the box; this is a second check
  if (!document.getElementById("age-confirm").checked) {
    messageEl.textContent = "Please confirm you're 18 or older to join Byome.";
    messageEl.style.color = "#E07A5F";
    return;
  }

  if (inputCode() && !inviteOk) {
    messageEl.textContent = "That invite code wasn't found. Check it, or leave it empty to sign up without one.";
    messageEl.style.color = "#E07A5F";
    inviteInput.focus();
    return;
  }

  messageEl.textContent = "Creating your account...";
  messageEl.style.color = "var(--cream)";

  // Check the username first, so problems get a clear message.
  // (The database checks again when the account is created.)
  const USERNAME_PROBLEMS = {
    invalid: "Usernames are 3–20 characters: letters, numbers, and _ . or - (no spaces).",
    taken: "That username is already taken — try another.",
    not_allowed: "That username isn't allowed. Please choose a different one.",
  };
  const { data: usernameCheck } = await supabaseClient.rpc("check_username", { p_username: username });
  if (usernameCheck && USERNAME_PROBLEMS[usernameCheck]) {
    messageEl.textContent = USERNAME_PROBLEMS[usernameCheck];
    messageEl.style.color = "#E07A5F";
    return;
  }

  // Ask Supabase to create the account. Supabase handles password
  // security and automatically rejects duplicate emails — we don't
  // have to write that logic ourselves. The username is attached as
  // metadata; a database trigger (set up in Supabase) uses it to
  // create the matching profile row automatically. The age confirmation
  // is kept with the account too, as a record of when they confirmed.
  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
    options: {
      // referral_code: the friend who invited them (database/2026-10-19-referrals.sql)
      data: { username: username, confirmed_18_plus_at: new Date().toISOString(), referral_code: inputCode() || undefined },
    },
  });

  if (error) {
    // A duplicate username surfaces here as a database error from
    // the trigger, so we check for that specifically.
    const msg = error.message.toLowerCase();
    if (msg.includes("duplicate") || msg.includes("database error saving new user")) {
      messageEl.textContent = "That username can't be used — try another.";
    } else {
      messageEl.textContent = error.message;
    }
    messageEl.style.color = "#E07A5F";
    return;
  }

  // Success — Supabase has sent a confirmation email, and the profile
  // row was created automatically by the database trigger.
  // Swap the form for a clear "check your email" note
  const card = signupForm.closest(".auth-card");
  const done = document.createElement("div");
  done.className = "signup-done";
  done.setAttribute("role", "status");
  const sprout = document.createElement("img");
  sprout.src = "biome-assets/plant-welcome-sprout.png";
  sprout.alt = "";
  sprout.className = "signup-done-art";
  const h = document.createElement("h1");
  h.textContent = "Almost there!";
  const p1 = document.createElement("p");
  p1.textContent = "We sent a confirmation link to " + email + ". Open it to finish joining Byome.";
  const p2 = document.createElement("p");
  p2.className = "field-hint";
  p2.textContent = "Can't find it? Check your spam or promotions folder. The email comes from no-reply@byome.xyz.";
  done.append(sprout, h, p1, p2);
  card.replaceChildren(done);
});
