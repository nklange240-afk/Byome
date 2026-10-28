// The daily surprise: once a day (Central time) a member picks one of three
// seed packets, it shakes, and the prize pops out of the top. The prize is
// drawn by the database when the packet is opened
// (database/2026-11-26-daily-surprise.sql), so the packet's colour or
// position makes no difference. While an event is on, each day's surprise
// also stamps the event's calendar.
//   DAILY.card(container, after)   the "Your daily surprise is waiting"
//                                  card (only until today's is opened)
const DAILY = (function () {
  // The packets. Each member sees three, in their own mix for the day.
  // To add a colour: a transparent PNG (300 x 400, same shape as the
  // others) in biome-assets, and a line here.
  const PACKETS = [
    { key: "yellow", image: "biome-assets/packet-yellow.png" },
    { key: "blue", image: "biome-assets/packet-blue.png" },
    { key: "pink", image: "biome-assets/packet-pink.png" },
  ];

  const HEADINGS = {
    small: "A little something!",
    good: "A good haul!",
    great: "What a find!",
    lucky: "Lucky day!",
    jackpot: "Jackpot!",
    item: "Something for your shelf!",
    rare: "A rare find!",
    heirloom: "An heirloom!",
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // The same three packets all day for one member (a refresh doesn't
  // reshuffle them), but a different mix for each member and each day
  function todaysPackets(userId, day) {
    let seed = 0;
    const text = userId + day;
    for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    const pool = PACKETS.slice();
    const chosen = [];
    while (chosen.length < 3 && pool.length) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      chosen.push(pool.splice(seed % pool.length, 1)[0]);
    }
    return chosen;
  }

  function packetEl(p) {
    const b = el("button", "daily-packet");
    b.type = "button";
    if (p.image) {
      const img = el("img");
      img.src = p.image;
      img.alt = "";
      b.appendChild(img);
      b.classList.add("has-art");
    } else {
      b.style.setProperty("--packet", p.color);
    }
    return b;
  }

  // Byome points are a leaf everywhere on the site (profile, shop), so the
  // prize is the same leaf, just bigger
  function leafIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "daily-leaf");
    const body = document.createElementNS(ns, "path");
    body.setAttribute("class", "leaf-body");
    body.setAttribute("d", "M20 4C10 4 4.5 9.5 4.5 15c0 2.2 1.3 4 3.5 4C14.5 19 20 14 20 4z");
    const vein = document.createElementNS(ns, "path");
    vein.setAttribute("class", "leaf-vein");
    vein.setAttribute("d", "M3.5 21C7 15 11 11.5 15 9");
    svg.append(body, vein);
    return svg;
  }

  function reduceMotion() {
    return typeof A11Y !== "undefined" && A11Y.reducedMotion();
  }

  function pointsText(n) {
    return "+" + n + " Byome " + (n === 1 ? "point" : "points");
  }

  // ---------- The card ----------
  async function card(container, after) {
    if (!container) return;
    const { data: session } = await supabaseClient.auth.getSession();
    if (!session.session) return;
    const { data, error } = await supabaseClient.rpc("daily_gift_today");
    if (error || !data || data.claimed) return;

    const box = el("button", "daily-card");
    box.type = "button";
    // The card shows the first of today's packets
    const icon = el("img", "daily-card-packet");
    icon.src = todaysPackets(session.session.user.id, data.day)[0].image;
    icon.alt = "";
    const text = el("span", "daily-card-text");
    text.append(el("strong", null, "Your daily surprise is waiting"),
      el("span", null, "Pick a packet and shake out today's prize."));
    box.append(icon, text);
    box.addEventListener("click", () => open(session.session.user.id, data, () => box.remove()));
    if (after) after.after(box); else container.prepend(box);
  }

  // ---------- Picking ----------
  function open(userId, today, onClaimed) {
    const dialog = el("dialog", "celebrate daily-dialog");
    dialog.setAttribute("aria-labelledby", "daily-heading");
    const head = el("div", "daily-head");
    const h = el("h2", null, "Today's surprise");
    h.id = "daily-heading";
    const sub = el("p", "daily-sub", "Pick a packet and give it a shake.");
    const amount = el("p", "daily-amount");
    amount.setAttribute("aria-live", "polite");
    head.append(h, sub, amount);

    const stage = el("div", "daily-stage");
    const prize = el("div", "daily-prize");
    prize.setAttribute("aria-hidden", "true");
    const row = el("div", "daily-packets");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Seed packets");
    const packets = todaysPackets(userId, today.day).map((p, i) => {
      const b = packetEl(p);
      b.setAttribute("aria-label", "Packet " + (i + 1) + " of 3");
      row.appendChild(b);
      return b;
    });
    stage.append(prize, row);

    const after = el("div", "daily-after");
    const close = el("button", "btn btn-ghost daily-close", "Maybe later");
    close.type = "button";
    close.addEventListener("click", () => dialog.close());
    dialog.append(head, stage, after, close);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (e) => { if (e.target === dialog && !busy) dialog.close(); });
    document.body.appendChild(dialog);
    dialog.showModal();
    packets[0].focus();

    let busy = false;
    packets.forEach((b) => b.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      packets.forEach((x) => { x.disabled = true; if (x !== b) x.classList.add("is-dim"); });
      b.classList.add("is-chosen");
      close.hidden = true;
      // The shake and the draw happen together, so there's no extra wait
      const shake = new Promise((resolve) => {
        if (reduceMotion()) { resolve(); return; }
        b.classList.add("is-shaking");
        setTimeout(resolve, 900);
      });
      const [{ data: gift, error }] = await Promise.all([supabaseClient.rpc("claim_daily_gift"), shake]);
      b.classList.remove("is-shaking");
      if (error) {
        h.textContent = "Hmm, that didn't work";
        sub.textContent = /claim_daily_gift/.test(error.message) ? "The daily surprise isn't switched on yet." : error.message;
        close.textContent = "Close";
        close.hidden = false;
        return;
      }
      reveal(gift, b);
      if (onClaimed) onClaimed();
      if (typeof UI !== "undefined" && UI.checkAchievements) UI.checkAchievements();
    }));

    function reveal(gift, packet) {
      const tier = gift.tier;
      // Where the prize comes out: the top of the chosen packet
      const r = packet.getBoundingClientRect(), s = stage.getBoundingClientRect();
      prize.style.left = (r.left - s.left + r.width / 2) + "px";
      prize.style.bottom = (s.bottom - r.top - 24) + "px";
      if (gift.item) {
        prize.classList.add("is-item");
        prize.appendChild(UI.itemArt(gift.item, "daily-prize-art"));
      } else {
        prize.appendChild(leafIcon());
      }
      prize.classList.add("is-out", "tier-" + tier);
      if (reduceMotion()) prize.classList.add("no-motion");

      // (until the rare and heirloom exclusives exist, those draws give points)
      h.textContent = (tier === "rare" || tier === "heirloom") && !gift.item ? HEADINGS.great : HEADINGS[tier] || HEADINGS.small;
      sub.textContent = "";
      if (gift.item) {
        amount.textContent = gift.item.name + (gift.duplicate ? " (another one for your collection)" : "");
      } else {
        amount.textContent = pointsText(gift.points);
      }
      amount.classList.add("is-on");

      // The event calendar
      if (gift.calendar) after.appendChild(calendarBox(gift));

      // While you're here
      supabaseClient.rpc("daily_nudge").then(({ data: p }) => {
        if (!p) return;
        const nudge = el("p", "daily-nudge");
        const a = el("a", "inline-link", "Write the first one");
        a.href = "reviews.html?product=" + encodeURIComponent(p.id);
        nudge.append(el("strong", null, "While you're here: "),
          document.createTextNode(p.brand + " — " + p.name + " doesn't have any reviews yet. Tried it? "), a);
        after.appendChild(nudge);
      });

      const actions = el("div", "celebrate-actions");
      if (gift.item || gift.calendar_item) {
        const place = el("a", "btn btn-ghost", "Put it on my shelf");
        place.href = "profile.html?shelf=edit";
        actions.appendChild(place);
      }
      const done = el("button", "btn btn-solid", "See you tomorrow!");
      done.type = "button";
      done.addEventListener("click", () => dialog.close());
      actions.appendChild(done);
      dialog.appendChild(actions);
      done.focus();
    }
  }

  // ---------- The event calendar ----------
  // Seven stamps; days don't need to be in a row
  function calendarBox(gift) {
    const cal = gift.calendar;
    const box = el("div", "daily-calendar");
    box.appendChild(el("p", "daily-calendar-title", cal.name + " calendar"));
    const days = el("ol", "daily-calendar-days");
    for (let n = 1; n <= cal.total; n++) {
      const li = el("li", "daily-stamp" + (n <= cal.stamps ? " is-done" : "") + (n === gift.calendar_stamp ? " is-today" : "")
        + ([2, 4, 6].indexOf(n) !== -1 ? " is-treat" : "") + (n === cal.total ? " is-final" : ""), String(n));
      li.setAttribute("aria-label", "Stamp " + n + (n <= cal.stamps ? ", collected" : ""));
      days.appendChild(li);
    }
    box.appendChild(days);

    let note;
    if (gift.calendar_item) note = "Stamp 7! You've earned the calendar's exclusive: " + gift.calendar_item.name + ".";
    else if (gift.calendar_points) note = "Stamp " + gift.calendar_stamp + ": " + pointsText(gift.calendar_points) + " from the calendar!";
    else if (cal.stamps >= cal.total) note = "You've filled the calendar. Well done!";
    else {
      const left = cal.total - cal.stamps;
      note = left + (left === 1 ? " stamp" : " stamps") + " to go. Days don't need to be in a row.";
    }
    box.appendChild(el("p", "daily-calendar-note", note));
    return box;
  }

  return { card, todaysPackets };
})();
