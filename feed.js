const feedEl = document.getElementById("feed");
const postForm = document.getElementById("post-form");
const postTitle = document.getElementById("post-title");
const postBody = document.getElementById("post-body");
const postMessage = document.getElementById("post-message");
const charCount = document.getElementById("char-count");
const postCategory = document.getElementById("post-category");
const categoryFilter = document.getElementById("category-filter");

// After this many levels of replies, deeper replies stop indenting
// so threads stay readable on small screens.
const MAX_INDENT_DEPTH = 4;

let currentUser = null;
let selectedCategory = ""; // "" means all categories

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
    btn.setAttribute("aria-label", (liked ? "Unlike" : "Like") + " (" + count + " likes)");
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

  if (commentId && UUID.test(commentId)) await article._openComments();
  const comment = commentId && article.querySelector('.comment[data-comment-id="' + commentId + '"]');
  const target = comment || article;
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.classList.add("is-linked");
  setTimeout(() => target.classList.remove("is-linked"), 4000);
}

// ---------- Posts ----------

// Posts load 20 at a time; "Load more" adds the next 20. Reloading after
// an edit or a new post keeps however many were already showing.
const PAGE_SIZE = 20;
let postsShown = 0;
const POST_COLUMNS = "id, title, body, category, created_at, edited_at, held_at, user_id, profiles!user_id(username, avatar_path, avatar_ring, profile_biome, show_biome_symbol, is_moderator, badge), likes(user_id), comments(count), polls(closes_at, poll_options(id, label, position))";

async function loadPosts(more) {
  const from = more === true ? postsShown : 0;
  const to = (more === true ? postsShown + PAGE_SIZE : Math.max(PAGE_SIZE, postsShown)) - 1;
  let query = supabaseClient
    .from("posts")
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);

  if (selectedCategory) {
    query = query.eq("category", selectedCategory);
  }

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
    const text = selectedCategory
      ? "No " + selectedCategory + " posts yet. Be the first to start one!"
      : "No posts yet. Be the first to start one!";
    feedEl.appendChild(UI.emptyState({ image: "biome-assets/plant-welcome-sprout.png", text: text }));
    return;
  }

  // Poll results for any polls, in one go
  const pollResults = await POLLS.results(posts.filter((p) => POLLS.pollOf(p)).map((p) => p.id));
  posts.forEach((post) => {
    // (a post opened from a notification may already be showing at the top)
    if (more === true && feedEl.querySelector('.post[data-post-id="' + post.id + '"]')) return;
    feedEl.appendChild(buildPost(post, pollResults.get(post.id)));
  });
  postsShown = from + posts.length;
  if (posts.length === to - from + 1) feedEl.appendChild(loadMoreButton(() => loadPosts(true)));
}

function loadMoreButton(onClick) {
  const btn = el("button", "btn btn-ghost load-more", "Load more");
  btn.type = "button";
  btn.addEventListener("click", () => { btn.disabled = true; btn.textContent = "Loading…"; btn.classList.add("is-loading"); onClick(); });
  return btn;
}

function buildPost(post, pollResult) {
  const article = el("article", "post");
  article.dataset.postId = post.id;
  const poll = POLLS.pollOf(post);
  if (poll) article.classList.add("has-poll");

  // Older posts made before headings existed have no title
  if (post.title) {
    const titleRow = el("div", "post-title-row");
    titleRow.appendChild(el("h2", "post-title", post.title));
    if (post.category) titleRow.appendChild(el("span", "post-category-tag", post.category));
    article.appendChild(titleRow);
  } else if (post.category) {
    article.appendChild(el("span", "post-category-tag", post.category));
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
  } else {
    const res = await supabaseClient
      .from("posts")
      .insert({ title: title, body: body, category: category, user_id: currentUser.id })
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
  charCount.textContent = "0 / 1000";
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
  if (open) postTitle.focus();
}
postStarter.addEventListener("click", () => setComposing(true));
document.getElementById("post-cancel").addEventListener("click", () => {
  pollComposer.reset();
  setComposing(false);
  postStarter.focus();
});

postBody.addEventListener("input", () => {
  charCount.textContent = postBody.value.length + " / 1000";
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
    if (!btn || btn.dataset.value === selectedCategory) return;
    selectedCategory = btn.dataset.value;
    categoryFilter.querySelectorAll(".category-chip").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === btn));
    });
    postsShown = 0;
    loadPosts();
  });
}

buildCategoryButtons();

init();
