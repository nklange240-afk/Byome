// Grab the form and the message paragraph so we can work with them
const signupForm = document.getElementById("signup-form");
const messageEl = document.getElementById("signup-message");

// Runs whenever the form is submitted (the button is clicked)
signupForm.addEventListener("submit", async (event) => {
  event.preventDefault(); // stops the page from reloading, which is the browser's default

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

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
  p1.textContent = "We sent a confirmation link to " + email + ". Open it to finish joining byome.";
  const p2 = document.createElement("p");
  p2.className = "field-hint";
  p2.textContent = "Can't find it? Check your spam or promotions folder. The email comes from no-reply@byome.xyz.";
  done.append(sprout, h, p1, p2);
  card.replaceChildren(done);
});
