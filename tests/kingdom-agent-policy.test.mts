import test from "node:test";
import assert from "node:assert/strict";
import { inspectionAgentState, systemAgentState } from "../lib/kingdomAgentPolicy.ts";

test("inspection watchposts cannot claim green on partial earned points", () => {
  assert.equal(inspectionAgentState("green", 1), "healthy");
  assert.equal(inspectionAgentState("green", 0.95), "watch");
  assert.equal(inspectionAgentState("green", Number.NaN), "watch");
  assert.equal(inspectionAgentState("amber", 1), "watch");
  assert.equal(inspectionAgentState("red", 0), "blocked");
});

test("OS working requires actual active-process evidence", () => {
  assert.equal(systemAgentState("RUNNING", true), "working");
  assert.equal(systemAgentState("RUNNING", false), "watch");
  assert.equal(systemAgentState("ACTIVE", false), "watch");
  assert.equal(systemAgentState("HEALTHY", false), "healthy");
});

test("blocked and unknown never turn healthy from a timestamp", () => {
  assert.equal(systemAgentState("BLOCKED", true), "blocked");
  assert.equal(systemAgentState("FAILED", false), "blocked");
  assert.equal(systemAgentState("UNKNOWN", false), "unknown");
  assert.equal(systemAgentState("", false), "unknown");
});
