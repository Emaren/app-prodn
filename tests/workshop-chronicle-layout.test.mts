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
  "Workshop Chronicle alternates across the full chronological stream",
  () => {
    assert.match(
      source,
      /const alignmentByPublicId = useMemo/,
    );

    assert.match(
      source,
      /entries\.map\(\(entry, index\) =>/,
    );

    assert.match(
      source,
      /alignmentByPublicId\.get\(entry\.publicId\)/,
    );

    assert.doesNotMatch(
      source,
      /align=\{index % 2 === 0/,
    );
  },
);
