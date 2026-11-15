import test from "node:test";
import assert from "node:assert/strict";
import {
  GITHUB_POSITIVE_CACHE_MS, GITHUB_ERROR_CACHE_MS, readBoundedGithubPublic,
} from "../lib/githubBoundedPublicRead.ts";

const branch = "branches/" + encodeURIComponent("session-c/we3-website-observatory-20261115");
const agent = "aoe2war-private-work-environments";
const json = (payload: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(payload), { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });

test("no arbitrary GitHub path, credential endpoint or user-provided URL can be requested", async () => {
  const oldFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async () => { requests++; throw new Error("must not run"); };
    for (const path of ["repos/Emaren/app-prodn", "pulls/1365", "branches/main", "pulls/../../users", "https://example.com"]) {
      assert.equal(await readBoundedGithubPublic(path, 40_000, agent), null);
    }
    assert.equal(requests, 0);
  } finally { globalThis.fetch = oldFetch; }
});

test("verified branch read is cached with original timestamp and no duplicate API calls", async () => {
  const oldFetch = globalThis.fetch;
  const token = process.env.GITHUB_TOKEN;
  let requests = 0;
  try {
    delete process.env.GITHUB_TOKEN;
    globalThis.fetch = async (_url, init) => {
      requests++;
      assert.equal(new Headers(init?.headers).get("Authorization"), null);
      return json({ name: "session-c/we3-website-observatory-20261115", commit: { sha: "a".repeat(40) } });
    };
    const first = await readBoundedGithubPublic(branch, 40_000, agent);
    const second = await readBoundedGithubPublic(branch, 40_000, agent);
    assert.deepEqual(first, second);
    assert.equal(requests, 1);
    assert.ok(first?.observedAt.endsWith("Z"));
    assert.equal(GITHUB_POSITIVE_CACHE_MS, 300_000);
    assert.equal(GITHUB_ERROR_CACHE_MS, 10_000);
  } finally {
    globalThis.fetch = oldFetch;
    if (token === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = token;
  }
});

test("identical in-flight branch reads coalesce to one pending HTTPS call", async () => {
  const oldFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async () => {
      requests++;
      return json({ sha: "b".repeat(40) });
    };
    const [a,b,c] = await Promise.all([
      readBoundedGithubPublic(branch, 40_000, agent),
      readBoundedGithubPublic(branch, 40_000, agent),
      readBoundedGithubPublic(branch, 40_000, agent),
    ]);
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test("declared and streamed oversize, malformed JSON, non-JSON MIME and invalid UTF-8 fail closed", async () => {
  const oldFetch = globalThis.fetch;
  const cases: Response[] = [
    json({}, { headers: { "Content-Type": "application/json", "Content-Length": "40001" } }),
    new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(40001));
        controller.close();
      },
    }), { headers: { "Content-Type": "application/json" } }),
    new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(40001));
        controller.close();
      },
    }), { headers: { "Content-Type": "application/json", "Content-Length": "2" } }),
    new Response("{bad-json", { headers: { "Content-Type": "application/json" } }),
    new Response("{}", { headers: { "Content-Type": "text/html" } }),
    new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "application/json" } }),
  ];
  try {
    for (const item of cases) {
      globalThis.fetch = async () => item;
      assert.equal(await readBoundedGithubPublic(branch, 40_000, agent), null);
    }
  } finally { globalThis.fetch = oldFetch; }
});

test("HTTP 429 errors are backpressured, then remain UNKNOWN instead of a cached PASS", async () => {
  const oldFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async () => { requests++; return new Response("rate limit", { status: 429 }); };
    assert.equal(await readBoundedGithubPublic(branch, 40_000, agent), null);
    assert.equal(await readBoundedGithubPublic(branch, 40_000, agent), null);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test("PR and branch endpoints are separately bounded; observation time is not request time", async () => {
  const oldFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async (url) => {
      requests++;
      if (String(url).endsWith("/pulls/1362")) return json({ number: 1362, head: { sha: "a".repeat(40) } });
      return json({ name: "WE3" });
    };
    const [pr, ref] = await Promise.all([
      readBoundedGithubPublic("pulls/1362", 250_000, "aoe2war-private-website-review-observer"),
      readBoundedGithubPublic(branch, 40_000, agent),
    ]);
    assert.equal((pr?.data as {number:number}).number,1362);
    assert.ok(ref?.observedAt);
    assert.equal(requests, 2);
  } finally { globalThis.fetch = oldFetch; }
});
