import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WEBSITE_REVIEW_TARGETS, readWebsiteReviews, parseWebsiteReview,
} from "../lib/websiteReviewEvidence.ts";

const FULL_SHA = "a".repeat(40);
const base = {
  number: 1362,
  state: "open",
  draft: true,
  merged_at: null,
  head: { sha: FULL_SHA },
  base: { ref: "main" },
  updated_at: "2026-11-15T02:38:55Z",
};
const observedAt = "2026-11-15T02:45:00.000Z";
const parse = (body: unknown) => parseWebsiteReview(body, 1362, "WE3 Admin Observatory", "Private admin", observedAt);

test("exact allowlist has only three public PRODUCT review candidates", () => {
  assert.deepEqual(WEBSITE_REVIEW_TARGETS.map(item => item.number), [1362, 1363, 1364]);
  assert.ok(WEBSITE_REVIEW_TARGETS.every(item => item.purpose.length > 5));
});

test("public GitHub proof distinguishes draft, open-review, merged, closed without claiming CI", () => {
  const draft = parse(base);
  assert.equal(draft.state, "OPEN_DRAFT");
  assert.equal(draft.headSha, FULL_SHA);
  assert.equal(draft.observedAt, observedAt);
  assert.equal(draft.url, "https://github.com/Emaren/app-prodn/pull/1362");
  assert.equal(parse({ ...base, draft: false }).state, "OPEN_REVIEW");
  assert.equal(parse({ ...base, state: "closed", draft: false, merged_at: "2026-11-15T02:42:11Z" }).state, "MERGED");
  assert.equal(parse({ ...base, state: "closed", draft: false }).state, "CLOSED_UNMERGED");
});

test("untrusted/mismatched API data always fails closed without trusting its title or URL", () => {
  const invalid = [
    null, [], {}, "malformed", { ...base, number: 111 },
    { ...base, head: { sha: "deadbeef" } },
    { ...base, head: null }, { ...base, base: null },
    { ...base, base: { ref: "financial-main" } },
    { ...base, state: "queued" }, { ...base, draft: "false" },
    { ...base, merged_at: "yesterday" },
    { ...base, updated_at: "2026-15-15T02:38:55Z" },
  ];
  for (const row of invalid) {
    const value = parse(row);
    assert.equal(value.state, "UNKNOWN");
    assert.equal(value.headSha, null);
    assert.equal(value.observedAt, null);
  }
  const malicious = parse({ ...base, html_url: "https://evil.example/pr", title: "ALL CI GREEN - DEPLOY" });
  assert.equal(malicious.url, "https://github.com/Emaren/app-prodn/pull/1362");
  assert.equal(malicious.label, "WE3 Admin Observatory");
});

test("no-token read observes exact public PRs without inventing GitHub check-run status", async () => {
  const old = globalThis.fetch;
  const token = process.env.GITHUB_TOKEN;
  const seen: Array<{ url: string; authorization: string | null }> = [];
  try {
    delete process.env.GITHUB_TOKEN;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      const match = /\/pulls\/(1362|1363|1364)$/.exec(target);
      assert.ok(match, "only fixed /pulls/<number> may be called");
      const number = Number(match[1]);
      seen.push({ url: target, authorization: new Headers(init?.headers).get("Authorization") });
      return new Response(JSON.stringify({ ...base, number, state: "open", draft: true, head: { sha: FULL_SHA } }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const results = await readWebsiteReviews();
    assert.equal(results.length, 3);
    assert.deepEqual(results.map(r => r.number), [1362, 1363, 1364]);
    assert.ok(results.every(r => r.state === "OPEN_DRAFT" && r.headSha === FULL_SHA));
    assert.equal(seen.length, 3);
    assert.ok(seen.every(s => s.authorization === null));
  } finally {
    globalThis.fetch = old;
    if (token === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = token;
  }
});

test("rate limit, 404 and malformed responses remain UNKNOWN", async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("Rate limited", { status: 429 });
    const failure = await readWebsiteReviews();
    assert.ok(failure.every(r => r.state === "UNKNOWN" && r.headSha === null));
    globalThis.fetch = async () => new Response("Not found", { status: 404 });
    assert.ok((await readWebsiteReviews()).every(r => r.state === "UNKNOWN"));
    globalThis.fetch = async () => new Response("{bad json", { status: 200 });
    assert.ok((await readWebsiteReviews()).every(r => r.state === "UNKNOWN"));
  } finally {
    globalThis.fetch = old;
  }
});

test("board is read-only, source-scoped, admin-routed and not a release permit", () => {
  const board = readFileSync("components/admin/work-environments/WebsiteReviewBoard.tsx", "utf8");
  const observer = readFileSync("components/admin/work-environments/WorkEnvironmentObservatory.tsx", "utf8");
  const route = readFileSync("app/admin/central-command/lanes/page.tsx", "utf8");
  assert.match(observer, /<WebsiteReviewBoard \/>/);
  assert.match(route, /await requireServerAdmin\(\)/);
  assert.match(board, /Current public GitHub pull-request metadata/);
  assert.match(board, /a merged PR is source history|A merged PR is source history/);
  assert.match(board, /UNKNOWN/);
  assert.match(board, /current check-run details/);
  assert.doesNotMatch(board, /\bfetch\s*\(|\bWebSocket\s*\(|\bprocess\.env\b|child_process|\bexecSync\s*\(/);
});
