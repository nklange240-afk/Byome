// This file creates ONE shared connection to Supabase that every
// page on the site reuses. You only set this up once.

// --- REPLACE THESE TWO LINES ---
// Find these in your Supabase dashboard under: Project Settings > API
const SUPABASE_URL = "https://vkgyggdaxutneedwrrhj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrZ3lnZ2RheHV0bmVlZHdycmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MzcxNTgsImV4cCI6MjEwNjMxMzE1OH0.5F7viVh3qqXMHnB9XLdAV1Z0oxYWADqm-nHkoWmy94Q";
// --------------------------------

// "supabase" here comes from the script tag we load in each HTML
// file before this one — it's the Supabase library itself.
const { createClient } = supabase;
// Always ask for fresh data. Without this, pressing Back can show a saved
// copy of a page's data (for example, notifications you've just read
// still looking unread).
//
// Every request is also watched: if one takes more than 10 seconds, or
// can't get through at all, ui.js shows a gentle "loading slowly" note
// (usually a hiccup at Supabase, the service that stores Byome's data),
// and hides it again once everything has arrived.
const byomeNet = { pending: 0 };
function watchedFetch(url, options) {
  const watch = String(url).indexOf("/storage/") === -1; // big picture uploads can take a while
  if (watch) byomeNet.pending++;
  const slow = watch ? setTimeout(() => document.dispatchEvent(new CustomEvent("byome-slow")), 10000) : null;
  const done = () => {
    if (!watch) return;
    clearTimeout(slow);
    byomeNet.pending--;
    if (byomeNet.pending === 0) document.dispatchEvent(new CustomEvent("byome-ok"));
  };
  return fetch(url, Object.assign({}, options, { cache: "no-store" })).then(
    (res) => { done(); return res; },
    (err) => {
      done();
      // (not when the page itself cancelled it, e.g. by leaving the page)
      if (!(err && err.name === "AbortError")) document.dispatchEvent(new CustomEvent("byome-unreachable"));
      throw err;
    });
}
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: watchedFetch },
});
