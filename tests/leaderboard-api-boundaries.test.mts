import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseLeaderboardPaginationInteger } from "../lib/leaderboardRequestParams.ts";

const route = readFileSync(new URL("../app/api/lobby/leaderboard/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/leaderboard/page.tsx", import.meta.url), "utf8");

test("leaderboard public pagination accepts only complete bounded decimal integers", () => {
  const read = (v: string|null) => parseLeaderboardPaginationInteger(v, 128, 1, 600);
  assert.equal(read("75"), 75);
  assert.equal(read("0"), 1);
  assert.equal(read("999"), 600);
  assert.equal(read(null), 128);
  for(const raw of ["25junk", "1e9", "1.3", "-1", "+1", "Infinity", "NaN", "9999999999999999", "", " 24 "]) {
    assert.equal(read(raw), 128, raw);
  }
});
test("leaderboard offset cannot exceed bounded safe work budget", () => {
  const offset = (v:string|null) => parseLeaderboardPaginationInteger(v, 0, 0, 100_000);
  assert.equal(offset("0"), 0);
  assert.equal(offset("120"), 120);
  assert.equal(offset("999999"), 100_000);
  assert.equal(offset("18446744073709551616"), 0);
  assert.equal(offset("100junk"), 0);
});
test("public leaderboard route cannot silently reintroduce partial parsing", () => {
  assert.doesNotMatch(route, /Number\.parseInt/);
  assert.match(route, /parseLeaderboardPaginationInteger/);
  assert.match(route, /100_000/);
});
test("local production preview respects saved RM or DM preference", () => {
  assert.match(page, /previewUrl\.searchParams\.set\(\s*"lane",\s*preferredLane/);
  assert.doesNotMatch(page, /previewUrl\.searchParams\.set\(\s*"lane",\s*"rm"/);
});

test("live leaderboard API disables intermediaries caching stale roster rankings",()=>{
  assert.match(route, /private, no-store, max-age=0/);
  assert.match(route, /dynamic = "force-dynamic"/);
});
