// Password reset, in two steps on this one page:
//   1. Enter your email: Supabase emails you a link back to this page.
//   2. The link signs you in for a moment ("password recovery"), and you
//      choose a new password.
// The link only works if this page's address is in Supabase's list of
// allowed Redirect URLs (Authentication > URL Configuration).
const requestStep = document.getElementById("request-step");
const newPasswordStep = document.getElementById("new-password-step");
const messageEl = document.getElementById("reset-message");

function say(text, good) {
  messageEl.textContent = text;
  messageEl.style.color = good ? "var(--gold)" : "#E07A5F";
}

function showNewPasswordStep() {
  requestStep.hidden = true;
  newPasswordStep.hidden = false;
  messageEl.textContent = "";
  document.getElementById("new-password").focus();
}

// Arriving from the email link. The page notes the link's details as it
// loads (see reset-password.html), so this works even if Supabase finishes
// reading the link before this script runs.
const linkParams = new URLSearchParams(window.resetLinkParams || "");
if (linkParams.get("type") === "recovery") showNewPasswordStep();
supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") showNewPasswordStep();
});
// (an expired or already-used link comes back with an error instead)
const linkError = linkParams.get("error_description");
if (linkError) say("That reset link didn't work (" + linkError + "). Request a new one below.", false);

document.getElementById("request-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  say("Sending...", true);
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) { say(error.message, false); return; }
  // Same message whether or not the address has an account, so this page
  // can't be used to find out who's signed up
  say("If that email has a byome account, a reset link is on its way. Check your inbox (and spam folder).", true);
});

document.getElementById("new-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.getElementById("new-password").value;
  if (password !== document.getElementById("confirm-password").value) {
    say("Those passwords don't match.", false);
    return;
  }
  say("Saving...", true);
  // Make sure Supabase has finished signing in from the link first
  const { data: current } = await supabaseClient.auth.getSession();
  if (!current.session) {
    say("This reset link has expired or was already used. Request a new one below.", false);
    requestStep.hidden = false;
    newPasswordStep.hidden = true;
    return;
  }
  const { error } = await supabaseClient.auth.updateUser({ password: password });
  if (error) { say(error.message, false); return; }
  say("Your password is changed. Taking you to the community...", true);
  setTimeout(() => { window.location.href = "feed.html"; }, 1500);
});
