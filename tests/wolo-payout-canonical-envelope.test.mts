import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inspectWoloPayoutTxEnvelope } from "../lib/woloCanonicalPayoutEnvelope.ts";

const requested = "AB".repeat(32);
const envelope = (overrides: Record<string, unknown> = {}) => ({
  tx: { body: { messages: [{ "@type": "/cosmos.bank.v1beta1.MsgSend" }] } },
  tx_response: { txhash: requested, height: "1250", code: 0, ...overrides },
});

test("real Cosmos omitted-success-code wire shape is valid only with canonical identity and committed height", () => {
  const response = envelope();
  delete (response.tx_response as { code?: number }).code;
  assert.deepEqual(inspectWoloPayoutTxEnvelope(response, requested.toLowerCase()),
    { ok: true, executionCode: 0, committedHeight: "1250" });
  assert.deepEqual(inspectWoloPayoutTxEnvelope(envelope({ code: "0" }), requested),
    { ok: true, executionCode: 0, committedHeight: "1250" });
  assert.deepEqual(inspectWoloPayoutTxEnvelope(envelope({ code: 0, height: 1250 }), requested),
    { ok: true, executionCode: 0, committedHeight: "1250" });
});

test("mismatched, malformed or missing hashes never prove a payout", () => {
  for (const raw of [null, undefined, "0".repeat(64), "0", "", "ab".repeat(31)]) {
    assert.deepEqual(inspectWoloPayoutTxEnvelope(envelope({ txhash: raw }), requested),
      { ok: false, reason: "TX_HASH_NOT_BOUND" });
  }
  assert.equal(inspectWoloPayoutTxEnvelope(envelope(), "0".repeat(64)).ok, false);
  assert.equal(inspectWoloPayoutTxEnvelope(envelope(), "short").ok, false);
});

test("no committed height, no verified payment", () => {
  for (const height of [undefined, null, "", "0", 0, -1, "1x", "2.5", "1000000000000000000000"]) {
    assert.deepEqual(inspectWoloPayoutTxEnvelope(envelope({ height }), requested),
      { ok: false, reason: "TX_NOT_COMMITTED" });
  }
});

test("malformed code, numeric prefix parsing and unknown execution must fail closed", () => {
  for (const code of [null, "", "0garbage", "0.0", "-0", -1, NaN, 0.1, Infinity, true, "4294967296", {}, []]) {
    assert.deepEqual(inspectWoloPayoutTxEnvelope(envelope({ code }), requested),
      { ok: false, reason: "TX_CODE_INVALID" });
  }
  for (const code of [1, 5, "11"]) {
    assert.deepEqual(inspectWoloPayoutTxEnvelope(envelope({ code }), requested),
      { ok: false, reason: "TX_EXECUTION_FAILED" });
  }
});

test("status-only receipts and fake bodies never promote a confirmed payout", () => {
  assert.deepEqual(inspectWoloPayoutTxEnvelope({ tx_response: envelope().tx_response }, requested),
    { ok: false, reason: "TX_BODY_MISSING" });
  assert.deepEqual(inspectWoloPayoutTxEnvelope({ tx: { messages: [] }, tx_response: envelope().tx_response }, requested),
    { ok: false, reason: "TX_BODY_MISSING" });
  assert.deepEqual(inspectWoloPayoutTxEnvelope({ tx: envelope().tx }, requested),
    { ok: false, reason: "TX_ENVELOPE_MISSING" });
});

test("two decoded Cosmos transaction locations must agree on ALL payout-relevant fields", () => {
  const canonical = envelope();
  const body = canonical.tx.body;
  const matching = {
    ...canonical,
    tx_response: { ...canonical.tx_response, tx: { body: { ...body, messages: body.messages.map(m => ({ ...m })) } } },
  };
  assert.deepEqual(inspectWoloPayoutTxEnvelope(matching, requested),
    { ok: true, executionCode: 0, committedHeight: "1250" });

  const contradictory = {
    ...matching,
    tx_response: {
      ...matching.tx_response,
      tx: { body: { messages: [{ "@type": "/cosmos.bank.v1beta1.MsgSend", "to_address": "foreign" }] } },
    },
  };
  assert.deepEqual(inspectWoloPayoutTxEnvelope(contradictory, requested),
    { ok: false, reason: "TX_BODY_CONFLICT" });

  const noMessages = {
    ...matching,
    tx_response: { ...matching.tx_response, tx: { body: { messages: [] } } },
  };
  assert.deepEqual(inspectWoloPayoutTxEnvelope(noMessages, requested),
    { ok: false, reason: "TX_BODY_CONFLICT" });
  assert.deepEqual(inspectWoloPayoutTxEnvelope({
    ...matching, tx_response: { ...matching.tx_response, tx: { body: null } },
  }, requested), { ok: false, reason: "TX_BODY_MISSING" });
});

test("single root or single TxResponse location is accepted, not invented as conflict", () => {
  const rootOnly = envelope();
  assert.equal(inspectWoloPayoutTxEnvelope(rootOnly, requested).ok, true);
  const txResponseOnly = {
    tx_response: { ...rootOnly.tx_response, tx: { body: rootOnly.tx.body } },
  };
  assert.equal(inspectWoloPayoutTxEnvelope(txResponseOnly, requested).ok, true);
});

test("payout guard must enforce canonical response and strict byte/time budgets", () => {
  const source = readFileSync(new URL("../lib/woloClaimPayoutGuards.ts", import.meta.url), "utf8");
  assert.match(source, /inspectWoloPayoutTxEnvelope\(payload, normalizedHash\)/);
  assert.match(source, /readWarSatchelBoundedUtf8\(response\.body, maxBytes\)/);
  assert.match(source, /maxBytes = 750_000/);
  assert.match(source, /AbortSignal\.timeout\(6500\)/);
  assert.match(source, /redirect: "error"/);
  assert.match(source, /!response\.ok \|\| response\.status !== 200/);
  assert.match(source, /sends: envelope\.ok \? extractMsgSends\(payload\) : \[\]/);
  assert.doesNotMatch(source, /Number\.parseInt\(rawCode/);
  assert.doesNotMatch(source, /await response\.json\(/);
});
