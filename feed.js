const feedEl = document.getElementById("feed");
const postForm = document.getElementById("post-form");
const postTitle = document.getElementById("post-title");
const postBody = document.getElementById("post-body");
const postMessage = document.getElementById("post-message");
const postCategory = document.getElementById("post-category");
const categoryFilter = document.getElementById("category-filter");

// After this many levels of replies, deeper replies stop indenting
// so threads stay readable on small screens.
const MAX_INDENT_DEPTH = 4;

let currentUser = null;
let isModerator = false;
let selectedCategory = ""; // "" means all categories
let selectedEvent = "";    // the event chip: only that event's posts
let liveEvent = null;      // the event that's on, if any
let canSeeBeta = false;    // beta testers and moderators: the Beta Testing tab
const eventNames = {};     // event key -> name, for the tags on posts

// The orange tag on an event's posts, with the event's little icon
// (biome-assets/icon-event-<key>.png; just the name if there isn't one)
function eventTag(key) {
  const tag = el("span", "post-category-tag is-event");
  const icon = document.createElement("img");
  icon.className = "event-tag-icon";
  icon.src = "biome-assets/icon-event-" + key + ".png";
  icon.alt = "";
  icon.addEventListener("error", () => icon.remove());
  tag.append(icon, eventNames[key]);
  return tag;
}

// A post's category, as a tag (Beta Testing ones in their own colours)
function categoryTag(category) {
  return el("span", "post-category-tag" + (category === BETA_CATEGORY ? " is-beta" : ""), category);
}

// ---------- The Beta Testing tab ----------
// Only beta testers and moderators can see its posts and comments
// (database/2026-12-08-beta-event.sql). They get a "Beta Testing" chip and
// category; its posts stay out of "All", so they're never mixed in with
// what everyone can see.
const BETA_CATEGORY = "Beta Testing";

async function setUpBeta() {
  const { data, error } = await supabaseClient.rpc("can_see_beta");
  canSeeBeta = Boolean(!error && data);
  if (!canSeeBeta) return;
  const option = document.createElement("option");
  option.value = BETA_CATEGORY;
  option.textContent = BETA_CATEGORY + " (testers only)";
  postCategory.appendChild(option);

  const chip = el("button", "category-chip is-beta", BETA_CATEGORY);
  chip.type = "button";
  chip.dataset.value = BETA_CATEGORY;
  // events.html links here with ?tab=beta
  const opening = new URLSearchParams(window.location.search).get("tab") === "beta";
  if (opening) {
    selectedCategory = BETA_CATEGORY;
    categoryFilter.querySelectorAll(".category-chip").forEach((b) => b.setAttribute("aria-pressed", "false"));
  }
  chip.setAttribute("aria-pressed", String(opening));
  // (just after "All")
  const all = categoryFilter.querySelector(".category-chip");
  if (all) all.after(chip); else categoryFilter.appendChild(chip);

  const note = el("p", "beta-tab-note", "\ud83d\udd12 Only beta testers and moderators can see posts in Beta Testing.");
  note.id = "beta-tab-note";
  note.hidden = !opening;
  categoryFilter.after(note);
}

// "All" leaves out the Beta Testing tab's posts
function notBeta(query) {
  return canSeeBeta ? query.or('category.is.null,category.neq."' + BETA_CATEGORY + '"') : query;
}

// Small helper: create an element with a class and text in one line.
// It uses textContent, so user-written text can never inject HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A username that links to that member's profile
// A member's picture and name, linking to their profile (profile-fields.js)
function authorLink(profile) {
  return PROFILES.authorLink(profile);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildMeta(profile, createdAt, editedAt) {
  const meta = el("div", "post-meta");
  meta.append(authorLink(profile), UI.timeTag(createdAt));
  if (editedAt) {
    const tag = el("span", "edited-tag", "edited");
    tag.title = "Edited " + formatDate(editedAt);
    meta.appendChild(tag);
  }
  return meta;
}

// Shown (to the author and moderators only) on anything automod is holding
function heldNotice() {
  return el("p", "held-notice", "Waiting for a moderator to review. Only you and moderators can see this for now.");
}

function actionButton(label) {
  const btn = el("button", "action-btn", label);
  btn.type = "button";
  return btn;
}

// A little leaf drawn as SVG. It takes the button's text color, and CSS
// fills it in when the item is liked.
function leafIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "leaf-icon");
  svg.setAttribute("aria-hidden", "true");

  const body = document.createElementNS(ns, "path");
  body.setAttribute("class", "leaf-body");
  body.setAttribute("d", "M20 4C10 4 4.5 9.5 4.5 15c0 2.2 1.3 4 3.5 4C14.5 19 20 14 20 4z");

  const vein = document.createElementNS(ns, "path");
  vein.setAttribute("class", "leaf-vein");
  vein.setAttribute("d", "M3.5 21C7 15 11 11.5 15 9");

  svg.append(body, vein);
  return svg;
}

// One like button for both posts and comments.
// table: "likes" or "comment_likes"; idColumn: "post_id" or "comment_id";
// likes: the list of {user_id} rows already loaded for this item.
function buildLikeButton(table, idColumn, id, likes) {
  let liked = likes.some((l) => l.user_id === currentUser.id);
  let count = likes.length;

  const btn = actionButton("");
  btn.classList.add("like-btn");

  function paint() {
    btn.innerHTML = "";
    btn.append(leafIcon(), el("span", null, String(count)));
    btn.setAttribute("aria-pressed", String(liked));
    // "Like, 3 likes" plus pressed/not pressed (aria-pressed) says it all
    btn.setAttribute("aria-label", "Like, " + count + (count === 1 ? " like" : " likes"));
    btn.classList.toggle("is-liked", liked);
  }
  paint();

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    if (liked) {
      const { error } = await supabaseClient
        .from(table).delete()
        .eq(idColumn, id).eq("user_id", currentUser.id);
      if (!error) { liked = false; count--; }
    } else {
      const { error } = await supabaseClient
        .from(table).insert({ [idColumn]: id, user_id: currentUser.id });
      if (!error) { liked = true; count++; }
    }
    paint();
    btn.classList.toggle("just-liked", liked); // the leaf gives a little pop
    btn.disabled = false;
  });

  return btn;
}

// ---------- Startup ----------

async function init() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
    return;
  }

  currentUser = data.session.user;
  // Moderators can pin posts
  const { data: me } = await supabaseClient.from("profiles").select("is_moderator").eq("id", currentUser.id).maybeSingle();
  isModerator = Boolean(me && me.is_moderator);

  UI.eventBanner(document.querySelector("main"), document.querySelector("main > h1"));
  DAILY.card(document.querySelector("main"), document.querySelector("main > h1"));
  await setUpBeta();
  await setUpEvents();
  await REPORTS.loadMine(currentUser.id); // so flags you've used start red
  await loadPosts();
  showLinkedPost();
}

// ---------- Opening a post from a notification ----------
// feed.html?post=<id>&comment=<id> (from the Notifications page) scrolls to
// that post with its comments open and picks out the comment. If the post
// isn't among the ones already showing, it's added to the top.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function showLinkedPost() {
  const params = new URLSearchParams(window.location.search);
  const postId = params.get("post");
  const commentId = params.get("comment");
  if (!postId || !UUID.test(postId)) return;
  // Only jump once; a refresh starts at the top as usual
  history.replaceState(null, "", window.location.pathname);

  let article = feedEl.querySelector('.post[data-post-id="' + postId + '"]');
  if (!article) {
    const { data: post } = await supabaseClient.from("posts").select(POST_COLUMNS).eq("id", postId).maybeSingle();
    if (!post) {
      feedEl.prepend(el("p", "feed-empty linked-missing", "That post isn't here any more. It may have been deleted."));
      return;
    }
    const pollResults = POLLS.pollOf(post) ? await POLLS.results([post.id]) : new Map();
    article = buildPost(post, pollResults.get(post.id));
    feedEl.prepend(article);
  }

  // (from the Events page: feed.html?post=<id>&comments=open)
  if ((commentId && UUID.test(commentId)) || params.get("comments") === "open") await article._openComments();
  const comment = commentId && article.querySelector('.comment[data-comment-id="' + commentId + '"]');
  const target = comment || article;
  const still = typeof A11Y !== "undefined" ? A11Y.reducedMotion() : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  target.classList.add("is-linked");
  setTimeout(() => target.classList.remove("is-linked"), 4000);
}

// ---------- Posts ----------

// Posts load 20 at a time; "Load more" adds the next 20. Reloading after
// an edit or a new post keeps however many were already showing.
const PAGE_SIZE = 20;
let postsShown = 0;
let POST_COLUMNS = "id, title, body, category, created_at, edited_at, held_at, user_id, profiles!user_id(username, avatar_path, avatar_ring, profile_biome, show_biome_symbol, is_moderator, badge, level), likes(user_id), comments(count), polls(closes_at, poll_options(id, label, position))";

// Events (database/2026-10-29-events-halloween.sql): which event a post is
// part of, and whether a moderator featured it. Left out until that's run.
async function setUpEvents() {
  const probe = await supabaseClient.from("posts").select("event_key, featured_at").limit(1);
  if (probe.error) return;
  POST_COLUMNS += ", event_key, featured_at";
  const { data: events } = await supabaseClient.from("events").select("key, name");
  (events || []).forEach((e) => { eventNames[e.key] = e.name; });
  liveEvent = await UI.liveEvent();
  if (!liveEvent) return;

  // "Part of Haunted Harvest" on the post form
  document.getElementById("post-event-label").textContent = "Part of " + liveEvent.name;
  document.getElementById("post-event-row").hidden = false;

  // An orange chip beside the categories, for the event's posts
  const chip = el("button", "category-chip is-event", liveEvent.name);
  chip.type = "button";
  chip.dataset.event = liveEvent.key;
  chip.setAttribute("aria-pressed", "false");
  categoryFilter.appendChild(chip);
}

async function loadPosts(more) {
  const from = more === true ? postsShown : 0;
  const to = (more === true ? postsShown + PAGE_SIZE : Math.max(PAGE_SIZE, postsShown)) - 1;
  let query = supabaseClient
    .from("posts")
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);

  if (selectedEvent) query = query.eq("event_key", selectedEvent);
  else if (selectedCategory) query = query.eq("category", selectedCategory);
  else query = notBeta(query);
  const betaNote = document.getElementById("beta-tab-note");
  if (betaNote) betaNote.hidden = selectedCategory !== BETA_CATEGORY || Boolean(selectedEvent);

  // Pinned posts go first (only on the first page); they're left out of
  // the list below so they don't show twice
  const pinned = more === true ? [] : await loadPinned();
  const { data: posts, error } = await query;

  if (more === true) feedEl.querySelectorAll(".load-more").forEach((b) => b.remove());
  else feedEl.innerHTML = "";

  if (error) {
    console.error("Failed to load posts:", error);
    feedEl.appendChild(el("p", "feed-empty", "Couldn't load posts: " + error.message));
    return;
  }

  if (posts.length === 0 && more !== true) {
    postsShown = 0;
    const text = selectedEvent
      ? "No " + (eventNames[selectedEvent] || "event") + " posts yet. Be the first to start one!"
      : selectedCategory
      ? "No " + selectedCategory + " posts yet. Be the first to start one!"
      : "No posts yet. Be the first to start one!";
    feedEl.appendChild(UI.emptyState({ image: "biome-assets/plant-welcome-sprout.png", text: text }));
    return;
  }

  // Poll results for any polls, in one go
  const pollResults = await POLLS.results(posts.concat(pinned).filter((p) => POLLS.pollOf(p)).map((p) => p.id));
  pinned.forEach((post) => feedEl.appendChild(buildPost(post, pollResults.get(post.id))));
  posts.forEach((post) => {
    // (a post opened from a notification, or a pinned one, may already be showing)
    if (feedEl.querySelector('.post[data-post-id="' + post.id + '"]')) return;
    feedEl.appendChild(buildPost(post, pollResults.get(post.id)));
  });
  postsShown = from + posts.length;
  if (posts.length === to - from + 1) feedEl.appendChild(loadMoreButton(() => loadPosts(true)));
}

// Posts a moderator has pinned (newest pin first), in the chosen category.
// pinned_at comes from database/2026-10-29-events-halloween.sql; until
// that's run there are none.
// While an event is on, its featured posts sit up there too.
async function loadPinned() {
  const narrow = (q) => (selectedEvent ? q.eq("event_key", selectedEvent) : selectedCategory ? q.eq("category", selectedCategory) : notBeta(q));
  const pinnedQ = narrow(supabaseClient.from("posts").select(POST_COLUMNS + ", pinned_at")
    .not("pinned_at", "is", null).order("pinned_at", { ascending: false }).limit(5));
  const featuredQ = liveEvent ? narrow(supabaseClient.from("posts").select(POST_COLUMNS + ", pinned_at")
    .eq("event_key", liveEvent.key).not("featured_at", "is", null).order("featured_at", { ascending: false }).limit(5)) : null;
  const [pinned, featured] = await Promise.all([pinnedQ, featuredQ || Promise.resolve({ data: [] })]);
  const list = [];
  (pinned.error ? [] : pinned.data || []).concat(featured.error ? [] : featured.data || []).forEach((p) => {
    if (!list.some((x) => x.id === p.id)) list.push(p);
  });
  return list;
}

function eventChosen() {
  return Boolean(liveEvent && document.getElementById("post-event").checked && !document.getElementById("post-event-row").hidden);
}

function loadMoreButton(onClick) {
  const btn = el("button", "btn btn-ghost load-more", "Load more");
  btn.type = "button";
  btn.addEventListener("click", () => { btn.disabled = true; btn.textContent = "Loading…"; btn.classList.add("is-loading"); onClick(); });
  return btn;
}

function buildPost(post, pollResult) {
  const featuredNow = Boolean(post.featured_at && liveEvent && post.event_key === liveEvent.key);
  const article = el("article", "post" + (post.pinned_at || featuredNow ? " is-pinned" : ""));
  article.dataset.postId = post.id;
  if (featuredNow) article.appendChild(el("p", "post-pinned-tag is-event", "Featured in " + liveEvent.name));
  else if (post.pinned_at) article.appendChild(el("p", "post-pinned-tag", "Pinned"));
  const poll = POLLS.pollOf(post);
  if (poll) article.classList.add("has-poll");

  // Older posts made before headings existed have no title
  if (post.title) {
    const titleRow = el("div", "post-title-row");
    titleRow.appendChild(el("h2", "post-title", post.title));
    if (post.category) titleRow.appendChild(categoryTag(post.category));
    if (post.event_key && eventNames[post.event_key]) titleRow.appendChild(eventTag(post.event_key));
    article.appendChild(titleRow);
  } else if (post.category) {
    article.appendChild(categoryTag(post.category));
  }
  article.appendChild(buildMeta(post.profiles, post.created_at, post.edited_at));
  if (post.held_at) article.appendChild(heldNotice());
  if (post.body) article.appendChild(el("p", "post-body", post.body));
  let pollVotes = pollResult ? pollResult.total : 0;
  if (poll) {
    const pollBox = POLLS.render(post, pollResult);
    // Once anybody votes, the poll can't be edited any more
    pollBox.onVoted = (r) => { pollVotes = r.total; if (pollVotes > 0 && editBtn) editBtn.remove(); };
    article.appendChild(pollBox);
  }
  let editBtn = null;

  const likeBtn = buildLikeButton("likes", "post_id", post.id, post.likes);

  // --- Comments toggle ---
  let commentCount = post.comments.length ? post.comments[0].count : 0;
  let commentsLoaded = false;
  const commentsBtn = actionButton("");
  commentsBtn.setAttribute("aria-expanded", "false");

  function paintCommentsBtn() {
    commentsBtn.textContent = commentCount === 0 ? "Leave a comment"
      : commentCount === 1 ? "1 comment" : commentCount + " comments";
  }
  paintCommentsBtn();

  const commentsSection = el("div", "comments");
  commentsSection.hidden = true;

  async function refreshComments() {
    const comments = await fetchComments(post.id);
    if (comments === null) {
      commentsSection.innerHTML = "";
      commentsSection.appendChild(el("p", "feed-empty", "Couldn't load comments. Close and reopen to try again."));
      commentsLoaded = false;
      return;
    }
    commentsLoaded = true;
    commentCount = comments.length;
    paintCommentsBtn();
    renderCommentSection(commentsSection, post.id, comments, refreshComments);
  }

  commentsBtn.addEventListener("click", () => {
    const opening = commentsSection.hidden;
    commentsSection.hidden = !opening;
    commentsBtn.setAttribute("aria-expanded", String(opening));
    if (opening && !commentsLoaded) refreshComments();
  });

  // Opens the comments and waits for them (used when arriving from a notification)
  article._openComments = async () => {
    commentsSection.hidden = false;
    commentsBtn.setAttribute("aria-expanded", "true");
    if (!commentsLoaded) await refreshComments();
  };

  const actions = el("div", "post-actions");
  actions.append(likeBtn, commentsBtn);

  if (post.user_id === currentUser.id) {
    // Polls can only be edited until somebody votes
    if (!poll || pollVotes === 0) {
      const edit = actionButton("Edit");
      editBtn = edit;
      edit.addEventListener("click", () => {
        if (article.querySelector(".edit-form")) return;
        const parts = [".post-title", ".post-body", ".poll"].map((sel) => article.querySelector(sel)).filter(Boolean);
        const show = (visible) => parts.forEach((p) => { p.hidden = !visible; });
        show(false);
        const editForm = poll
          ? POLLS.editForm(post, loadPosts, () => { editForm.remove(); show(true); })
          : EDIT_FORMS.post(post, loadPosts, () => { editForm.remove(); show(true); });
        article.insertBefore(editForm, actions);
      });
      actions.appendChild(edit);
    }

    const del = actionButton("Delete");
    del.addEventListener("click", async () => {
      if (!confirm("Delete this post?")) return;
      await supabaseClient.from("posts").delete().eq("id", post.id);
      loadPosts();
    });
    actions.appendChild(del);
  }

  if (post.user_id !== currentUser.id) actions.appendChild(REPORTS.button("post", post.id));

  // Moderators: pin a post to the top of the Community, or unpin it
  if (isModerator) {
    const pin = actionButton(post.pinned_at ? "Unpin" : "Pin");
    pin.addEventListener("click", async () => {
      pin.disabled = true;
      const { error } = await supabaseClient.rpc("set_post_pinned", { p_post: post.id, p_pinned: !post.pinned_at });
      if (error) { pin.disabled = false; alert(error.message); return; }
      loadPosts();
    });
    actions.appendChild(pin);

    // While an event is on: feature a post in it (top of the Events page,
    // and of the Community until the event ends)
    if (liveEvent) {
      const featured = Boolean(post.featured_at && post.event_key === liveEvent.key);
      const feat = actionButton(featured ? "Unfeature" : "Feature in " + liveEvent.name);
      feat.addEventListener("click", async () => {
        feat.disabled = true;
        const { error } = await supabaseClient.rpc("set_post_featured", { p_post: post.id, p_featured: !featured });
        if (error) { feat.disabled = false; alert(error.message); return; }
        loadPosts();
      });
      actions.appendChild(feat);
    }
  }

  article.append(actions, commentsSection);
  return article;
}

// ---------- Comments ----------

async function fetchComments(postId) {
  const { data, error } = await supabaseClient
    .from("comments")
    .select("id, parent_id, body, created_at, edited_at, held_at, user_id, profiles!user_id(username, avatar_path, avatar_ring, profile_biome, show_biome_symbol, is_moderator, badge), comment_likes(user_id)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  return error ? null : data;
}

function renderCommentSection(container, postId, comments, refresh) {
  container.innerHTML = "";
  container.appendChild(buildCommentForm(postId, null, "Add a comment", "Comment", refresh));

  if (comments.length === 0) {
    container.appendChild(el("p", "feed-empty", "No comments yet. Start the conversation."));
    return;
  }

  // Turn the flat list into a tree: each comment gets a list of its replies
  const byId = new Map();
  comments.forEach((c) => byId.set(c.id, { ...c, replies: [] }));

  const roots = [];
  byId.forEach((c) => {
    const parent = c.parent_id && byId.get(c.parent_id);
    if (parent) parent.replies.push(c);
    else roots.push(c);
  });

  const list = el("div", "comment-list");
  roots.forEach((c) => list.appendChild(buildComment(c, 0, postId, refresh)));
  container.appendChild(list);
}

function buildComment(comment, depth, postId, refresh) {
  const wrap = el("div", "comment");
  wrap.dataset.commentId = comment.id;

  wrap.appendChild(buildMeta(comment.profiles, comment.created_at, comment.edited_at));
  if (comment.held_at) wrap.appendChild(heldNotice());
  const bodyEl = el("p", "comment-body", comment.body);
  wrap.appendChild(bodyEl);

  const replyHolder = el("div", "reply-holder");
  const actions = el("div", "post-actions");

  const replyBtn = actionButton("Reply");
  replyBtn.addEventListener("click", () => {
    if (replyHolder.firstChild) {
      replyHolder.innerHTML = "";
      replyBtn.textContent = "Reply";
    } else {
      const form = buildCommentForm(postId, comment.id, "Write a reply", "Reply", refresh);
      replyHolder.appendChild(form);
      form.querySelector("textarea").focus();
      replyBtn.textContent = "Cancel";
    }
  });
  actions.append(
    buildLikeButton("comment_likes", "comment_id", comment.id, comment.comment_likes),
    replyBtn
  );

  if (comment.user_id === currentUser.id) {
    // Fix a typo: the text can be edited (automod checks edits too)
    const edit = actionButton("Edit");
    edit.addEventListener("click", () => {
      if (wrap.querySelector(":scope > .edit-form")) return;
      bodyEl.hidden = true;
      actions.hidden = true;
      const form = buildCommentEditForm(comment, refresh, () => {
        form.remove(); bodyEl.hidden = false; actions.hidden = false; edit.focus();
      });
      wrap.insertBefore(form, actions);
      form.querySelector("textarea").focus();
    });
    actions.appendChild(edit);

    const del = actionButton("Delete");
    del.addEventListener("click", async () => {
      const msg = comment.replies.length
        ? "Delete this comment and its replies?"
        : "Delete this comment?";
      if (!confirm(msg)) return;
      await supabaseClient.from("comments").delete().eq("id", comment.id);
      refresh();
    });
    actions.appendChild(del);
  }

  if (comment.user_id !== currentUser.id) actions.appendChild(REPORTS.button("comment", comment.id));

  wrap.append(actions, replyHolder);

  if (comment.replies.length) {
    const replies = el("div", depth < MAX_INDENT_DEPTH ? "replies" : "replies replies-flat");
    comment.replies.forEach((r) => replies.appendChild(buildComment(r, depth + 1, postId, refresh)));
    wrap.appendChild(replies);
  }

  return wrap;
}

// Editing your own comment
function buildCommentEditForm(comment, refresh, onCancel) {
  const form = el("form", "comment-form edit-form");
  const textarea = el("textarea");
  textarea.rows = 2;
  textarea.maxLength = 500;
  textarea.required = true;
  textarea.value = comment.body;
  textarea.setAttribute("aria-label", "Edit your comment");

  const footer = el("div", "comment-form-footer");
  const message = el("span", "auth-message");
  message.setAttribute("aria-live", "polite"); // read out by screen readers
  const buttons = el("div", "edit-buttons");
  const cancel = actionButton("Cancel");
  cancel.addEventListener("click", onCancel);
  const save = el("button", "btn btn-solid", "Save");
  save.type = "submit";
  buttons.append(cancel, save);
  footer.append(message, buttons);
  form.append(textarea, footer);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = textarea.value.trim();
    if (!body) return;
    if (body === comment.body) { onCancel(); return; }
    save.disabled = true;
    const { data, error } = await supabaseClient
      .from("comments")
      .update({ body: body, edited_at: new Date().toISOString() })
      .eq("id", comment.id)
      .select("held_at");
    if (error || !data || data.length === 0) {
      message.textContent = error ? error.message : "Couldn't save your changes.";
      message.style.color = "#E07A5F";
      save.disabled = false;
      return;
    }
    refresh();
  });
  return form;
}

function buildCommentForm(postId, parentId, placeholder, submitLabel, refresh) {
  const form = el("form", "comment-form");

  const textarea = el("textarea");
  textarea.rows = 2;
  textarea.maxLength = 500;
  textarea.required = true;
  textarea.placeholder = placeholder;
  textarea.setAttribute("aria-label", placeholder);

  const footer = el("div", "comment-form-footer");
  const message = el("span", "auth-message");
  message.setAttribute("aria-live", "polite"); // read out by screen readers
  const submit = el("button", "btn btn-solid", submitLabel);
  submit.type = "submit";
  footer.append(message, submit);

  form.append(textarea, footer);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = textarea.value.trim();
    if (!body) return;

    submit.disabled = true;
    const { error } = await supabaseClient.from("comments").insert({
      post_id: postId,
      parent_id: parentId,
      user_id: currentUser.id,
      body: body,
    });

    if (error) {
      message.textContent = error.message;
      message.style.color = "#E07A5F";
      submit.disabled = false;
      return;
    }
    refresh();
  });

  return form;
}

// ---------- New post form ----------

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = postTitle.value.trim();
  const body = postBody.value.trim();
  const category = postCategory.value;
  const withPoll = pollComposer.isOn();
  // A poll's details are optional; an ordinary post needs some text
  if (!title || !category || (!body && !withPoll)) {
    if (!body && !withPoll) {
      postMessage.textContent = "Please write something in your post.";
      postMessage.style.color = "#E07A5F";
    }
    return;
  }
  if (withPoll && pollComposer.problem()) {
    postMessage.textContent = pollComposer.problem();
    postMessage.style.color = "#E07A5F";
    return;
  }

  postMessage.textContent = "Posting...";
  postMessage.style.color = "var(--cream)";

  let saved = null, error = null;
  if (withPoll) {
    const res = await supabaseClient.rpc("create_poll_post", {
      p_title: title, p_body: body, p_category: category,
      p_options: pollComposer.options(), p_days: pollComposer.days(),
    });
    error = res.error;
    saved = res.data ? { held_at: res.data.held } : null;
    // a poll joins the event straight after it's made
    if (!error && res.data && eventChosen()) {
      await supabaseClient.from("posts").update({ event_key: liveEvent.key }).eq("id", res.data.id);
    }
  } else {
    const res = await supabaseClient
      .from("posts")
      .insert(Object.assign({ title: title, body: body, category: category, user_id: currentUser.id },
        eventChosen() ? { event_key: liveEvent.key } : {}))
      .select("held_at")
      .single();
    error = res.error;
    saved = res.data;
  }

  if (error) {
    postMessage.textContent = error.message;
    postMessage.style.color = "#E07A5F";
    return;
  }

  if (saved && saved.held_at) {
    postMessage.textContent = "Thanks! Your post is waiting for a quick check by a moderator before everyone can see it.";
    postMessage.style.color = "var(--gold)";
  } else {
    postMessage.textContent = "";
  }
  postForm.reset();
  pollComposer.reset();
  setComposing(false);
  loadPosts();
});

// "Add a poll" in the post form (polls.js)
const pollComposer = POLLS.composer(postForm);

// The post form stays folded into a slim "Start a post…" bar until needed
const postStarter = document.getElementById("post-starter");
function setComposing(open) {
  postForm.hidden = !open;
  postStarter.hidden = open;
  postStarter.setAttribute("aria-expanded", String(open));
  // posting from the Beta Testing tab starts in that category
  if (open && selectedCategory === BETA_CATEGORY && !postCategory.value) postCategory.value = BETA_CATEGORY;
  if (open) postTitle.focus();
}
postStarter.addEventListener("click", () => setComposing(true));
document.getElementById("post-cancel").addEventListener("click", () => {
  pollComposer.reset();
  setComposing(false);
  postStarter.focus();
});

// One button per category, using the same list as the "new post" form,
// so a category only ever needs adding in one place (feed.html).
function buildCategoryButtons() {
  const choices = [{ value: "", label: "All" }].concat(
    Array.from(postCategory.options)
      .filter((o) => o.value)
      .map((o) => ({ value: o.value, label: o.textContent }))
  );

  choices.forEach((c) => {
    const btn = el("button", "category-chip", c.label);
    btn.type = "button";
    btn.dataset.value = c.value;
    btn.setAttribute("aria-pressed", String(c.value === selectedCategory));
    categoryFilter.appendChild(btn);
  });

  categoryFilter.addEventListener("click", (e) => {
    const btn = e.target.closest(".category-chip");
    if (!btn) return;
    if (btn.dataset.event) {
      if (selectedEvent === btn.dataset.event) return;
      selectedEvent = btn.dataset.event;
      selectedCategory = "";
    } else {
      if (!selectedEvent && btn.dataset.value === selectedCategory) return;
      selectedEvent = "";
      selectedCategory = btn.dataset.value;
    }
    categoryFilter.querySelectorAll(".category-chip").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === btn));
    });
    postsShown = 0;
    loadPosts();
  });
}

buildCategoryButtons();

init();
