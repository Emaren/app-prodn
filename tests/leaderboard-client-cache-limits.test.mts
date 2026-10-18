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

test("later authoritative response replaces a richer obsolete lane cache", async () => {
  const originalFetch = globalThis.fetch;
  const waiters = new Map<number, (response: Response) => void>();
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const limit = Number(url.searchParams.get("limit"));
    return new Promise<Response>((resolve) => waiters.set(limit, resolve));
  }) as typeof fetch;

  const resolve = (limit: number, count: number, total: number) => {
    const pending = waiters.get(limit);
    assert.ok(pending, `missing ${limit} request`);
    pending(new Response(JSON.stringify({
      lane: "rm", scope: "claimed", trackedPlayers: total,
      entries: Array.from({ length: count }, (_, index) => ({ rank: index + 1 })),
    }), { status: 200, headers: { "content-type": "application/json" } }));
  };

  try {
    const obsolete = loadLeaderboardLaneCached("rm", { scope: "claimed", limit: 128, force: true });
    const current = loadLeaderboardLaneCached("rm", { scope: "claimed", limit: 64, force: true });
    // The latest request returns first with fewer members.
    resolve(64, 20, 20);
    assert.equal((await current).trackedPlayers, 20);
    resolve(128, 128, 200);
    assert.equal((await obsolete).trackedPlayers, 200);
    const cached = readLeaderboardLaneCache("rm", "claimed");
    assert.equal(cached?.trackedPlayers, 20);
    assert.equal(cached?.entries.length, 20);

    // A later smaller *fresh* response must replace the old longer snapshot.
    const refreshed = loadLeaderboardLaneCached("rm", { scope: "claimed", limit: 128, force: true });
    resolve(128, 12, 12);
    assert.equal((await refreshed).entries.length, 12);
    assert.equal(readLeaderboardLaneCache("rm", "claimed")?.trackedPlayers, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a forced refresh supersedes a pending same-window fetch, even when old response finishes last", async () => {
  const originalFetch = globalThis.fetch;
  const waiters: Array<(response: Response) => void> = [];
  globalThis.fetch = (() => new Promise<Response>((resolve) => waiters.push(resolve))) as typeof fetch;
  const answer = (resolve: (response: Response) => void, count: number) => resolve(
    new Response(JSON.stringify({
      lane: "dm", scope: "all", trackedPlayers: count,
      entries: Array.from({ length: count }, (_, rank) => ({rank:rank+1})),
    }), {status:200, headers:{"content-type":"application/json"}})
  );
  try {
    const old = loadLeaderboardLaneCached("dm", {scope:"all",limit:50,force:true});
    const latest = loadLeaderboardLaneCached("dm", {scope:"all",limit:50,force:true});
    assert.equal(waiters.length, 2, "force must bypass old in-flight response");
    answer(waiters[1], 12);
    assert.equal((await latest).trackedPlayers, 12);
    answer(waiters[0], 23);
    assert.equal((await old).trackedPlayers, 23);
    assert.equal(readLeaderboardLaneCache("dm","all")?.trackedPlayers, 12);
    // The most recent network truth wins against an unversioned SSR seed.
    const {seedLeaderboardLaneCache} = await import("../lib/leaderboardLaneClientCache.ts");
    seedLeaderboardLaneCache({
      lane: "dm", scope: "all", trackedPlayers: 50,
      entries: Array.from({length:50},(_,rank)=>({rank:rank+1})),
    } as never);
    assert.equal(readLeaderboardLaneCache("dm","all")?.trackedPlayers, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("leaderboard cache refuses impossible roster counts and oversized payloads", async () => {
  const originalFetch = globalThis.fetch;
  let response: Record<string,unknown> = {};
  globalThis.fetch = (async () => new Response(JSON.stringify(response),{
    status:200,headers:{"content-type":"application/json"},
  })) as typeof fetch;
  try {
    for (const invalid of [
      {lane:"rm",scope:"all",trackedPlayers:-1,entries:[]},
      {lane:"rm",scope:"all",trackedPlayers:"3",entries:[]},
      {lane:"rm",scope:"all",trackedPlayers:1,entries:[{rank:1},{rank:2}]},
      {lane:"rm",scope:"all",trackedPlayers:8,entries:Array.from({length:6},(_,i)=>({rank:i+1}))},
    ]) {
      response=invalid;
      await assert.rejects(
        loadLeaderboardLaneCached("rm",{scope:"all",limit:5,force:true}),
        /lane unavailable/
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
