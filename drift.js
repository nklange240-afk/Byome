// Byome: something to catch now and then. While a logged-in member is
// browsing, a leaf (or, another season, a snowflake...) drifts across the
// screen; catching it gives a prize. The database decides when one may
// appear and draws the prize (database/2026-12-18-falling-leaves.sql);
// this file only shows it.
//
// Loaded on the Community, Reviews, profile and shop pages. Follows the
// "Catchable leaves" accessibility setting: moving, a still button (also
// used whenever motion is reduced), or off.
(function () {
  const NEXT_KEY = "byome-drift-next"; // when this device may next ask, shared by every page and tab
  const FIRST_WAIT = [20, 90];         // seconds on a page before the first look
  const GAP = [10, 20];                // minutes between looks
  const CROSSING = 13;                 // seconds a moving leaf takes to cross the screen

  function rand(a, b) { return a + Math.random() * (b - a); }

  function mode() {
    const setting = (typeof A11Y !== "undefined" && A11Y.get().catch) || "moving";
    if (setting === "off") return "off";
    if (setting === "moving" && typeof A11Y !== "undefined" && A11Y.reducedMotion()) return "still";
    return setting;
  }

  function nextLook() {
    try { return Number(localStorage.getItem(NEXT_KEY)) || 0; } catch (e) { return 0; }
  }
  function setNextLook() {
    try { localStorage.setItem(NEXT_KEY, String(Date.now() + rand(GAP[0], GAP[1]) * 60000)); } catch (e) { /* fine */ }
  }

  let timer = null;
  function later(ms) { clearTimeout(timer); timer = setTimeout(look, ms); }

  // The picture must load before anything is asked for, so a missing
  // picture never uses up a member's leaf
  function loadImage(src) {
    return new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = src;
    });
  }

  let showing = false;
  async function look() {
    if (showing) return;
    if (mode() === "off") { later(5 * 60000); return; }
    // Only while the page is actually being looked at
    if (document.hidden) {
      document.addEventListener("visibilitychange", function back() {
        if (document.hidden) return;
        document.removeEventListener("visibilitychange", back);
        later(rand(5, 20) * 1000);
      });
      return;
    }
    const wait = nextLook() - Date.now();
    if (wait > 0) { later(wait + rand(5, 30) * 1000); return; }
    setNextLook();
    let res;
    try { res = await supabaseClient.rpc("drifter_appear"); } catch (e) { res = null; }
    later(rand(GAP[0], GAP[1]) * 60000);
    if (!res || res.error || !res.data) return;
    const d = res.data;
    const art = await loadImage(d.image);
    if (!art) return;
    if (mode() === "still") showStill(d, art); else showMoving(d, art);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // A short message near the bottom of the screen, read out by screen readers
  function toast(text) {
    const t = el("div", "drifter-toast", text);
    t.setAttribute("role", "status");
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("is-leaving"), 4200);
    setTimeout(() => t.remove(), 5000);
  }

  async function caught(d, done) {
    const res = await supabaseClient.rpc("drifter_catch", { p_id: d.id });
    done();
    if (res.error) { toast(res.error.message); return; }
    const r = res.data;
    const more = r.left_today > 0 ? " (" + r.left_today + " more to catch today)" : " That's all for today!";
    if (r.item && typeof UI !== "undefined") {
      UI.celebrate({ label: "You caught a " + r.name + "!", item: r.item, heading: r.item.name,
                     text: "It's yours to keep." + (r.left_today > 0 ? "" : more) });
    } else {
      toast("You caught a " + r.name + "! +" + r.points + " Byome points." + more);
    }
  }

  // Drifting down across the screen, swaying as it goes
  function showMoving(d, art) {
    showing = true;
    const btn = el("button", "drifter");
    btn.type = "button";
    btn.setAttribute("aria-label", "Catch the " + d.name + " for a prize");
    const pic = el("img");
    pic.src = art.src;
    pic.alt = "";
    btn.appendChild(pic);
    document.body.appendChild(btn);

    const startX = rand(8, 80);
    const sway = rand(6, 12) * (Math.random() < 0.5 ? -1 : 1);
    const frames = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = startX + t * sway * 0.6 + Math.sin(t * Math.PI * 3) * sway * 0.5;
      const y = -12 + t * 124;
      const turn = Math.sin(t * Math.PI * 3) * 35;
      frames.push({ transform: "translate(" + x.toFixed(2) + "vw, " + y.toFixed(2) + "vh) rotate(" + turn.toFixed(1) + "deg)" });
    }
    const anim = btn.animate(frames, { duration: Math.min(CROSSING, d.seconds) * 1000, easing: "linear", fill: "forwards" });
    let finished = false;
    function finish() { if (finished) return; finished = true; btn.remove(); showing = false; }
    anim.onfinish = finish;
    btn.addEventListener("click", () => {
      anim.pause();
      btn.disabled = true;
      btn.classList.add("is-caught");
      caught(d, () => setTimeout(finish, 450));
    }, { once: true });
  }

  // A still card instead, for reduced motion or anyone who'd rather
  function showStill(d, art) {
    showing = true;
    const card = el("div", "drifter-still");
    card.setAttribute("role", "status");
    const pic = el("img");
    pic.src = art.src;
    pic.alt = "";
    const text = el("p", null, "A " + d.name + " drifted by!");
    const btn = el("button", "btn btn-solid", "Catch it");
    btn.type = "button";
    card.append(pic, text, btn);
    document.body.appendChild(card);
    let finished = false;
    function finish() { if (finished) return; finished = true; card.remove(); showing = false; }
    const gone = setTimeout(finish, Math.max(10, d.seconds - 10) * 1000);
    btn.addEventListener("click", () => {
      clearTimeout(gone);
      btn.disabled = true;
      caught(d, finish);
    }, { once: true });
  }

  async function start() {
    if (typeof supabaseClient === "undefined") return;
    let session = null;
    try { session = (await supabaseClient.auth.getSession()).data.session; } catch (e) { return; }
    if (!session) return; // members only
    later(Math.max(nextLook() - Date.now(), 0) + rand(FIRST_WAIT[0], FIRST_WAIT[1]) * 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
