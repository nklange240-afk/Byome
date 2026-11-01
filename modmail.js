// Mod mail: members message the moderator team (every moderator sees every
// conversation and can reply; members see replies as from "the Byome
// moderators"). Feedback comes here too.
//   modmail.html                 your conversations (moderators: everyone's)
//   modmail.html?new=message     write to the moderators
//   modmail.html?new=feedback    send feedback (the page you came from is noted);
//                                visitors without an account can send it too
//                                (database/2026-11-24-visitor-feedback.sql)
//   modmail.html?thread=ID       one conversation
// The data comes from database/2026-11-17-blocks-modmail.sql.
const box = document.getElementById("modmail");
const params = new URLSearchParams(window.location.search);
const CONTACT = "hello@byome.xyz";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(href, text, className) {
  const a = el("a", className || "inline-link", text);
  a.href = href;
  return a;
}

const KIND_LABELS = { message: "Message", block: "Block", feedback: "Feedback" };

// "This is urgent": moved to the top of the moderators' list and emailed
// to the Byome inbox (database/2026-12-04-urgent-modmail.sql)
function urgentBox(id) {
  const wrap = el("div", "modmail-urgent-field");
  const row = el("label", "check-row");
  const box = el("input");
  box.type = "checkbox";
  box.id = id;
  const hint = el("p", "field-hint",
    "Tick this if someone's safety is at risk (threats, harassment, self-harm or illegal content), or if something " +
    "important on Byome isn't working at all, like logging in, posting or reviewing. Urgent messages go to the top of " +
    "the moderators' list and are emailed to the Byome inbox. If someone is in immediate danger, contact local emergency services first.");
  hint.id = id + "-hint";
  box.setAttribute("aria-describedby", hint.id);
  row.append(box, document.createTextNode(" This is urgent"));
  wrap.append(row, hint);
  return { wrap, box };
}

function urgentTag() {
  return el("span", "post-category-tag modmail-urgent", "Urgent");
}

// Automod words in mod mail aren't held, just hidden until someone chooses
// to read them (database/2026-11-25-modmail-automod.sql).
// What each kind means, since the names alone are easy to mix up
const FLAG_MEANINGS = {
  strong: "swearing",
  explicit: "sexual words",
  offensive: "slurs or hateful words",
  harmful: "threats, self-harm or abuse",
};

// {offensive,strong} -> "may contain offensive and strong language
// (slurs or hateful words; swearing)"
function flagPhrase(flags) {
  if (!flags || !flags.length) return "";
  const list = flags.length === 1 ? flags[0] : flags.slice(0, -1).join(", ") + " and " + flags[flags.length - 1];
  return "may contain " + list + " language (" + flags.map((f) => FLAG_MEANINGS[f] || f).join("; ") + ")";
}

// A note in place of `content`, with a button to show it. Moderators are
// reminded they can leave it for someone else.
function hiddenBehind(content, what, flags, buttonText, forMods) {
  const wrap = el("div", "flagged-hidden");
  const note = el("p", "flagged-note", what + " " + flagPhrase(flags) + ".");
  wrap.appendChild(note);
  if (forMods) {
    wrap.appendChild(el("p", "flagged-kind",
      "If you'd rather not see it right now, that's completely okay. Leave it for another moderator."));
  }
  const show = el("button", "btn btn-ghost flagged-show", buttonText);
  show.type = "button";
  show.addEventListener("click", () => { wrap.replaceWith(content); });
  wrap.appendChild(show);
  return wrap;
}

function say(target, text, good) {
  target.textContent = text;
  target.style.color = good ? "" : "#E07A5F";
}

// ---------- Your conversations ----------
async function showList(isMod) {
  box.replaceChildren();
  const intro = el("p", "modmail-intro", isMod
    ? "Messages, feedback and block notes from members. Every moderator sees every conversation; members see your replies as from “the Byome moderators”, never your name."
    : "Message the Byome moderators about anything: a question, a problem with another member, or an idea. Every moderator can see your messages, and replies come from the moderator team.");
  box.appendChild(intro);

  const actions = el("div", "modmail-actions");
  actions.append(link("modmail.html?new=message", "New message", "btn btn-solid"),
    link("modmail.html?new=feedback", "Send feedback", "btn btn-ghost"));
  box.appendChild(actions);

  let filter = "waiting";
  const tabs = el("div", "category-chips modmail-tabs");
  const listEl = el("div", "modmail-list");
  if (isMod) {
    [["waiting", "Waiting for a reply"], ["open", "Open"], ["all", "Everything"], ["mine", "My own"]].forEach(([key, text]) => {
      const b = el("button", "category-chip", text);
      b.type = "button";
      b.setAttribute("aria-pressed", String(key === filter));
      b.addEventListener("click", () => {
        filter = key;
        tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        load();
      });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
  }
  box.appendChild(listEl);

  async function load() {
    listEl.replaceChildren(el("p", "feed-empty is-loading", "Loading…"));
    const { data, error } = await supabaseClient.rpc("modmail_list", { p_mine: filter === "mine" });
    listEl.replaceChildren();
    if (error) { listEl.appendChild(el("p", "feed-empty", "Couldn't load mod mail: " + error.message)); return; }
    let rows = data || [];
    if (isMod && filter === "waiting") rows = rows.filter((t) => t.status === "open" && t.last_from === "member");
    if (isMod && filter === "open") rows = rows.filter((t) => t.status === "open");
    if (!rows.length) {
      listEl.appendChild(el("p", "feed-empty", isMod && filter === "waiting" ? "Nothing waiting. All caught up!" : "No conversations yet."));
      return;
    }
    rows.forEach((t) => {
      const a = el("a", "modmail-row" + (t.status === "closed" ? " is-closed" : ""));
      a.href = "modmail.html?thread=" + t.id;
      const top = el("div", "modmail-row-top");
      const hideSubject = !t.mine && t.subject_flags && t.subject_flags.length;
      top.append(el("span", "post-category-tag", KIND_LABELS[t.kind] || t.kind));
      if (t.urgent) top.append(urgentTag());
      top.append(hideSubject
        ? el("em", "modmail-subject", "Subject hidden: it " + flagPhrase(t.subject_flags))
        : el("strong", "modmail-subject", t.subject));
      a.appendChild(top);
      const meta = el("p", "modmail-meta");
      const bits = [];
      if (isMod && filter !== "mine" && t.member) bits.push("From " + t.member);
      else if (isMod && t.from_visitor) bits.push("From a visitor");
      if (t.about) bits.push("about " + t.about);
      bits.push(t.count === 1 ? "1 message" : t.count + " messages");
      meta.append(document.createTextNode(bits.join(" · ") + " · "), UI.timeTag(t.updated_at));
      a.appendChild(meta);
      // Who's turn it is
      let state;
      if (t.status === "closed") state = el("span", "modmail-state", "Done");
      else if (t.last_from === "mods") state = el("span", "modmail-state is-replied", isMod && filter !== "mine" ? "Replied" : "Moderators replied");
      else state = el("span", "modmail-state is-waiting", isMod && filter !== "mine" ? "Needs a reply" : "Waiting for the moderators");
      a.appendChild(state);
      listEl.appendChild(a);
    });
  }
  load();
}

// ---------- Writing to the moderators ----------
function showCompose(kind) {
  box.replaceChildren();
  const feedback = kind === "feedback";
  document.querySelector("h1").textContent = feedback ? "Send feedback" : "Message the moderators";
  box.appendChild(el("p", "modmail-intro", feedback
    ? "Found a bug, got an idea, or something just felt off? Tell us! Every moderator can see it, and we read everything."
    : "Every moderator can see your message, and replies come from the moderator team."));

  const form = el("form", "stacked-form modmail-form");
  const subjLabel = el("label", "field-label", feedback ? "What's it about?" : "Subject");
  const subject = el("input", "text-input");
  subject.id = "modmail-subject";
  subject.maxLength = 120;
  subject.required = true;
  subject.placeholder = feedback ? "e.g. The shop page froze on my phone" : "e.g. A question about a removed post";
  subjLabel.htmlFor = subject.id;
  const bodyLabel = el("label", "field-label", feedback ? "Tell us more" : "Message");
  const body = el("textarea", "text-input modmail-body");
  body.id = "modmail-body";
  body.rows = 6;
  body.maxLength = 2000;
  body.required = true;
  bodyLabel.htmlFor = body.id;
  if (feedback) body.placeholder = "What happened, and on which page? If it's a bug, what were you doing just before?";
  const urgent = urgentBox("modmail-urgent");
  const send = el("button", "btn btn-solid", feedback ? "Send feedback" : "Send to the moderators");
  send.type = "submit";
  const message = el("p", "auth-message");
  message.setAttribute("aria-live", "polite");
  const cancel = link("modmail.html", "Cancel");
  const row = el("div", "modmail-send-row");
  row.append(send, cancel);
  form.append(subjLabel, subject, bodyLabel, body, urgent.wrap, row, message);
  box.appendChild(form);

  // Where the feedback was sent from (the page they were on)
  let page = null;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === window.location.origin && !/modmail\.html/.test(ref.pathname)) page = ref.pathname + ref.search;
  } catch (e) { page = null; }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    send.disabled = true;
    say(message, "Sending…", true);
    const { data: id, error } = await supabaseClient.rpc("modmail_start", {
      p_kind: feedback ? "feedback" : "message", p_subject: subject.value.trim(), p_body: body.value.trim(),
      p_about: null, p_page: page, p_urgent: urgent.box.checked,
    });
    if (error) { say(message, error.message, false); send.disabled = false; return; }
    window.location.href = "modmail.html?thread=" + id + "&sent=1";
  });
  subject.focus();
}

// ---------- Feedback from visitors (no account needed) ----------
const VISITOR_TOPICS = ["Why I didn't join", "Something's broken", "Something confusing", "An idea", "Something I liked"];

function showVisitorFeedback() {
  box.replaceChildren();
  document.querySelector("h1").textContent = "Send feedback";
  document.title = "Send feedback — Byome";
  box.appendChild(el("p", "modmail-intro",
    "No account needed. Tell us anything: what you liked, what confused you, or why Byome isn't for you (yet). " +
    "Good or bad, it all helps, and every moderator reads it."));

  const form = el("form", "stacked-form modmail-form");
  const topicLabel = el("p", "field-label", "What's it about? (optional)");
  const topics = el("div", "category-chips quick-picks");
  topics.setAttribute("role", "group");
  topics.setAttribute("aria-label", "What's it about?");
  let topic = "";
  VISITOR_TOPICS.forEach((text) => {
    const b = el("button", "category-chip", text);
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      topic = topic === text ? "" : text;
      topics.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.textContent === topic)));
    });
    topics.appendChild(b);
  });

  const bodyLabel = el("label", "field-label", "Your feedback");
  const body = el("textarea", "text-input modmail-body");
  body.id = "visitor-body";
  body.rows = 6;
  body.maxLength = 2000;
  body.required = true;
  body.placeholder = "What's on your mind?";
  bodyLabel.htmlFor = body.id;

  const contactLabel = el("label", "field-label", "Email or another way to reach you (optional)");
  const contact = el("input", "text-input");
  contact.id = "visitor-contact";
  contact.maxLength = 200;
  contact.autocomplete = "email";
  contactLabel.htmlFor = contact.id;
  const contactHint = el("p", "field-hint",
    "Only if you'd like us to follow up. Only the moderators see it, and we'll only use it to reply to this. Leave it blank to stay anonymous.");

  // Hidden from people; bots that fill in every box fill this in too
  const trapWrap = el("div", "visually-hidden");
  trapWrap.setAttribute("aria-hidden", "true");
  const trap = el("input");
  trap.name = "website";
  trap.tabIndex = -1;
  trap.autocomplete = "off";
  trapWrap.append(el("label", null, "Leave this empty"), trap);

  const send = el("button", "btn btn-solid", "Send feedback");
  send.type = "submit";
  const message = el("p", "auth-message");
  message.setAttribute("aria-live", "polite");
  const row = el("div", "modmail-send-row");
  row.appendChild(send);
  const urgent = urgentBox("visitor-urgent");
  form.append(topicLabel, topics, bodyLabel, body, contactLabel, contact, contactHint, urgent.wrap, trapWrap, row, message);
  box.appendChild(form);

  const joinLine = el("p", "field-hint");
  joinLine.append(document.createTextNode("Already a member? "), link("login.html", "Log in"),
    document.createTextNode(" to send feedback you can follow in mod mail."));
  box.appendChild(joinLine);

  let page = null;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === window.location.origin && !/modmail\.html/.test(ref.pathname)) page = ref.pathname + ref.search;
  } catch (e) { page = null; }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    send.disabled = true;
    say(message, "Sending…", true);
    const { error } = await supabaseClient.rpc("visitor_feedback", {
      p_subject: topic || "Feedback", p_body: body.value.trim(), p_contact: contact.value.trim() || null,
      p_page: page, p_trap: trap.value, p_urgent: urgent.box.checked,
    });
    if (error) {
      say(message, /visitor_feedback/.test(error.message)
        ? "Sorry, that didn't send. Please email us at " + CONTACT + " instead."
        : error.message, false);
      send.disabled = false;
      return;
    }
    box.replaceChildren();
    box.appendChild(el("p", "modmail-sent", "Thank you! Your feedback is with the moderators." +
      (contact.value.trim() ? " If we have questions, we'll get in touch." : "")));
    const next = el("p", "modmail-intro");
    next.append(document.createTextNode("Changed your mind about Byome? "), link("signup.html", "Join here"),
      document.createTextNode(", or "), link("reviews.html", "keep browsing reviews"), document.createTextNode("."));
    box.appendChild(next);
  });
  body.focus();
}

// ---------- One conversation ----------
async function showThread(id) {
  const { data: t, error } = await supabaseClient.rpc("modmail_thread", { p_thread: id });
  box.replaceChildren();
  if (error || !t) {
    box.append(el("p", "feed-empty", "We couldn't find that conversation."), link("modmail.html", "Back to mod mail"));
    return;
  }
  const hideSubject = !t.mine && t.subject_flags && t.subject_flags.length;
  document.title = (hideSubject ? "Mod mail" : t.subject + " — Mod mail") + " — Byome";

  const back = link("modmail.html", "← All mod mail", "inline-link modmail-back");
  box.appendChild(back);
  // The conversation's subject, as its own heading above the messages
  const title = el("h2", "modmail-thread-title");
  const subjectText = el("span", null, t.subject);
  title.append(el("span", "post-category-tag", KIND_LABELS[t.kind] || t.kind));
  if (t.urgent) title.append(urgentTag());
  title.append(hideSubject ? hiddenBehind(subjectText, "The subject", t.subject_flags, "Show subject", t.as_mod) : subjectText);
  box.appendChild(title);
  if (params.get("sent") === "1") {
    box.appendChild(el("p", "modmail-sent", t.kind === "feedback"
      ? "Thanks for the feedback! The moderators will take a look."
      : "Sent! The moderators will reply here, and you'll get a notification when they do."));
  }

  const meta = el("p", "modmail-meta");
  const bits = [];
  if (t.as_mod && t.member) bits.push("From " + t.member);
  else if (t.as_mod && t.from_visitor) bits.push("From a visitor (no account)");
  if (t.about) bits.push("about " + t.about);
  if (t.as_mod && t.page) bits.push("sent from " + t.page);
  if (t.as_mod && t.urgent) bits.push(t.emailed ? "emailed to the inbox" : "not emailed (over the daily limit, or email isn't set up)");
  bits.push(t.status === "closed" ? "Marked done" : "Open");
  meta.textContent = bits.join(" · ");
  box.appendChild(meta);

  const list = el("div", "modmail-messages");
  t.messages.forEach((m) => {
    const msg = el("div", "modmail-message" + (m.from_mods ? " is-mods" : "") + (m.mine ? " is-mine" : ""));
    const who = el("p", "modmail-who");
    who.append(el("strong", null, m.mine ? "You" : m.sender || "Deleted member"));
    if (m.from_mods && t.as_mod && !m.mine) who.append(document.createTextNode(" (moderator)"));
    who.append(document.createTextNode(" · "), UI.timeTag(m.created_at));
    // (links from the moderators are clickable)
    const text = UI.linkify(el("p", "modmail-text", m.body), Boolean(m.from_mods));
    msg.append(who, !m.mine && m.flags && m.flags.length
      ? hiddenBehind(text, "This message", m.flags, "Show message", t.as_mod) : text);
    list.appendChild(msg);
  });
  box.appendChild(list);

  // A visitor can't see replies here: follow up with them directly, if they
  // left a way to reach them
  if (t.from_visitor) {
    const note = el("div", "modmail-visitor-note");
    if (t.contact) {
      const how = el("p");
      how.append(el("strong", null, "They'd like to hear back at: "));
      how.append(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.contact)
        ? link("mailto:" + t.contact + "?subject=" + encodeURIComponent("Re: " + t.subject + " (Byome)"), t.contact)
        : document.createTextNode(t.contact));
      note.appendChild(how);
      note.appendChild(el("p", "field-hint", "Visitors can't see replies on Byome, so reply from hello@byome.xyz if you follow up. Please only use this to follow up on their feedback."));
    } else {
      note.appendChild(el("p", "field-hint", "This visitor didn't leave a way to reach them, so there's no reply to send. Mark it done once it's been read."));
    }
    box.appendChild(note);
  }

  if (t.status === "closed" && !t.as_mod) {
    box.appendChild(el("p", "field-hint", "The moderators marked this as done. You can still reply, and it'll open again."));
  }

  // Reply
  const form = el("form", "modmail-reply");
  const label = el("label", "field-label", t.as_mod ? "Reply as the Byome moderators" : "Reply");
  const body = el("textarea", "text-input modmail-body");
  body.id = "modmail-reply";
  body.rows = 4;
  body.maxLength = 2000;
  body.required = true;
  label.htmlFor = body.id;
  if (t.as_mod) body.placeholder = "Members see this as from “the Byome moderators”.";
  const send = el("button", "btn btn-solid", "Send reply");
  send.type = "submit";
  const message = el("p", "auth-message");
  message.setAttribute("aria-live", "polite");
  const row = el("div", "modmail-send-row");
  row.appendChild(send);

  if (t.as_mod) {
    const toggle = el("button", "btn btn-ghost", t.status === "closed" ? "Open again" : "Mark done");
    toggle.type = "button";
    toggle.addEventListener("click", async () => {
      toggle.disabled = true;
      const { error: err } = await supabaseClient.rpc("modmail_set_status",
        { p_thread: t.id, p_status: t.status === "closed" ? "open" : "closed" });
      if (err) { say(message, err.message, false); toggle.disabled = false; return; }
      showThread(t.id);
    });
    row.appendChild(toggle);
  }
  // (no reply box for a visitor's feedback: they can't see replies here)
  if (t.from_visitor) { send.remove(); form.append(row, message); }
  else form.append(label, body, row, message);
  box.appendChild(form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    send.disabled = true;
    const { error: err } = await supabaseClient.rpc("modmail_reply", { p_thread: t.id, p_body: body.value.trim() });
    if (err) { say(message, err.message, false); send.disabled = false; return; }
    params.delete("sent");
    showThread(t.id);
  });
}

// ---------- Start ----------
(async function () {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    // Visitors can send feedback; conversations with the moderators need an account
    if (params.get("new") !== "message" && !params.get("thread")) { showVisitorFeedback(); return; }
    box.replaceChildren();
    const p = el("p", "modmail-intro");
    p.append(link("login.html", "Log in"), document.createTextNode(" to message the moderators. Not a member? You can still "),
      link("modmail.html?new=feedback", "send us feedback"), document.createTextNode(", or email us at "),
      link("mailto:" + CONTACT, CONTACT), document.createTextNode("."));
    box.appendChild(p);
    return;
  }
  const { data: me } = await supabaseClient.from("profiles").select("is_moderator").eq("id", data.session.user.id).maybeSingle();
  const isMod = Boolean(me && me.is_moderator);

  const thread = params.get("thread");
  const kind = params.get("new");
  if (thread) showThread(thread);
  else if (kind === "message" || kind === "feedback") showCompose(kind);
  else showList(isMod);
})();
