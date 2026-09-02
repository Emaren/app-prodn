import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const source =
  readFileSync(
    new URL(
      "../app/national-champions/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "national champion belt cards use canonical nation routes",
  () => {
    assert.match(
      source,
      /us:\s*"usa"/,
    );

    assert.match(
      source,
      /uk:\s*"uk"/,
    );

    assert.doesNotMatch(
      source,
      /us:\s*"united-states"/,
    );

    assert.doesNotMatch(
      source,
      /uk:\s*"united-kingdom"/,
    );
  },
);
