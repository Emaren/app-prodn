import assert from "node:assert/strict";
import test from "node:test";
import {
  loadLeaderboardLaneCached,
  readLeaderboardLaneCache,
} from "../lib/leaderboardLaneClientCache.ts";

test("client lane prefetch cannot shortchange larger concurrent requests", async () => {
  const originalFetch = globalThis.fetch;
  const requested: number[] = [];
  const pending = new Map<number, (response: Response) => void>();
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const limit = Number(url.searchParams.get("limit"));
    requested.push(limit);
    return new Promise<Response>((resolve) => {
      pending.set(limit, resolve);
    });
  }) as typeof fetch;

  const respond = (limit: number, length: number, total: number) => {
    const release = pending.get(limit);
    assert.ok(release, `missing pending ${limit}-row request`);
    release(new Response(JSON.stringify({
      lane: "dm",
      scope: "claimed",
      trackedPlayers: total,
      entries: Array.from({ length }, (_, index) => ({ rank: index + 1 })),
    }), { status: 200, headers: { "content-type": "application/json" } }));
  };

  try {
    const small = loadLeaderboardLaneCached("dm", { scope: "claimed", limit: 64, force: true });
    const big = loadLeaderboardLaneCached("dm", { scope: "claimed", limit: 128, force: true });
    assert.deepEqual(requested, [64, 128]);

    // Deliberately complete the larger request before the smaller prefetch.
    respond(128, 128, 200);
    assert.equal((await big).entries.length, 128);
    respond(64, 64, 200);
    assert.equal((await small).entries.length, 64);
    assert.equal(readLeaderboardLaneCache("dm", "claimed")?.entries.length, 128);

    // A 200-row caller cannot be satisfied by a cached 128-row first page.
    const larger = loadLeaderboardLaneCached("dm", { scope: "claimed", limit: 200 });
    assert.deepEqual(requested, [64, 128, 200]);
    respond(200, 200, 200);
    assert.equal((await larger).entries.length, 200);
    // Complete roster: requesting more must not cause another network call.
    assert.equal((await loadLeaderboardLaneCached("dm", { scope: "claimed", limit: 300 })).entries.length, 200);
    assert.deepEqual(requested, [64, 128, 200]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
