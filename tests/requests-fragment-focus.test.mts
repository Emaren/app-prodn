import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/requests/page.tsx", import.meta.url), "utf8");
const focus = readFileSync(new URL("../components/requests/RequestFragmentFocus.tsx", import.meta.url), "utf8");
const about = readFileSync(new URL("../app/about/page.tsx", import.meta.url), "utf8");
const roadmap = readFileSync(new URL("../app/roadmap/page.tsx", import.meta.url), "utf8");

test("original about and roadmap redirects remain anchored to Requests", () => {
  assert.match(about, /redirect\("\/requests#about"\)/);
  assert.match(roadmap, /redirect\("\/requests#roadmap"\)/);
});

test("Requests offers keyboard targets for both original anchored destinations", () => {
  assert.match(page, /<section id="about" tabIndex=\{-1\}/);
  assert.match(page, /<section id="roadmap" tabIndex=\{-1\}/);
  assert.match(page, /<RequestFragmentFocus \/>/);
});

test("fragment focus uses a narrow allowlist and never steals user focus or scroll", () => {
  assert.match(focus, /fragment !== "about" && fragment !== "roadmap"/);
  assert.match(focus, /active !== document\.body && active !== document\.documentElement/);
  assert.match(focus, /focus\(\{ preventScroll: true \}\)/);
  assert.match(focus, /removeEventListener\("hashchange", focusFromFragment\)/);
});
