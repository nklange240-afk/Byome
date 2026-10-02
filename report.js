// Report (flag) button for posts, comments and reviews, shared by the
// feed and reviews pages.
//
// Reporting never hides anything. It adds the item to the "Reported by
// members" list on the Moderate page, where a moderator keeps it or
// removes it. If reports hid things, anyone could hide posts they
// disagree with.
const REPORTS = (function () {
  const REASONS = [
    ["spam", "Spam or advertising"],
    ["harassment", "Harassment or bullying"],
    ["hate", "Hate speech or slurs"],
    ["inappropriate", "Inappropriate or explicit"],
    ["misleading", "Misleading or false"],
    ["other", "Something else"],
  ];
  const reported = new Set(); // "post:<id>" for everything you've reported
  let dialog = null;

  // Remember what this member has already reported, so those flags start red
  async function loadMine(userId) {
    const { data } = await supabaseClient
      .from("content_reports")
      .select("kind, post_id, comment_id, review_id, profile_id")
      .eq("reporter_id", userId);
    (data || []).forEach((r) => reported.add(r.kind + ":" + (r.post_id || r.comment_id || r.review_id || r.profile_id)));
  }

  function flagIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "flag-icon");
    svg.setAttribute("aria-hidden", "true");
    const pole = document.createElementNS(ns, "path");
    pole.setAttribute("class", "flag-pole");
    pole.setAttribute("d", "M5 21V3.5");
    const cloth = document.createElementNS(ns, "path");
    cloth.setAttribute("class", "flag-cloth");
    cloth.setAttribute("d", "M5 4h12.5l-2.6 4.25L17.5 12.5H5z");
    svg.append(pole, cloth);
    return svg;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // One dialog for the whole page, filled in for whichever item is reported
  function getDialog() {
    if (dialog) return dialog;
    dialog = el("dialog", "report-dialog");
    dialog.setAttribute("aria-labelledby", "report-title");
    const form = el("form");
    const title = el("h2", null, "Report this?");
    title.id = "report-title";
    const intro = el("p", "report-intro",
      "It stays visible while a moderator takes a look. Only moderators can see who reported it.");

    const reasons = el("fieldset", "report-reasons");
    reasons.appendChild(el("legend", "field-label", "What's wrong with it?"));
    REASONS.forEach(([value, label], i) => {
      const row = el("label", "report-reason");
      const radio = el("input");
      radio.type = "radio";
      radio.name = "reason";
      radio.value = value;
      radio.required = true;
      row.append(radio, document.createTextNode(" " + label));
      reasons.appendChild(row);
    });

    const detailsLabel = el("label", "field-label", "Anything else a moderator should know? (optional)");
    detailsLabel.htmlFor = "report-details";
    const details = el("textarea");
    details.id = "report-details";
    details.name = "details";
    details.rows = 3;
    details.maxLength = 500;

    const message = el("p", "auth-message");
    const buttons = el("div", "report-buttons");
    const cancel = el("button", "action-btn", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => dialog.close());
    const send = el("button", "btn report-send", "Report");
    send.type = "submit";
    buttons.append(cancel, send);

    form.append(title, intro, reasons, detailsLabel, details, message, buttons);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const item = dialog.item;
      send.disabled = true;
      message.textContent = "";
      const { data, error } = await supabaseClient.rpc("report_content", {
        p_kind: item.kind,
        p_id: item.id,
        p_reason: form.elements.reason.value,
        p_details: details.value,
      });
      send.disabled = false;
      if (error) {
        message.textContent = error.message;
        message.style.color = "#E07A5F";
        return;
      }
      reported.add(item.kind + ":" + item.id);
      item.onReported(data);
      dialog.close();
    });
    return dialog;
  }

  // The flag button. kind: "post", "comment", "review" or "profile"
  function button(kind, id) {
    const btn = el("button", "action-btn report-btn");
    btn.type = "button";
    const label = el("span", "report-label");

    function paint() {
      const done = reported.has(kind + ":" + id);
      btn.classList.toggle("is-reported", done);
      btn.setAttribute("aria-label", done ? "You reported this " + kind : "Report this " + kind);
      btn.title = done ? "You reported this. A moderator will take a look." : "Report this " + kind;
      label.textContent = done ? "Reported" : "";
    }
    btn.append(flagIcon(), label);
    paint();

    btn.addEventListener("click", () => {
      if (reported.has(kind + ":" + id)) return;
      const d = getDialog();
      const form = d.querySelector("form");
      form.reset();
      d.querySelector(".auth-message").textContent = "";
      d.querySelector("h2").textContent = "Report this " + kind + "?";
      d.item = { kind: kind, id: id, onReported: () => { paint(); btn.focus(); } };
      d.showModal();
    });
    return btn;
  }

  return { loadMine, button };
})();
