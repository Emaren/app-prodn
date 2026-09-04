import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const docsOs = readFileSync(
  "scripts/aoe2_docs.py",
  "utf8",
);

const recovery = readFileSync(
  "scripts/aoe2_recovery.py",
  "utf8",
);

const memory = readFileSync(
  "docs/ENGINEERING_MEMORY.md",
  "utf8",
);

const betting = readFileSync(
  "docs/BETTING_HALL_PRODUCT_AND_CONCURRENCY.md",
  "utf8",
);

test("high-risk Documentation OS requires Engineering Memory coverage", () => {
  assert.match(
    docsOs,
    /ENGINEERING_MEMORY_PATH = "docs\/ENGINEERING_MEMORY\.md"/,
  );

  assert.match(
    docsOs,
    /engineering_memory_required/,
  );

  assert.match(
    docsOs,
    /engineering_memory_changed/,
  );

  assert.match(
    docsOs,
    /semantic_review and semantic_changed and memory_changed/,
  );
});

test("Recovery OS distinguishes verified DB pilot from complete DR", () => {
  assert.match(
    recovery,
    /latest_verified_pilot/,
  );

  assert.match(
    recovery,
    /PILOT_VERIFIED/,
  );

  assert.match(
    memory,
    /Full Recovery OS remains intentionally NOT_VERIFIED/,
  );
});

test("durable memory carries Replay Durability and index closure", () => {
  assert.match(
    memory,
    /Replay Durability V1 \/ historical Gate 6 is closed/,
  );

  assert.match(
    memory,
    /Classification: `CANONICAL_ALREADY`/,
  );

  assert.match(
    memory,
    /Retry-After: 5/,
  );
});

test("Betting V2 preserves future phase books while V1.2 active-window compatibility is live", () => {
  assert.match(
    betting,
    /three independent winner books/,
  );

  assert.match(
    betting,
    /MUST NOT share one economic pool/,
  );

  assert.match(
    betting,
    /Opening Minute \/ Live Book/,
  );

  assert.match(
    betting,
    /Late Book \/ In-Game/,
  );

  assert.match(
    betting,
    /Current production uses the Betting Fairness V1\.2 compatibility bridge/,
  );

  assert.match(
    betting,
    /Watcher-born Desync proposition uses the same authoritative active window/,
  );

  assert.match(
    betting,
    /not the final phase-book\s+architecture/,
  );
});
