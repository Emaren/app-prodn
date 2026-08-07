import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(
  "components/workshop/WorkshopExperience.tsx",
  "utf8",
);
const polish = readFileSync(
  "app/workshop/workshop-polish.css",
  "utf8",
);

test("Basic and Advanced render the Workshop mural at the top", () => {
  assert.match(experience, /<WorkshopHeroBanner tone="basic" \/>/);
  assert.match(experience, /<WorkshopHeroBanner tone="advanced" \/>/);
  assert.match(experience, /workshop-observatory-hero\.webp/);
});

test("Extreme starts clean and toggles the mural on main-tile clicks", () => {
  assert.match(experience, /useState\(false\)/);
  assert.match(experience, /data-workshop-extreme-hero/);
  assert.match(
    experience,
    /setHeroBackgroundVisible\(\(current\) => !current\)/,
  );
  assert.match(polish, /data-workshop-extreme-hero="on"/);
  assert.match(polish, /opacity: 0;/);
  assert.match(polish, /opacity: 0\.48;/);
});

test("BAE controls do not toggle the Extreme mural", () => {
  assert.match(
    experience,
    /onClick=\{\(event\) => event\.stopPropagation\(\)\}/,
  );
});
