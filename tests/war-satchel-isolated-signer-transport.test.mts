import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocalSatchelSignerHealth, createLocalIsolatedSatchelSigner,
  type LocalSatchelSignerConfig,
} from "../lib/warSatchelIsolatedSignerTransport.ts";

const retired = /SATCHEL_SIGNER_INTERFACE_RETIRED:use_connectCertifiedSatchelSigner/;
const config: LocalSatchelSignerConfig = {
  approvedByOperator: true, vaultAddress: "wolo1" + "q".repeat(38),
  escrowAddress: "wolo1" + "p".repeat(38), keyFingerprint: "a".repeat(64),
  serviceAccessToken: "a".repeat(55),
};
test("legacy camel-case transport cannot construct a signer from an approved configuration", () => {
  let calls = 0;
  const reader = (async () => { calls++; return Response.json({accepting: true}); }) as typeof fetch;
  assert.throws(() => createLocalIsolatedSatchelSigner(config, reader), retired);
  assert.equal(calls, 0);
});
test("legacy health cannot authenticate a self-reported custody identity", async () => {
  let calls = 0;
  const reader = (async () => { calls++; return Response.json({protocol: 1, chainId: "wolo-1", accepting: true, ...config}); }) as typeof fetch;
  await assert.rejects(assertLocalSatchelSignerHealth(config, reader), retired);
  assert.equal(calls, 0);
});
test("retirement happens before reading caller-controlled configuration or credentials", async () => {
  const hostile = new Proxy(config, {get() { throw Error("retired configuration must not be read"); }});
  assert.throws(() => createLocalIsolatedSatchelSigner(hostile), retired);
  await assert.rejects(assertLocalSatchelSignerHealth(hostile), retired);
});
test("neither valid nor malformed legacy configuration can select a submission path", async () => {
  let calls = 0;
  const reader = (async () => { calls++; throw Error("retired reader invoked"); }) as typeof fetch;
  for (const value of [config, {...config, approvedByOperator: false}, {...config, serviceAccessToken: ""}, {...config, vaultAddress: config.escrowAddress}]) {
    assert.throws(() => createLocalIsolatedSatchelSigner(value, reader), retired);
    await assert.rejects(assertLocalSatchelSignerHealth(value, reader), retired);
  }
  assert.equal(calls, 0);
});
test("default transport reader cannot issue health or financial requests", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({accepting: true}); });
  assert.throws(() => createLocalIsolatedSatchelSigner(config), retired);
  await assert.rejects(assertLocalSatchelSignerHealth(config), retired);
  assert.equal(calls, 0);
});
