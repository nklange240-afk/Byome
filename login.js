const loginForm = document.getElementById("login-form");
const messageEl = document.getElementById("login-message");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  messageEl.textContent = "Logging in...";
  messageEl.style.color = "var(--cream)";

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    messageEl.textContent = error.message;
    messageEl.style.color = "#E07A5F";
    return;
  }

  messageEl.textContent = "Logged in! Redirecting...";
  messageEl.style.color = "var(--gold)";

  // Send them to the community feed now that they are logged in
  window.location.href = "feed.html";
});
