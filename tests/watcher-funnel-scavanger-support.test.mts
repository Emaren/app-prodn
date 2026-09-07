import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/watcherFunnel.ts", import.meta.url),
  "utf8",
);

test("Scavanger_Ab has a permanent Watcher support target", () => {
  assert.match(
    source,
    /const SCAVANGER_UID = "u_79fdf670637b4acd9c61ca3c49162cd1";/,
  );

  const supportBlock =
    source.match(
      /const SUPPORT_USER_TARGETS:[\s\S]*?\n\];/,
    )?.[0] ?? "";

  assert.match(
    supportBlock,
    /label: "Scavanger_Ab"[\s\S]*?userUid: SCAVANGER_UID/,
  );
  assert.match(supportBlock, /"Scavanger_Ab"/);
  assert.match(supportBlock, /"Savanger_Ab"/);
  assert.match(supportBlock, /"Scavenger_Ab"/);
  assert.match(
    supportBlock,
    /tileKind: "dedicated"/,
  );
});
