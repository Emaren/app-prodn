import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(
  new URL("../components/general-inspections/GeneralInspections.module.css", import.meta.url),
  "utf8",
);
const component = readFileSync(
  new URL("../components/general-inspections/GeneralInspections.tsx", import.meta.url),
  "utf8",
);

test("small inspection score rings keep a square footprint in flex layouts", () => {
  const ring = css.match(/\\.scoreRing\\s*\\{([^}]+)\\}/)?.[1];
  assert.ok(ring, "score ring CSS selector is present");
  assert.match(ring, /\\bflex-shrink:\\s*0\\s*;/);
  assert.match(ring, /\\baspect-ratio:\\s*1\\s*;/);
  assert.match(ring, /\\bwidth:\\s*5\\.25rem\\s*;/);
  assert.match(ring, /\\bheight:\\s*5\\.25rem\\s*;/);
});

test("category titles use their own full-width row below the ring", () => {
  const start = component.indexOf("function CategoryCard(");
  const end = component.indexOf("function CheckRow(", start);
  assert.ok(start !== -1 && end > start);
  const card = component.slice(start, end);
  assert.match(card, /<ScoreRing score=\\{category\\.score\\} state=\\{category\\.state\\} \\/>\\s*<\\/div>\\s*<h2[^>]*break-words/);
  assert.match(card, /<h2[^>]*>\\{category\\.title\\}<\\/h2>/);
  assert.match(card, /<p[^>]*>\\{category\\.description\\}<\\/p>/);
});

test("the overall large score ring remains bound to the real inspection score", () => {
  assert.match(component, /<ScoreRing score=\\{snapshot\\.overallScore\\} state=\\{snapshot\\.overallState\\} large \\/>/);
});
