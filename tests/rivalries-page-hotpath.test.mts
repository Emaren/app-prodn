import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL(
    "../app/rivalries/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("rivalries keeps the rich initial payload bounded", () => {
  const match =
    page.match(
      /const RIVALRIES_PER_PAGE = (\d+);/,
    );

  assert.ok(match);
  assert.ok(
    Number(match[1]) <= 36,
    "the initial rivalry payload must stay at or below 36 boards",
  );
});

test("rivalry pagination still exposes the complete board set", () => {
  assert.match(
    page,
    /Math\.ceil\(boards\.length \/ RIVALRIES_PER_PAGE\)/,
  );
  assert.match(
    page,
    /boards\.slice\(/,
  );
  assert.match(
    page,
    /page \* RIVALRIES_PER_PAGE/,
  );
  assert.match(
    page,
    /totalBoards=\{totals\.boards\}/,
  );
});
