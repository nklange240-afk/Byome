// Invite friends: your invite link and code, how many friends you've
// referred (all time and this week), the weekly bonus limit, milestones, and the
// friends you've invited. The rules live in database/2026-10-19-referrals.sql;
// this page shows them.

const BONUS_INVITER = "50 Byome points and 5 community points";
const BONUS_FRIEND = "40 Byome points";
const MILESTONES = [1, 5, 25];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// "Monday, Oct 19", in the member's own time zone
function dayName(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// A copy button that says "Copied!" for a moment (and tells screen readers)
function copyButton(label, getText, status) {
  const btn = el("button", "btn btn-ghost", label);
  btn.type = "button";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getText());
      status.textContent = "Copied!";
    } catch (e) {
      status.textContent = "Couldn't copy. Press and hold to copy it instead.";
    }
    setTimeout(() => { status.textContent = ""; }, 2500);
  });
  return btn;
}

function stat(number, label, extraClass) {
  const box = el("div", "invite-stat" + (extraClass ? " " + extraClass : ""));
  box.append(el("strong", "invite-stat-number", String(number)), el("span", "invite-stat-label", label));
  return box;
}

function render(data) {
  const box = document.getElementById("invite");
  box.replaceChildren();
  const link = window.location.origin + "/signup.html?ref=" + encodeURIComponent(data.code);

  // ----- Your link and code -----
  const share = el("section", "invite-card invite-share");
  share.appendChild(el("h2", "section-title", "Your invite"));
  const linkLabel = el("label", "field-label", "Your invite link");
  linkLabel.htmlFor = "invite-link";
  const linkInput = el("input", "invite-link");
  linkInput.id = "invite-link";
  linkInput.type = "text";
  linkInput.readOnly = true;
  linkInput.value = link;
  linkInput.addEventListener("focus", () => linkInput.select());
  const status = el("p", "invite-status");
  status.setAttribute("aria-live", "polite");
  const buttons = el("div", "invite-buttons");
  if (navigator.share) {
    const shareBtn = el("button", "btn btn-solid", "Share");
    shareBtn.type = "button";
    shareBtn.addEventListener("click", () => {
      navigator.share({ title: "Join me on Byome", text: "Come join me on Byome, a community for honest beauty reviews. Use my invite:", url: link }).catch(() => {});
    });
    buttons.appendChild(shareBtn);
  }
  buttons.appendChild(copyButton("Copy link", () => link, status));
  const codeRow = el("p", "invite-code-row");
  codeRow.append("Or share your code: ", el("strong", "invite-code", data.code), " ");
  codeRow.appendChild(copyButton("Copy code", () => data.code, status));
  share.append(linkLabel, linkInput, buttons, codeRow, status);
  box.appendChild(share);

  // ----- Counts and the weekly limit -----
  const counts = el("section", "invite-card");
  counts.appendChild(el("h2", "section-title", "Your friends"));
  const stats = el("div", "invite-stats");
  const atLimit = data.rewarded_this_week >= data.weekly_limit;
  stats.append(
    stat(data.total, data.total === 1 ? "friend referred" : "friends referred"),
    stat(data.rewarded_this_week + " of " + data.weekly_limit, "bonuses this week", atLimit ? "is-full" : ""),
    stat(data.pending, "signed up, not counted yet"));
  counts.appendChild(stats);

  const left = data.weekly_limit - data.rewarded_this_week;
  if (atLimit) {
    const note = el("div", "invite-limit is-reached");
    note.setAttribute("role", "status");
    note.append(
      el("strong", null, "You've reached this week's limit of " + data.weekly_limit + " bonuses."),
      el("p", null, "Friends you refer before " + dayName(data.week_resets_at) +
        " still count toward your total and your milestones, but won't earn you points. Bonuses start again on " +
        dayName(data.week_resets_at) + "."));
    counts.appendChild(note);
  } else {
    counts.appendChild(el("p", "invite-limit",
      "You can earn a bonus for " + left + " more " + (left === 1 ? "friend" : "friends") + " this week. " +
      "The limit of " + data.weekly_limit + " resets every Monday (next: " + dayName(data.week_resets_at) + ")."));
  }
  box.appendChild(counts);

  // ----- Milestones -----
  const miles = el("section", "invite-card");
  miles.appendChild(el("h2", "section-title", "Milestones"));
  miles.appendChild(el("p", "field-hint", "Every friend you refer counts toward these, even past the weekly limit. Each one unlocks a special item for your shelf."));
  const list = el("ol", "invite-milestones");
  MILESTONES.forEach((n) => {
    const reached = data.total >= n;
    const li = el("li", "invite-milestone" + (reached ? " is-reached" : ""));
    const mark = el("span", "invite-milestone-mark", reached ? "✓" : String(n));
    mark.setAttribute("aria-hidden", "true");
    const text = el("span", "invite-milestone-text");
    text.appendChild(el("strong", null, n === 1 ? "1 friend" : n + " friends"));
    text.appendChild(el("span", null, reached ? "Reached!" : (n - data.total) + " to go"));
    li.append(mark, text);
    li.setAttribute("aria-label", (n === 1 ? "1 friend" : n + " friends") + ": " + (reached ? "reached" : (n - data.total) + " to go"));
    list.appendChild(li);
  });
  miles.appendChild(list);
  box.appendChild(miles);

  // ----- Who you've invited -----
  const people = el("section", "invite-card");
  people.appendChild(el("h2", "section-title", "Who you've invited"));
  const earlier = data.earlier || 0; // friends counted from before invites were tracked (no names)
  if (!data.friends.length && !earlier) {
    people.appendChild(el("p", "feed-empty", "Nobody yet. Share your link and they'll show up here once they sign up."));
  } else if (data.friends.length) {
    const ul = el("ul", "invite-friends");
    data.friends.forEach((f) => {
      const li = el("li", "invite-friend");
      const name = f.deleted ? el("span", "post-author is-deleted", "Deleted member") : el("a", "post-author", f.username);
      if (!f.deleted) name.href = "profile.html?user=" + encodeURIComponent(f.username);
      const state = f.qualified_at
        ? (f.rewarded ? "✓ Referred: you earned your bonus" : "✓ Referred: counted (over that week's limit, so no points)")
        : "Signed up " + UI.friendlyDate(f.joined_at) + ": waiting for their first review and a post or comment";
      li.append(name, el("span", "invite-friend-state" + (f.qualified_at ? " is-done" : ""), state));
      ul.appendChild(li);
    });
    people.appendChild(ul);
  }
  if (earlier) {
    people.appendChild(el("p", "invite-earlier",
      (data.friends.length ? "Plus " : "") + earlier + (earlier === 1 ? " friend" : " friends") +
      " you invited before invites were tracked. Thank you!"));
  }
  box.appendChild(people);

  // ----- How it works -----
  const how = el("section", "invite-card invite-how");
  how.appendChild(el("h2", "section-title", "How it works"));
  const steps = el("ol", "invite-steps");
  [
    "Your friend signs up with your link (or types your code when they sign up).",
    "They write a review, and make a post or leave a comment in the Community.",
    "You get " + BONUS_INVITER + ", and they get " + BONUS_FRIEND + ", enough for their first pot.",
  ].forEach((t) => steps.appendChild(el("li", null, t)));
  how.appendChild(steps);
  const rules = el("ul", "invite-rules");
  [
    "You can earn a bonus for up to " + data.weekly_limit + " friends a week. More still count toward your total and milestones.",
    "Each email address can only be invited once, even if the account is later deleted.",
    "Please only invite people you know, and never buy or sell codes. Bonuses can be removed if invites are misused.",
  ].forEach((t) => rules.appendChild(el("li", null, t)));
  how.appendChild(rules);
  box.appendChild(how);
}

(async function () {
  const { data: session } = await supabaseClient.auth.getSession();
  if (!session.session) { window.location.href = "login.html"; return; }
  const { data, error } = await supabaseClient.rpc("my_referrals");
  const box = document.getElementById("invite");
  if (error || !data) {
    box.replaceChildren(el("p", "feed-empty", "Invites aren't available yet. Please check back soon."));
    return;
  }
  render(data);
})();
