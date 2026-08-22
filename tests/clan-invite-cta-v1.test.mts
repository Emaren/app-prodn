import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "components/contact/ContactInboxPanel.tsx",
  "utf8",
);

test("Clan invitation presents the forged Hall-entry CTA", () => {
  assert.match(source, /Take Your Seat/);
  assert.match(source, /Enter the Hall/);
  assert.match(source, /radial-gradient\(circle_at_50%_0%/);
  assert.match(source, /hover:-translate-y-0\.5/);

  assert.doesNotMatch(
    source,
    /bg-amber-200[\s\S]{0,180}>\s*Accept\s*</,
  );
});
