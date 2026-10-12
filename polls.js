// Polls on Community posts. A poll is a post (its heading is the question)
// with 2-6 options. Results show once you've voted (or the poll has closed;
// a poll's author always sees them). Votes can be changed until the poll
// closes. A poll can only be edited until somebody votes. The database
// checks all of this (database/2026-10-13-polls.sql); this file shows it.
//   POLLS.composer(form)                      the "Add a poll" part of the post form
//   POLLS.results(postIds)                    Map of post id -> results
//   POLLS.render(post, results)               the poll inside a post
//   POLLS.editForm(post, onSaved, onCancel)   editing a poll nobody has voted on
const POLLS = (function () {
  const MIN_OPTIONS = 2;
  const MAX_OPTIONS = 6;
  const DURATIONS = [
    { days: 1, label: "1 day" },
    { days: 3, label: "3 days" },
    { days: 7, label: "1 week", selected: true },
    { days: null, label: "No end date" },
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // The poll's options and closing date, from a post loaded with
  // polls(closes_at, poll_options(id, label, position))
  function pollOf(post) {
    const poll = Array.isArray(post.polls) ? post.polls[0] : post.polls;
    if (!poll) return null;
    const options = (poll.poll_options || []).slice().sort((a, b) => a.position - b.position);
    return { closes_at: poll.closes_at, options: options };
  }

  // ---------- Typing in options (new polls and edits) ----------
  function optionList(initial) {
    const box = el("div", "poll-option-inputs");
    const add = el("button", "action-btn poll-add-option", "+ Add an option");
    add.type = "button";

    function refresh() {
      const rows = box.querySelectorAll(".poll-option-row");
      rows.forEach((row, i) => {
        row.querySelector("input").setAttribute("aria-label", "Option " + (i + 1));
        row.querySelector("input").placeholder = "Option " + (i + 1);
        row.querySelector(".poll-option-remove").hidden = rows.length <= MIN_OPTIONS;
      });
      add.hidden = rows.length >= MAX_OPTIONS;
    }

    function addRow(value) {
      const row = el("div", "poll-option-row");
      const input = el("input");
      input.type = "text";
      input.maxLength = 80;
      input.value = value || "";
      const remove = el("button", "poll-option-remove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove this option");
      remove.addEventListener("click", () => { row.remove(); refresh(); });
      row.append(input, remove);
      box.insertBefore(row, add);
      refresh();
      return input;
    }

    box.appendChild(add);
    add.addEventListener("click", () => addRow("").focus());
    (initial && initial.length ? initial : ["", ""]).forEach((v) => addRow(v));

    return {
      element: box,
      values: () => Array.from(box.querySelectorAll(".poll-option-row input")).map((i) => i.value.trim()),
      reset: () => {
        box.querySelectorAll(".poll-option-row").forEach((r) => r.remove());
        addRow(""); addRow("");
      },
    };
  }

  // A friendly problem with the options, or null if they're fine
  function optionsProblem(values) {
    const filled = values.filter(Boolean);
    if (filled.length < MIN_OPTIONS) return "Add at least " + MIN_OPTIONS + " options.";
    const lower = filled.map((v) => v.toLowerCase());
    if (new Set(lower).size < lower.length) return "Each option needs to be different.";
    return null;
  }

  // ---------- The "Add a poll" part of the new post form ----------
  // Returns { isOn, options, days, problem, reset }
  function composer(form) {
    const editor = form.querySelector("#poll-editor");
    const toggle = form.querySelector("#poll-toggle");
    const title = form.querySelector("#post-title");
    const body = form.querySelector("#post-body");
    const titleHint = title.placeholder;
    const bodyHint = body.placeholder;

    editor.appendChild(el("p", "field-label", "Poll options"));
    const list = optionList();
    editor.appendChild(list.element);

    const lengthRow = el("label", "poll-length");
    lengthRow.appendChild(el("span", null, "Poll runs for"));
    const length = el("select");
    DURATIONS.forEach((d) => {
      const opt = el("option", null, d.label);
      opt.value = d.days === null ? "" : String(d.days);
      if (d.selected) opt.selected = true;
      length.appendChild(opt);
    });
    lengthRow.appendChild(length);
    editor.appendChild(lengthRow);

    let on = false;
    function setOn(value) {
      on = value;
      editor.hidden = !on;
      toggle.setAttribute("aria-pressed", String(on));
      toggle.textContent = on ? "Remove poll" : "Add a poll";
      title.placeholder = on ? "Your question" : titleHint;
      body.placeholder = on ? "Add some details (optional)" : bodyHint;
    }
    toggle.addEventListener("click", () => {
      setOn(!on);
      if (on) editor.querySelector("input").focus();
    });
    setOn(false);

    return {
      isOn: () => on,
      options: () => list.values().filter(Boolean),
      days: () => (length.value ? Number(length.value) : null),
      problem: () => optionsProblem(list.values()),
      reset: () => { list.reset(); DURATIONS.forEach((d, i) => { if (d.selected) length.selectedIndex = i; }); setOn(false); },
    };
  }

  // ---------- Results ----------
  async function results(postIds) {
    const map = new Map();
    if (!postIds.length) return map;
    const { data, error } = await supabaseClient.rpc("poll_results", { p_posts: postIds });
    if (error || !data) return map;
    data.forEach((r) => map.set(r.post_id, r));
    return map;
  }

  // "Closes in 2 days", "Closes in 5 hours", "Closed", "No end date"
  function closingText(res) {
    if (res.closed) return "Poll closed";
    if (!res.closes_at) return "No end date";
    const ms = new Date(res.closes_at) - Date.now();
    const mins = Math.max(1, Math.round(ms / 60000));
    if (mins < 60) return "Closes in " + mins + (mins === 1 ? " minute" : " minutes");
    const hours = Math.round(mins / 60);
    if (hours < 48) return "Closes in " + hours + (hours === 1 ? " hour" : " hours");
    const days = Math.round(hours / 24);
    return "Closes in " + days + " days";
  }

  // ---------- A poll inside a post ----------
  function render(post, res) {
    const poll = pollOf(post);
    const box = el("div", "poll");
    if (!poll) return box;

    function paint(r) {
      box.innerHTML = "";
      const state = r || { closed: false, closes_at: poll.closes_at, my_option: null, total: 0, counts: null };
      const held = Boolean(post.held_at);
      const canVote = !state.closed && !held;
      const showing = state.counts !== null && state.counts !== undefined;

      const list = el("div", "poll-options");
      list.setAttribute("role", "group");
      list.setAttribute("aria-label", "Poll: " + (post.title || "options"));
      poll.options.forEach((opt) => {
        const mine = state.my_option === opt.id;
        const row = el(canVote ? "button" : "div", "poll-option" + (mine ? " is-mine" : "") + (showing ? " has-results" : ""));
        if (canVote) {
          row.type = "button";
          row.setAttribute("aria-pressed", String(mine));
        }
        const count = showing ? Number(state.counts[opt.id] || 0) : 0;
        const pct = showing && state.total ? Math.round((count / state.total) * 100) : 0;
        if (showing) {
          const bar = el("span", "poll-bar");
          bar.style.width = pct + "%";
          row.appendChild(bar);
        }
        const label = el("span", "poll-label", opt.label);
        if (mine) label.prepend(el("span", "poll-check", "✓ "));
        row.appendChild(label);
        if (showing) row.appendChild(el("span", "poll-pct", pct + "%"));
        if (canVote && !mine) {
          row.addEventListener("click", () => vote(opt.id, row));
        }
        list.appendChild(row);
      });
      box.appendChild(list);

      const parts = [state.total === 1 ? "1 vote" : state.total + " votes", closingText(state)];
      if (held) parts.push("Voting opens once a moderator has checked it");
      else if (canVote && state.my_option) parts.push("Tap another option to change your vote");
      else if (canVote && !showing) parts.push("Vote to see the results");
      box.appendChild(el("p", "poll-meta", parts.join(" · ")));
      box.appendChild(message);
    }

    const message = el("p", "auth-message poll-message");
    message.setAttribute("aria-live", "polite");

    async function vote(optionId, row) {
      box.querySelectorAll("button.poll-option").forEach((b) => { b.disabled = true; });
      row.classList.add("is-voting");
      const { data, error } = await supabaseClient.rpc("vote_poll", { p_post: post.id, p_option: optionId });
      if (error || !data || !data.length) {
        paint(current);
        message.textContent = error ? error.message : "Couldn't save your vote. Please try again.";
        message.style.color = "#E07A5F";
        return;
      }
      current = data[0];
      message.textContent = "";
      paint(current);
      if (box.onVoted) box.onVoted(current);
    }

    let current = res || null;
    paint(current);
    return box;
  }

  // ---------- Editing a poll (only until somebody votes) ----------
  function editForm(post, onSaved, onCancel) {
    const poll = pollOf(post);
    const form = el("form", "edit-form poll-edit-form");

    const title = el("input", "composer-title");
    title.type = "text";
    title.maxLength = 100;
    title.required = true;
    title.value = post.title || "";
    title.setAttribute("aria-label", "Your question");

    const body = el("textarea");
    body.rows = 3;
    body.maxLength = 1000;
    body.value = post.body || "";
    body.placeholder = "Add some details (optional)";
    body.setAttribute("aria-label", "Details");

    const list = optionList(poll ? poll.options.map((o) => o.label) : []);
    const note = el("p", "field-hint", "Once someone votes, this poll can't be edited.");

    const footer = el("div", "comment-form-footer");
    const message = el("span", "auth-message");
    message.setAttribute("aria-live", "polite"); // read out by screen readers
    const buttons = el("div", "edit-buttons");
    const cancel = el("button", "action-btn", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", onCancel);
    const save = el("button", "btn btn-solid", "Save");
    save.type = "submit";
    buttons.append(cancel, save);
    footer.append(message, buttons);
    form.append(title, body, el("p", "field-label", "Poll options"), list.element, note, footer);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const problem = optionsProblem(list.values());
      if (problem) {
        message.textContent = problem;
        message.style.color = "#E07A5F";
        return;
      }
      save.disabled = true;
      const { error } = await supabaseClient.rpc("edit_poll_post", {
        p_post: post.id, p_title: title.value.trim(), p_body: body.value.trim(), p_options: list.values().filter(Boolean),
      });
      if (error) {
        message.textContent = error.message;
        message.style.color = "#E07A5F";
        save.disabled = false;
        return;
      }
      onSaved();
    });
    return form;
  }

  return { composer, results, render, editForm, pollOf, optionsProblem };
})();
