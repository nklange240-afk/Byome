// Edit forms for your own posts and reviews, shared by the feed, reviews
// and profile pages, so editing works the same everywhere.
//   EDIT_FORMS.post(post, onSaved, onCancel)
//   EDIT_FORMS.review(review, productText, onSaved, onCancel)
// and the pieces for changing a rating in a review update
// (database/2026-12-22-update-ratings.sql):
//   EDIT_FORMS.ratingPicker(currentRating)  optional new rating, in "Add update"
//   EDIT_FORMS.originalRating(review)       "Originally" and the first rating, small
//   EDIT_FORMS.updateRating(update)         the new rating an update gave
const EDIT_FORMS = (function () {
  const RATING_LABELS = { 1: "Didn't work for me", 2: "Not great", 3: "It's okay", 4: "Really good", 5: "Love it" };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function actionButton(label) {
    const btn = el("button", "action-btn", label);
    btn.type = "button";
    return btn;
  }

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

  function starIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "star-icon");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M12 2c.7 5.6 3.9 9.3 10 10-6.1.7-9.3 4.4-10 10-.7-5.6-3.9-9.3-10-10 6.1-.7 9.3-4.4 10-10z");
    svg.appendChild(path);
    return svg;
  }

  // Five small leaves showing a rating (not clickable)
  function staticLeaves(n, extraClass) {
    const box = el("span", "review-rating" + (extraClass ? " " + extraClass : ""));
    for (let i = 1; i <= 5; i++) {
      const leaf = el("span", "rating-leaf static" + (i <= n ? " on" : ""));
      leaf.appendChild(leafIcon());
      box.appendChild(leaf);
    }
    return box;
  }

  // Under a review whose rating an update changed: its first rating, small
  function originalRating(r) {
    if (r.original_rating === null || r.original_rating === undefined || r.original_rating === r.rating) return null;
    const line = el("p", "review-original-rating");
    line.setAttribute("role", "img");
    line.setAttribute("aria-label", "Originally rated " + r.original_rating + " out of 5");
    line.append(el("span", null, "Originally"), staticLeaves(r.original_rating, "is-small"));
    return line;
  }

  // In an update that changed the rating: the new rating
  function updateRating(u) {
    if (!u.rating) return null;
    const line = el("p", "review-update-rating");
    line.setAttribute("role", "img");
    line.setAttribute("aria-label", "Changed the rating to " + u.rating + " out of 5");
    line.append(el("span", null, "New rating"), staticLeaves(u.rating, "is-small"));
    return line;
  }

  // "Add update": an optional new rating. Nothing chosen (or the same
  // rating again) keeps the current one. value() is the new rating or null.
  function ratingPicker(current) {
    let chosen = null;
    const box = el("div", "update-rating");
    box.appendChild(el("p", "field-label", "New rating (optional)"));
    const leaves = el("div", "rating-leaves");
    const label = el("p", "rating-label");
    const buttons = [];
    for (let n = 1; n <= 5; n++) {
      const btn = el("button", "rating-leaf");
      btn.type = "button";
      btn.appendChild(leafIcon());
      btn.setAttribute("aria-label", n + " out of 5: " + RATING_LABELS[n]);
      btn.addEventListener("click", () => { chosen = chosen === n ? null : n; paint(); });
      buttons.push(btn);
      leaves.appendChild(btn);
    }
    function paint() {
      const shown = chosen || current;
      buttons.forEach((btn, i) => {
        btn.classList.toggle("on", i < shown);
        btn.classList.toggle("is-current", !chosen);
        btn.setAttribute("aria-pressed", String(i + 1 === chosen));
      });
      label.textContent = chosen && chosen !== current
        ? RATING_LABELS[chosen] + " (was " + current + (current === 1 ? " leaf" : " leaves") + ")"
        : "Keeping your rating of " + current + (current === 1 ? " leaf" : " leaves") + ". Tap a leaf to change it.";
    }
    box.append(leaves, label);
    paint();
    return { el: box, value: () => (chosen && chosen !== current ? chosen : null) };
  }

  // Edit your own post's heading and text
  function buildPostEditForm(post, onSaved, onCancel) {
    const form = el("form", "edit-form");

    const titleInput = el("input", "composer-title");
    titleInput.type = "text";
    titleInput.maxLength = 100;
    titleInput.required = Boolean(post.title); // older posts may have no heading
    titleInput.value = post.title || "";
    titleInput.setAttribute("aria-label", "Post heading");

    const bodyInput = el("textarea");
    bodyInput.rows = 4;
    bodyInput.maxLength = 2000;
    bodyInput.dataset.min = "10";
    bodyInput.required = true;
    bodyInput.value = post.body;
    bodyInput.setAttribute("aria-label", "Post text");

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
    form.append(titleInput, bodyInput, footer);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = bodyInput.value.trim();
      if (!body) return;

      save.disabled = true;
      const { data, error } = await supabaseClient
        .from("posts")
        .update({ title: titleInput.value.trim() || null, body: body, edited_at: new Date().toISOString() })
        .eq("id", post.id)
        .select("id");

      if (error || !data || data.length === 0) {
        message.textContent = error ? error.message : "Couldn't save your changes.";
        message.style.color = "#E07A5F";
        save.disabled = false;
        return;
      }
      onSaved();
    });

    return form;
  }

  // Edit your own review: rating, heading, text, repurchase, holy grail and
  // your quick questions. (The product can't be changed, and updates are
  // added separately.)
  function buildReviewEditForm(r, productText, onSaved, onCancel) {
    const form = el("form", "edit-form");
    let rating = r.rating;
    let repurchase = r.would_repurchase === undefined ? null : r.would_repurchase;
    let grail = Boolean(r.holy_grail);

    form.appendChild(el("p", "review-product", productText));

    // Once an update has changed the rating, only another update can
    // change it (database/2026-12-22-update-ratings.sql)
    const ratingFromUpdate = r.original_rating !== null && r.original_rating !== undefined;
    form.appendChild(el("p", "field-label", "Rating"));
    const leavesBox = el("div", "rating-leaves");
    const ratingLabel = el("p", "rating-label");
    const leafBtns = [];
    for (let n = 1; n <= 5; n++) {
      const btn = el("button", "rating-leaf");
      btn.type = "button";
      btn.appendChild(leafIcon());
      btn.setAttribute("aria-label", n + " out of 5: " + RATING_LABELS[n]);
      btn.addEventListener("click", () => { rating = n; paint(); });
      leafBtns.push(btn);
      leavesBox.appendChild(btn);
    }
    if (ratingFromUpdate) {
      form.append(staticLeaves(rating), el("p", "rating-label",
        "Your rating comes from your latest update. To change it, add a new update with a new rating."));
    } else {
      form.append(leavesBox, ratingLabel);
    }

    const extras = el("div", "extras");
    const repField = el("fieldset", "extras-field");
    const group = el("div", "toggle-group");
    const yes = el("button", "toggle-btn", "Yes");
    const no = el("button", "toggle-btn", "No");
    yes.type = "button";
    no.type = "button";
    group.append(yes, no);
    repField.append(el("legend", "field-label", "Would you repurchase? (optional)"), group);
    const grailBtn = el("button", "holy-grail-btn");
    grailBtn.type = "button";
    grailBtn.append(starIcon(), document.createTextNode("Holy grail"));
    extras.append(repField, grailBtn);
    form.appendChild(extras);

    // "Gifted" (database/2026-12-12-gifted-reviews.sql; left out until it's run)
    const hasGifted = r.gifted !== undefined;
    const giftedBox = el("input");
    giftedBox.type = "checkbox";
    giftedBox.checked = Boolean(r.gifted);
    if (hasGifted) {
      const row = el("label", "check-row review-gifted-row");
      const text = el("span");
      text.append(el("strong", null, "Gifted:"), " a brand gave me this product, paid me, or I'm connected to the brand in another way.");
      row.append(giftedBox, text);
      form.appendChild(row);
    }

    // Your quick questions for this product, with your answers filled in
    // (quick-questions.js; filled in once they've loaded)
    const quickSlot = el("div");
    form.appendChild(quickSlot);
    let quick = null; // { mine, block }
    if (typeof QUICK !== "undefined" && r.product_id) {
      QUICK.load(r.product_id).then(({ questions, mine }) => {
        if (!questions.length) return;
        const block = QUICK.block(questions, mine, { collapsible: true });
        quick = { mine, block };
        quickSlot.appendChild(block.node);
      }).catch(() => { /* the review can still be edited */ });
    }

    function paint() {
      leafBtns.forEach((btn, i) => {
        btn.classList.toggle("on", i < rating);
        btn.setAttribute("aria-pressed", String(i + 1 === rating));
      });
      if (!ratingFromUpdate) ratingLabel.textContent = RATING_LABELS[rating];
      if (rating !== 5) grail = false;
      grailBtn.disabled = rating !== 5;
      grailBtn.setAttribute("aria-pressed", String(grail));
      yes.setAttribute("aria-pressed", String(repurchase === true));
      no.setAttribute("aria-pressed", String(repurchase === false));
    }
    yes.addEventListener("click", () => { repurchase = repurchase === true ? null : true; paint(); });
    no.addEventListener("click", () => { repurchase = repurchase === false ? null : false; paint(); });
    grailBtn.addEventListener("click", () => { grail = !grail; paint(); });

    const titleInput = el("input", "composer-title");
    titleInput.type = "text";
    titleInput.maxLength = 100;
    titleInput.required = true;
    titleInput.value = r.title;
    titleInput.setAttribute("aria-label", "Review heading");

    const bodyInput = el("textarea");
    bodyInput.rows = 5;
    bodyInput.maxLength = 2000;
    bodyInput.dataset.min = "20";
    bodyInput.required = true;
    bodyInput.value = r.body;
    bodyInput.setAttribute("aria-label", "Your review");

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
    form.append(titleInput, bodyInput, footer);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = titleInput.value.trim();
      const body = bodyInput.value.trim();
      if (!title || !body) return;

      save.disabled = true;
      const { data, error } = await supabaseClient
        .from("reviews")
        .update({
          ...(ratingFromUpdate ? {} : { rating: rating }),
          title: title,
          body: body,
          would_repurchase: repurchase,
          holy_grail: rating === 5 && grail,
          ...(hasGifted ? { gifted: giftedBox.checked } : {}),
          edited_at: new Date().toISOString(),
        })
        .eq("id", r.id)
        .select("id");

      if (error || !data || data.length === 0) {
        message.textContent = error ? error.message : "Couldn't save your changes.";
        message.style.color = "#E07A5F";
        save.disabled = false;
        return;
      }
      // The quick questions, if they changed. If they can't be saved, the
      // form stays open to say why.
      if (quick) {
        const answers = quick.block.answers();
        if (!QUICK.same(answers, quick.mine)) {
          const { error: qError } = await QUICK.save(r.product_id, answers);
          if (qError) {
            message.textContent = "Your review is saved, but your quick answers couldn't be: " + qError.message;
            message.style.color = "#E07A5F";
            save.disabled = false;
            return;
          }
          quick.mine = answers;
        }
      }
      onSaved();
    });

    paint();
    return form;
  }

  return { post: buildPostEditForm, review: buildReviewEditForm, ratingPicker, originalRating, updateRating };
})();
