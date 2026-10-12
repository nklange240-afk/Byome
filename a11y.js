// Accessibility settings: reduce motion, larger text, higher contrast,
// calm backgrounds and an easy-reading font.
// Saved on this device (so they work for guests too) and applied before the
// page is drawn: this file loads in each page's <head>, right after
// style.css, so the browser has the stylesheet ready when it runs.
//   A11Y.get()                  the current settings
//   A11Y.set(name, value)       change one and apply it straight away
//   A11Y.reducedMotion()        true if motion should be kept to a minimum
//                               (this setting, or the device's own setting)
// The settings panel itself is in ui.js (UI.openAccessibility).
const A11Y = (function () {
  const KEY = "byome-a11y";
  const DEFAULTS = { motion: "device", text: "default", contrast: "default", background: "full", font: "default" };
  // Atkinson Hyperlegible, a free font designed for low vision; only
  // downloaded for people who choose it
  const READABLE_FONT = "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap";
  const deviceReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function get() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function reducedMotion() {
    return get().motion === "reduce" || Boolean(deviceReduce && deviceReduce.matches);
  }

  // style.css keeps its moving parts inside @media (prefers-reduced-motion:
  // no-preference) blocks, with still versions in (prefers-reduced-motion:
  // reduce) blocks. Choosing "Reduce motion" switches those blocks the same
  // way the device setting would.
  const motionRules = [];
  function findMotionRules() {
    if (motionRules.length) return;
    Array.from(document.styleSheets).forEach((sheet) => {
      if (!sheet.href || !/style\.css/.test(sheet.href)) return;
      let rules;
      try { rules = sheet.cssRules; } catch (e) { return; }
      Array.from(rules).forEach((rule) => {
        if (!rule.media) return;
        const text = rule.media.mediaText;
        if (/prefers-reduced-motion:\s*no-preference/.test(text)) motionRules.push({ rule, original: text, reduced: "not all" });
        else if (/prefers-reduced-motion:\s*reduce/.test(text)) motionRules.push({ rule, original: text, reduced: "all" });
      });
    });
  }

  function apply() {
    const s = get();
    const root = document.documentElement;
    root.classList.toggle("a11y-text-large", s.text === "large");
    root.classList.toggle("a11y-text-xlarge", s.text === "xlarge");
    root.classList.toggle("a11y-contrast", s.contrast === "high");
    root.classList.toggle("a11y-reduce-motion", s.motion === "reduce");
    root.classList.toggle("a11y-calm", s.background === "calm");
    root.classList.toggle("a11y-readable-font", s.font === "readable");
    if (s.font === "readable" && !document.getElementById("a11y-font")) {
      const link = document.createElement("link");
      link.id = "a11y-font";
      link.rel = "stylesheet";
      link.href = READABLE_FONT;
      document.head.appendChild(link);
    }
    findMotionRules();
    motionRules.forEach((m) => { m.rule.media.mediaText = s.motion === "reduce" ? m.reduced : m.original; });
  }

  function set(name, value) {
    const s = get();
    s[name] = value;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* still applies for this visit */ }
    apply();
    document.dispatchEvent(new CustomEvent("a11y-change", { detail: s }));
  }

  // "Skip to content": the first thing keyboard and screen reader users
  // reach on every page, jumping past the logo and menu. Hidden until it
  // has focus.
  function addSkipLink() {
    const main = document.querySelector("main");
    if (!main || document.querySelector(".skip-link")) return;
    if (!main.id) main.id = "main";
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    const link = document.createElement("a");
    link.className = "skip-link";
    link.href = "#" + main.id;
    link.textContent = "Skip to content";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      main.focus();
      main.scrollIntoView();
    });
    document.body.prepend(link);
  }

  apply();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addSkipLink);
  else addSkipLink();
  return { get, set, reducedMotion };
})();
