// Accessibility settings: reduce motion, larger text and higher contrast.
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
  const DEFAULTS = { motion: "device", text: "default", contrast: "default" };
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

  apply();
  return { get, set, reducedMotion };
})();
