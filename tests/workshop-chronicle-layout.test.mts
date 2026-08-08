import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../components/workshop/WorkshopChronicle.tsx",
    import.meta.url,
  ),
  "utf8",
);

test(
  "Workshop Chronicle preserves one full-width chronological stream",
  () => {
    assert.match(
      source,
      /const groups = useMemo/,
    );

    assert.match(
      source,
      /for \(const entry of entries\)/,
    );

    assert.match(
      source,
      /group\.entries\.map\(\(entry\) =>/,
    );

    assert.match(
      source,
      /return \[\.\.\.current, \.\.\.additions\]/,
    );

    assert.match(
      source,
      /max-w-6xl/,
    );

    assert.match(
      source,
      /pl-12 sm:pl-16/,
    );

    assert.doesNotMatch(
      source,
      /alignmentByPublicId/,
    );

    assert.doesNotMatch(
      source,
      /align=\{index % 2 === 0/,
    );

    assert.doesNotMatch(
      source,
      /sm:grid-cols-2/,
    );
  },
);
