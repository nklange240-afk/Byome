// Homepage: members who are logged in get a welcome back and shortcuts,
// instead of the "join the community" pitch meant for visitors.
(async function () {
  // While an event is on, everyone sees a banner for it at the top
  if (typeof UI !== "undefined") UI.eventBanner(document.querySelector("main"));
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) return;
  const { data: me } = await supabaseClient.from("profiles")
    .select("username").eq("id", data.session.user.id).maybeSingle();

  document.getElementById("hero-title").textContent =
    "Welcome back" + (me && me.username ? ", " + me.username : "") + " \u{1F331}";
  document.getElementById("hero-sub").textContent =
    "Catch up on the community, find your next favorite product, or tend to your shelf.";

  const actions = document.getElementById("hero-actions");
  actions.replaceChildren();
  [["feed.html", "Community", "btn-solid"], ["reviews.html", "Reviews", "btn-ghost"], ["profile.html", "My shelf", "btn-ghost"]]
    .forEach(([href, text, style]) => {
      const a = document.createElement("a");
      a.href = href;
      a.className = "btn " + style;
      a.textContent = text;
      actions.appendChild(a);
    });

  showStarterChecklist();
})();

// ---------- Starter checklist ----------
// A quiet card under the welcome for new members: five first steps that
// tick themselves off as they're done. Finishing them all earns "Settled
// In" and 15 Byome points; "Hide" puts it away for good. The database
// decides who sees it (database/2026-11-16-starter-checklist.sql).
const STARTER_STEPS = [
  { key: "shelf", text: "Find your shelf", hint: "Your welcome sprout is waiting on your profile. Tap “Edit my shelf” to move things around.", href: "profile.html?shelf=edit" },
  { key: "profile", text: "Add a profile picture or bio", hint: "Help others get to know you.", href: "edit-profile.html" },
  { key: "review", text: "Write your first review", hint: "Something you love, or something you'd skip.", href: "reviews.html?write=1" },
  { key: "post", text: "Say hi in the Community", hint: "Make a post, or comment on one.", href: "feed.html" },
  { key: "shop", text: "Peek in the Byome Shop", hint: "See what your Byome points can grow.", href: "biome-shop.html" },
];

async function showStarterChecklist() {
  const { data, error } = await supabaseClient.rpc("my_starter_checklist");
  if (error || !data || !data.show) return;

  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const card = el("section", "starter");
  card.setAttribute("aria-labelledby", "starter-title");
  const done = STARTER_STEPS.filter((s) => data.steps[s.key]).length;

  const head = el("div", "starter-head");
  const title = el("h2", "starter-title", data.just_finished ? "All settled in! \u{1F389}" : "Getting started \u{1F331}");
  title.id = "starter-title";
  head.appendChild(title);
  const hide = el("button", "starter-hide", data.just_finished ? "Close" : "Hide");
  hide.type = "button";
  hide.setAttribute("aria-label", data.just_finished ? "Close" : "Hide the getting started checklist");
  hide.addEventListener("click", () => {
    card.remove();
    if (!data.just_finished) supabaseClient.rpc("mark_starter_step", { p_step: "hidden" }).then(() => {}, () => {});
  });
  head.appendChild(hide);
  card.appendChild(head);

  if (data.just_finished) {
    card.appendChild(el("p", "starter-sub", "You did all five first steps and earned Settled In, plus 15 Byome points. Make yourself at home!"));
    if (typeof UI !== "undefined") UI.checkAchievements();
  } else {
    card.appendChild(el("p", "starter-sub", "A few first steps, whenever you like. Do all five for 15 Byome points!"));
    const bar = el("div", "starter-progress");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(STARTER_STEPS.length));
    bar.setAttribute("aria-valuenow", String(done));
    bar.setAttribute("aria-label", done + " of " + STARTER_STEPS.length + " done");
    const fill = el("span", "starter-progress-fill");
    fill.style.width = (done / STARTER_STEPS.length * 100) + "%";
    bar.appendChild(fill);
    card.append(bar, el("p", "starter-count", done + " of " + STARTER_STEPS.length + " done"));
  }

  const list = el("ul", "starter-list");
  STARTER_STEPS.forEach((step) => {
    const isDone = Boolean(data.steps[step.key]);
    const li = el("li", "starter-step" + (isDone ? " is-done" : ""));
    const mark = el("span", "starter-mark", isDone ? "\u2713" : "");
    mark.setAttribute("aria-hidden", "true");
    const body = el("div", "starter-body");
    if (isDone) {
      body.appendChild(el("span", "starter-text", step.text));
      body.appendChild(el("span", "visually-hidden", " (done)"));
    } else {
      const link = el("a", "starter-text inline-link", step.text);
      link.href = step.href;
      body.append(link, el("span", "starter-hint", step.hint));
    }
    li.append(mark, body);
    list.appendChild(li);
  });
  card.appendChild(list);

  document.querySelector(".hero").after(card);
}
