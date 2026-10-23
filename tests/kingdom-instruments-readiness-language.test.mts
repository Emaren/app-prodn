import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const component = readFileSync(new URL("components/kingdom-instruments/KingdomInstruments.tsx", root), "utf8");
const source = readFileSync(new URL("lib/generalInspections/serverSnapshot.ts", root), "utf8");
const canvas = component.slice(component.indexOf("function TestsCanvas("), component.indexOf("function RecoveryCanvas("));

test("shared Kingdom Tests canvas is present and truthful about score authority", () => {
  assert.ok(canvas.startsWith("function TestsCanvas("));
  assert.match(canvas, /OVERALL INSPECTION READINESS · SOURCE-REPORTED/);
  assert.doesNotMatch(canvas, /OVERALL VERIFIED SCORE|VERIFIED TEST SCORE|INDEPENDENTLY CERTIFIED/);
  assert.match(canvas, /not a certified engineering grade or test result/);
});
test("general inspections server computes category readiness aggregate, not executed test passes", () => {
  assert.match(source, /const overallScore = Math\.round\(categories\.reduce\(\(sum, item\) => sum \+ item\.score, 0\) \/ categories\.length\)/);
  assert.match(canvas, /fmt\(inspection\.overallScore\)/);
  assert.match(canvas, /Source-reported category readiness, not an independently verified test pass rate/);
});
test("declared inspection checks are not represented as completed tests", () => {
  assert.match(canvas, /DECLARED INSPECTION CHECKS/);
  assert.match(canvas, /arr\(c\.checks\)\.length/);
  assert.match(canvas, /cats\.reduce\(\(a,c\)=>a\+arr\(c\.checks\)\.length,0\)/);
  assert.doesNotMatch(canvas, /TESTS PASSED|VERIFIED CHECKS|EXECUTED TESTS/);
});
test("schema-only, missing and malformed category sets cannot promote overall readiness", () => {
  assert.match(canvas, /inspection\.schema===1&&Array\.isArray\(inspection\.categories\)/);
  assert.match(canvas, /valid\?fmt\(inspection\.overallScore\):"—"/);
  assert.match(canvas, /NO SOURCE-REPORTED INSPECTION CATEGORIES/);
});
test("source navigation distinguishes inspection source from authenticated proof", () => {
  assert.match(canvas, /href="\/general-inspections">VIEW SOURCE INSPECTIONS/);
  assert.doesNotMatch(canvas, /INSPECT PROOF/);
  assert.match(component, /RESPONDING READERS/);
  assert.match(component, /UNVERIFIED ≠ ZERO/);
});
