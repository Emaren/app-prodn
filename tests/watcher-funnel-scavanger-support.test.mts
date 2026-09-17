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

test("support diagnostics warn when a watcher trails the public release", () => {
  assert.match(source, /import \{ WATCHER_RELEASE \} from "@\/lib\/watcherRelease"/);
  assert.match(source, /watcherVersionIsBehind\(appVersion, WATCHER_RELEASE\.version\)/);
  assert.match(
    source,
    /Restart Watcher or use Check Update\./,
  );
});


test("watcher funnel distinguishes structural folder validity from replay activity", () => {
  assert.match(source, /folderSupportedReplayCount/);
  assert.match(source, /folderLatestReplayBasename/);
  assert.match(source, /folderLatestReplayModifiedAt/);
  assert.match(source, /folderActivityProven/);
  assert.match(source, /contains 0 supported replay files and has no replay activity/);
});


test("Tekki has a permanent Watcher support target while folder recovery is observed", () => {
  assert.match(source, /const TEKKI_UID = "u_3379d1d2360d4c05ac88796ba7eda15c";/);
  const supportBlock = source.match(/const SUPPORT_USER_TARGETS:[\s\S]*?\n\];/)?.[0] ?? "";
  assert.match(supportBlock, /label: "Tekki"[\s\S]*?userUid: TEKKI_UID/);
  assert.match(supportBlock, /nameMatches: \["Tekki"\]/);
});
