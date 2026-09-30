const feedEl = document.getElementById("feed");
const postForm = document.getElementById("post-form");
const postTitle = document.getElementById("post-title");
const postBody = document.getElementById("post-body");
const postMessage = document.getElementById("post-message");
const charCount = document.getElementById("char-count");
const usernameEl = document.getElementById("header-username");
const logoutBtn = document.getElementById("logout-btn");

// After this many levels of replies, deeper replies stop indenting
// so threads stay readable on small screens.
const MAX_INDENT_DEPTH = 4;

let currentUser = null;

// Small helper: create an element with a class and text in one line.
// It uses textContent, so user-written text can never inject HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildMeta(username, createdAt) {
  const meta = el("div", "post-meta");
  const time = el("time", null, formatDate(createdAt));
  time.dateTime = createdAt;
  meta.append(el("span", "post-author", username || "Unknown"), time);
  return meta;
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

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("username")
    .eq("id", currentUser.id)
    .single();

  usernameEl.textContent = profile ? profile.username : "";
  loadPosts();
}

// ---------- Posts ----------

async function loadPosts() {
  const { data: posts, error } = await supabaseClient
    .from("posts")
    .select("id, title, body, created_at, user_id, profiles!user_id(username), likes(user_id), comments(count)")
    .order("created_at", { ascending: false })
    .limit(50);

  feedEl.innerHTML = "";

  if (error) {
    console.error("Failed to load posts:", error);
    feedEl.appendChild(el("p", "feed-empty", "Couldn't load posts: " + error.message));
    return;
  }

  if (posts.length === 0) {
    feedEl.appendChild(el("p", "feed-empty", "No posts yet. Write the first one above."));
    return;
  }

  posts.forEach((post) => feedEl.appendChild(buildPost(post)));
}

function buildPost(post) {
  const article = el("article", "post");

  // Older posts made before headings existed have no title
  if (post.title) article.appendChild(el("h2", "post-title", post.title));
  article.appendChild(buildMeta(post.profiles && post.profiles.username, post.created_at));
  article.appendChild(el("p", "post-body", post.body));

  const likeBtn = buildLikeButton("likes", "post_id", post.id, post.likes);

  // --- Comments toggle ---
  let commentCount = post.comments.length ? post.comments[0].count : 0;
  let commentsLoaded = false;
  const commentsBtn = actionButton("");
  commentsBtn.setAttribute("aria-expanded", "false");

  function paintCommentsBtn() {
    commentsBtn.textContent = "Comments (" + commentCount + ")";
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

  const actions = el("div", "post-actions");
  actions.append(likeBtn, commentsBtn);

  if (post.user_id === currentUser.id) {
    const del = actionButton("Delete");
    del.addEventListener("click", async () => {
      if (!confirm("Delete this post?")) return;
      await supabaseClient.from("posts").delete().eq("id", post.id);
      loadPosts();
    });
    actions.appendChild(del);
  }

  article.append(actions, commentsSection);
  return article;
}

// ---------- Comments ----------

async function fetchComments(postId) {
  const { data, error } = await supabaseClient
    .from("comments")
    .select("id, parent_id, body, created_at, user_id, profiles!user_id(username), comment_likes(user_id)")
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

  wrap.appendChild(buildMeta(comment.profiles && comment.profiles.username, comment.created_at));
  wrap.appendChild(el("p", "comment-body", comment.body));

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

  wrap.append(actions, replyHolder);

  if (comment.replies.length) {
    const replies = el("div", depth < MAX_INDENT_DEPTH ? "replies" : "replies replies-flat");
    comment.replies.forEach((r) => replies.appendChild(buildComment(r, depth + 1, postId, refresh)));
    wrap.appendChild(replies);
  }

  return wrap;
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
  if (!title || !body) return;

  postMessage.textContent = "Posting...";
  postMessage.style.color = "var(--cream)";

  const { error } = await supabaseClient
    .from("posts")
    .insert({ title: title, body: body, user_id: currentUser.id });

  if (error) {
    postMessage.textContent = error.message;
    postMessage.style.color = "#E07A5F";
    return;
  }

  postMessage.textContent = "";
  postForm.reset();
  charCount.textContent = "0 / 1000";
  loadPosts();
});

postBody.addEventListener("input", () => {
  charCount.textContent = postBody.value.length + " / 1000";
});

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});

init();
