// Grab the form and the message paragraph so we can work with them
const signupForm = document.getElementById("signup-form");
const messageEl = document.getElementById("signup-message");

// Runs whenever the form is submitted (the button is clicked)
signupForm.addEventListener("submit", async (event) => {
  event.preventDefault(); // stops the page from reloading, which is the browser's default

  const username = document.getElementById("username").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  messageEl.textContent = "Creating your account...";
  messageEl.style.color = "var(--cream)";

  // Ask Supabase to create the account. Supabase handles password
  // security and automatically rejects duplicate emails — we don't
  // have to write that logic ourselves. The username is attached as
  // metadata; a database trigger (set up in Supabase) uses it to
  // create the matching profile row automatically.
  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
    options: {
      data: { username: username },
    },
  });

  if (error) {
    // A duplicate username surfaces here as a database error from
    // the trigger, so we check for that specifically.
    if (error.message.toLowerCase().includes("duplicate")) {
      messageEl.textContent = "That username is already taken — try another.";
    } else {
      messageEl.textContent = error.message;
    }
    messageEl.style.color = "#E07A5F";
    return;
  }

  // Success — Supabase has sent a confirmation email, and the profile
  // row was created automatically by the database trigger.
  messageEl.textContent = "Check your email to confirm your account!";
  messageEl.style.color = "var(--gold)";
  signupForm.reset();
});
