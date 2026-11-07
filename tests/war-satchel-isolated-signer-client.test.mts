import assert from "node:assert/strict";
import test from "node:test";
import {makeSatchelLoopbackSigner, SATCHEL_SIDECAR_CONTRACT} from "../lib/warSatchelIsolatedSignerClient.ts";

const retired = /SATCHEL_SIGNER_INTERFACE_RETIRED:use_connectCertifiedSatchelSigner/;

test("obsolete sidecar contract cannot advertise an available signing port", () => {
  assert.equal(SATCHEL_SIDECAR_CONTRACT.available, false);
  assert.equal(SATCHEL_SIDECAR_CONTRACT.signingPort, null);
  assert.equal(SATCHEL_SIDECAR_CONTRACT.replacement, "connectCertifiedSatchelSigner");
  assert.ok(Object.isFrozen(SATCHEL_SIDECAR_CONTRACT));
});
test("legacy activation flags cannot construct a signer or make any request", async t => {
  for (const flag of ["WAR_SATCHEL_SIGNER_SIDECAR_READY", "WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED", "WAR_SATCHEL_LIVE_EXECUTOR_ENABLED"]) {
    const previous = process.env[flag];
    process.env[flag] = "true";
    t.after(() => { if (previous === undefined) delete process.env[flag]; else process.env[flag] = previous; });
  }
  let calls = 0;
  const reader = (async () => { calls++; return Response.json({ready: true, status: "broadcast_confirmed", txHash: "A".repeat(64)}); }) as typeof fetch;
  await assert.rejects(makeSatchelLoopbackSigner(reader), retired);
  assert.equal(calls, 0);
});
test("repeated legacy construction attempts remain unavailable without any send or retry", async () => {
  let calls = 0;
  const reader = (async () => { calls++; throw Error("must never contact a retired signer"); }) as typeof fetch;
  for (let n = 0; n < 4; n++) await assert.rejects(makeSatchelLoopbackSigner(reader), retired);
  assert.equal(calls, 0);
});
test("omitting the injected reader cannot fall back to a network request", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ready: true}); });
  await assert.rejects(makeSatchelLoopbackSigner(), retired);
  assert.equal(calls, 0);
});
