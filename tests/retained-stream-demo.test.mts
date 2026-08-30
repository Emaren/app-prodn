import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateRetainedDemoEligibility,
  MAX_RETAINED_DEMO_BYTES,
  MAX_RETAINED_DEMO_DURATION_SECONDS,
} from "../lib/retainedStreamDemo.ts";
import { isAoE2WarManagedStream } from "../lib/streamIdentity.ts";

function eligibleCandidate() {
  return {
    provider: "aoe2war",
    sourceType: "watcher_native",
    status: "ended",
    startedAt: new Date("2026-08-30T01:00:00.000Z"),
    endedAt: new Date("2026-08-30T01:20:00.000Z"),
    usage: { chunkCount: 20, totalBytes: 20_000, latestSequence: 19 },
  };
}

test("only a bounded, ended native Watcher recording is retainable", () => {
  assert.deepEqual(evaluateRetainedDemoEligibility(eligibleCandidate()), {
    ok: true,
    durationSeconds: 1_200,
  });

  assert.equal(
    evaluateRetainedDemoEligibility({ ...eligibleCandidate(), sourceType: "browser" }).ok,
    false,
  );
  assert.equal(
    evaluateRetainedDemoEligibility({ ...eligibleCandidate(), status: "live" }).ok,
    false,
  );
  assert.equal(
    evaluateRetainedDemoEligibility({
      ...eligibleCandidate(),
      endedAt: new Date(
        eligibleCandidate().startedAt.getTime() +
          (MAX_RETAINED_DEMO_DURATION_SECONDS + 1) * 1_000,
      ),
    }).ok,
    false,
  );
  assert.equal(
    evaluateRetainedDemoEligibility({
      ...eligibleCandidate(),
      usage: {
        chunkCount: 1,
        totalBytes: MAX_RETAINED_DEMO_BYTES + 1,
        latestSequence: 0,
      },
    }).ok,
    false,
  );
});

test("stream ownership never admits a different authenticated user", () => {
  const stream = { provider: "aoe2war", sourceType: "watcher_native", userId: 42 };
  assert.equal(isAoE2WarManagedStream(stream, 42), true);
  assert.equal(isAoE2WarManagedStream(stream, 43), false);
  assert.equal(isAoE2WarManagedStream({ ...stream, provider: "external" }, 42), false);
});

test("the database and routes enforce one explicit retained-demo slot", () => {
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260830040000_add_single_retained_stream_demo/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const adminRoute = readFileSync(
    new URL("../app/api/admin/streams/retained-demo/route.ts", import.meta.url),
    "utf8",
  );
  const cleanup = readFileSync(new URL("../lib/streamCleanup.ts", import.meta.url), "utf8");
  const retainedDemo = readFileSync(
    new URL("../lib/retainedStreamDemo.ts", import.meta.url),
    "utf8",
  );
  const watchRoute = readFileSync(
    new URL("../app/api/watch-streams/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(migration, /PRIMARY KEY \("slot"\)/);
  assert.match(migration, /CHECK \("slot" = 1\)/);
  assert.match(migration, /UNIQUE \("stream_id"\)/);
  assert.match(adminRoute, /requireAdmin\(request\)/);
  assert.match(adminRoute, /loadLiveReplayDetailSnapshot/);
  assert.match(adminRoute, /deleteSingleRetainedDemo/);
  assert.match(cleanup, /protectedRetainedStreamIds/);
  assert.match(cleanup, /pruning skipped/);
  assert.match(watchRoute, /retainedStreamIds\.has\(stream\.id\)/);
  assert.match(retainedDemo, /\$executeRaw`SELECT pg_advisory_xact_lock/);
  assert.doesNotMatch(retainedDemo, /\$queryRaw`SELECT pg_advisory_xact_lock/);
});

test("native upload handlers authenticate before ownership and storage mutation", () => {
  const chunkRoute = readFileSync(
    new URL("../app/api/streams/[streamId]/chunks/route.ts", import.meta.url),
    "utf8",
  );
  const actorOffset = chunkRoute.indexOf("resolveStreamRequestActor");
  const ownershipOffset = chunkRoute.indexOf("isAoE2WarManagedStream(stream, actor.user.id)");
  const bodyOffset = chunkRoute.indexOf("request.arrayBuffer()");
  const writeOffset = chunkRoute.indexOf("writeStreamChunk(id, sequence");

  assert.ok(actorOffset >= 0 && actorOffset < ownershipOffset);
  assert.ok(ownershipOffset < bodyOffset);
  assert.ok(bodyOffset < writeOffset);
});
