// Byome: quick questions. A few optional Yes / No questions about a product
// (database/2026-12-28-quick-questions.sql). Shown in the review form, and
// on their own from a product page ("Answer quick questions"). The answers
// are private: everyone else only sees the totals, in "At a glance", with
// how many people answered each question. They never go in the feed.
//
//   QUICK.load(productId)            -> { questions, mine } (mine: { key: true/false })
//   QUICK.block(questions, mine, o)  -> { node, answers(), count() }
//   QUICK.save(productId, answers)   -> { data, error }
//   QUICK.glance(productId)          -> a node for the product page, or null
const QUICK = (function () {
  const COLLAPSED_KEY = "byome-quick-collapsed";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function remembered() {
    try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch (e) { return false; }
  }
  function remember(collapsed) {
    try {
      if (collapsed) localStorage.setItem(COLLAPSED_KEY, "1");
      else localStorage.removeItem(COLLAPSED_KEY);
    } catch (e) { /* fine */ }
  }

  async function load(productId) {
    const { data: session } = await supabaseClient.auth.getSession();
    const user = session && session.session && session.session.user;
    const [qRes, mineRes] = await Promise.all([
      supabaseClient.rpc("quick_questions_for", { p_product: productId }),
      user
        ? supabaseClient.from("quick_answers").select("question_key, answer").eq("product_id", productId).eq("user_id", user.id)
        : Promise.resolve({ data: [] }),
    ]);
    const mine = {};
    (mineRes.data || []).forEach((a) => { mine[a.question_key] = a.answer; });
    return { questions: qRes.error ? [] : (qRes.data || []), mine };
  }

  // The questions, with Yes / No buttons. Tapping a chosen answer again
  // clears it. A follow-up only shows after a Yes.
  //   o.collapsible: a "Skip questions" button folds it away (remembered)
  //   o.points:      the line about Byome points
  function block(questions, mine, o) {
    o = o || {};
    const answers = Object.assign({}, mine);
    const tops = questions.filter((q) => !q.parent_key);
    const node = el("section", "qt");
    node.setAttribute("aria-label", "Quick questions");
    // (redrawn on every answer; anything added after it, like a Save button, stays)
    const inner = el("div", "qt-inner");
    node.appendChild(inner);

    function visible(q) { return !q.parent_key || answers[q.parent_key] === true; }
    function count() { return questions.filter((q) => visible(q) && typeof answers[q.key] === "boolean").length; }
    function current() {
      const out = {};
      questions.forEach((q) => { if (visible(q) && typeof answers[q.key] === "boolean") out[q.key] = answers[q.key]; });
      return out;
    }

    let collapsed = Boolean(o.collapsible) && remembered();
    let focusKey = null; // keep keyboard focus on the button just pressed

    function row(q) {
      const r = el("div", "qt-row" + (q.parent_key ? " is-follow" : ""));
      const id = "qt-" + q.key;
      const p = el("p", null, (q.parent_key ? "↳ " : "") + q.prompt);
      p.id = id;
      const yn = el("div", "qt-yn");
      yn.setAttribute("role", "group");
      yn.setAttribute("aria-labelledby", id);
      [[true, "Yes"], [false, "No"]].forEach(([value, text]) => {
        const b = el("button", null, text);
        b.type = "button";
        b.setAttribute("aria-pressed", String(answers[q.key] === value));
        b.dataset.key = q.key + ":" + text;
        b.addEventListener("click", () => {
          if (answers[q.key] === value) delete answers[q.key];
          else answers[q.key] = value;
          focusKey = b.dataset.key;
          paint();
          if (o.onChange) o.onChange();
        });
        yn.appendChild(b);
      });
      r.append(p, yn);
      return r;
    }

    function paint() {
      inner.replaceChildren();
      node.classList.toggle("is-collapsed", collapsed);
      if (collapsed) {
        const line = el("div", "qt-collapsed");
        const text = el("span", null, "Quick questions ");
        text.appendChild(el("span", "muted", "· optional · " + tops.filter((q) => typeof answers[q.key] === "boolean").length + " of " + tops.length + " answered"));
        const show = el("button", "qt-show", "Show");
        show.type = "button";
        show.setAttribute("aria-expanded", "false");
        show.addEventListener("click", () => {
          collapsed = false;
          remember(false);
          paint();
          const first = node.querySelector(".qt-yn button");
          if (first) first.focus();
        });
        line.append(text, show);
        inner.appendChild(line);
        return;
      }
      const head = el("div", "qt-head");
      head.appendChild(el("h3", null, "Quick questions"));
      if (o.collapsible) {
        const skip = el("button", "qt-skip", "Skip questions");
        skip.type = "button";
        skip.setAttribute("aria-expanded", "true");
        skip.addEventListener("click", () => {
          collapsed = true;
          remember(true);
          paint();
          node.querySelector(".qt-show").focus();
        });
        head.appendChild(skip);
      }
      inner.appendChild(head);
      inner.appendChild(el("p", "qt-note", "All optional. Not sure? Just leave it blank."));
      const list = el("div", "qt-list");
      questions.forEach((q) => { if (visible(q)) list.appendChild(row(q)); });
      inner.appendChild(list);
      if (o.points) inner.appendChild(el("p", "qt-points", "Answer 3 or more for 3 Byome points."));
      if (focusKey) {
        const again = node.querySelector('[data-key="' + focusKey + '"]');
        if (again) again.focus();
        focusKey = null;
      }
    }
    paint();
    return { node, answers: current, count };
  }

  function save(productId, answers) {
    return supabaseClient.rpc("save_quick_answers", { p_product: productId, p_answers: answers });
  }

  // Whether two sets of answers are the same (to skip saving nothing new)
  function same(a, b) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
  }

  // "At a glance": how many people said Yes to each question
  async function glance(productId) {
    const { data, error } = await supabaseClient.rpc("quick_answer_stats", { p_product: productId });
    if (error || !data || !data.length) return null;
    const box = el("div", "glance");
    box.appendChild(el("h3", "glance-title", "At a glance"));
    const list = el("ul", "glance-list");
    data.forEach((s) => {
      const li = el("li", "glance-row" + (s.parent_key ? " is-follow" : ""));
      const top = el("div", "glance-top");
      top.append(el("span", "glance-label", (s.parent_key ? "\u21B3 " : "") + s.label),
        el("span", "glance-count", Math.round((s.yes / s.answers) * 100) + "% said yes"));
      const track = el("span", "glance-track");
      const fill = el("span", "glance-fill");
      fill.style.width = (s.yes / s.answers) * 100 + "%";
      track.appendChild(fill);
      track.setAttribute("aria-hidden", "true");
      li.append(top, track, el("span", "glance-tally", "Answered by " + s.answers + (s.answers === 1 ? " member" : " members")));
      list.appendChild(li);
    });
    box.appendChild(list);
    box.appendChild(el("p", "glance-note", "From members' answers to quick questions."));
    return box;
  }

  return { load, block, save, same, glance };
})();
