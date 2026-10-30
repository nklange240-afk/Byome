// Byome tests: quick checks on the site's files, no database needed.
//   node tests/static-checks.js
// Fails (and says why) if:
//  - a script has a syntax error (the page would stop working)
//  - style.css has an unclosed or extra { } (everything after it is ignored)
//  - the Supabase project key isn't in exactly one file (supabase-client.js)
//  - the pages don't all load the same ?v= version (browsers would mix old
//    and new files)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const problems = [];
const files = fs.readdirSync(root);

// Scripts parse
for (const f of files.filter((f) => f.endsWith(".js"))) {
  try {
    new vm.Script(fs.readFileSync(path.join(root, f), "utf8"), { filename: f });
  } catch (e) {
    problems.push(`${f}: ${e.message}`);
  }
}

// Every { in style.css has its }
{
  const css = fs.readFileSync(path.join(root, "style.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")) // comments, keeping line numbers
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (s) => s.replace(/[{}]/g, " ")); // strings
  let depth = 0;
  const open = [];
  css.split("\n").forEach((line, i) => {
    for (const ch of line) {
      if (ch === "{") { depth++; open.push(i + 1); }
      if (ch === "}") {
        depth--;
        open.pop();
        if (depth < 0) { problems.push(`style.css line ${i + 1}: a } with no { before it`); depth = 0; }
      }
    }
  });
  if (depth > 0) problems.push(`style.css: ${depth} { never closed (the first opens on line ${open[0]})`);
}

// The project key lives only in supabase-client.js
{
  const key = "vkgygg" + "daxutneedwrrhj"; // (split, so this file doesn't count as a second copy)
  const withKey = files.filter((f) => f.endsWith(".js") && fs.readFileSync(path.join(root, f), "utf8").includes(key));
  if (withKey.length !== 1 || withKey[0] !== "supabase-client.js") {
    problems.push(`The Supabase project key should be in supabase-client.js only; found in: ${withKey.join(", ") || "no file"}`);
  }
}

// One ?v= version across every page
{
  const versions = {};
  for (const f of files.filter((f) => f.endsWith(".html"))) {
    for (const m of fs.readFileSync(path.join(root, f), "utf8").matchAll(/\.(?:js|css)\?v=(\d+)/g)) {
      (versions[m[1]] = versions[m[1]] || new Set()).add(f);
    }
  }
  const found = Object.keys(versions);
  if (found.length > 1) {
    problems.push("Pages load different versions: " + found.map((v) => `v=${v} (${[...versions[v]].join(", ")})`).join("; "));
  }
}

if (problems.length) {
  problems.forEach((p) => console.log("::error::" + p));
  process.exit(1);
}
console.log("All file checks passed.");
