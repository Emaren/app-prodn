import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("app/AppShell.tsx", "utf8");

test("General Inspections sits immediately above Speed and Speed closes the Kingdom menu", () => {
  const inspections = shell.indexOf('{ href: "/general-inspections", label: "General Inspections"');
  const speed = shell.indexOf('{ href: "/speed", label: "Speed"');
  const close = shell.indexOf("] as const;", speed);

  assert.ok(inspections >= 0);
  assert.ok(speed > inspections);
  assert.ok(close > speed);
  const nextHref = shell.indexOf('{ href:', speed + 1);
  assert.equal(shell.slice(inspections, speed).includes('href: "/speed"'), false);
  assert.ok(nextHref < 0 || nextHref >= close);
});
