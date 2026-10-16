import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractCanonicalWoloMsgSends } from "../lib/woloCanonicalBankSends.ts";

const denom = "uwolo";
const sender = "wolo1" + "a".repeat(38);
const receiver = "wolo1" + "b".repeat(38);
const send = (amount: unknown = [{ denom, amount: "3000000" }]) => ({
  "@type": "/cosmos.bank.v1beta1.MsgSend",
  from_address: sender, to_address: receiver, amount,
});
const payload = (messages: unknown[], responseMessages?: unknown[]) => ({
  tx: { body: { messages } },
  ...(responseMessages ? { tx_response: { tx: { body: { messages: responseMessages } } } } : {}),
});

test("canonical bank proof preserves original top-level message index, including non-bank instructions", () => {
  const result = extractCanonicalWoloMsgSends(payload([
    { "@type": "/cosmos.staking.v1beta1.MsgDelegate" }, send(),
  ]), denom);
  assert.deepEqual(result, [{
    index: 1, fromAddress: sender, toAddress: receiver,
    amountUwolo: "3000000", denom,
  }]);
});
test("cannot skip malformed earlier message and silently shift payout MsgSend ordinal", () => {
  assert.equal(extractCanonicalWoloMsgSends(payload([null, send()]), denom), null);
  assert.equal(extractCanonicalWoloMsgSends(payload(["garbage", send()]), denom), null);
  assert.equal(extractCanonicalWoloMsgSends({ tx: { body: { messages: {} } } }, denom), null);
});
test("duplicate WOLO coin entries and ambiguous bank amount arrays fail closed", () => {
  assert.equal(extractCanonicalWoloMsgSends(payload([send([
    { denom, amount: "3000000" }, { denom, amount: "5000000" },
  ])]), denom), null);
  for (const amount of ["0", "-1", "01", "1.5", "NaN", "", "9".repeat(31)]) {
    assert.equal(extractCanonicalWoloMsgSends(payload([send([{ denom, amount }])]), denom), null);
  }
  assert.equal(extractCanonicalWoloMsgSends(payload([send([{ denom, amount: "3000000" }, null])]), denom), null);
});
test("legitimate multi-denom bank send has precisely one WOLO amount", () => {
  const result = extractCanonicalWoloMsgSends(payload([send([
    { denom: "uatom", amount: "2" }, { denom, amount: "3000000" },
  ])]), denom);
  assert.equal(result?.[0]?.amountUwolo, "3000000");
  assert.equal(result?.[0]?.index, 0);
});
test("mutually inconsistent root and nested transaction messages cannot become proof", () => {
  assert.equal(extractCanonicalWoloMsgSends(payload([send()], [
    send([{ denom, amount: "4000000" }]),
  ]), denom), null);
  assert.equal(extractCanonicalWoloMsgSends(payload([send()], [
    { "@type": "/cosmos.staking.v1beta1.MsgDelegate" }, send(),
  ]), denom), null);
  assert.deepEqual(extractCanonicalWoloMsgSends(payload([send()], [send()]), denom),
    [{ index: 0, fromAddress: sender, toAddress: receiver, amountUwolo: "3000000", denom }]);
});
test("supplied malformed duplicate REST view cannot be ignored in favor of a valid one", () => {
  const validRoot = payload([send()]);
  assert.equal(extractCanonicalWoloMsgSends({
    ...validRoot, tx_response: { tx: "not a transaction" },
  }, denom), null);
  assert.equal(extractCanonicalWoloMsgSends({
    ...validRoot, tx_response: { tx: [] },
  }, denom), null);
  assert.equal(extractCanonicalWoloMsgSends({
    tx: "not a transaction", tx_response: { tx: validRoot.tx },
  }, denom), null);
  assert.equal(extractCanonicalWoloMsgSends({
    ...validRoot, tx_response: { tx: null },
  }, denom)?.[0]?.amountUwolo, "3000000",
    "Cosmos null optional TxResponse.tx is absent, not conflicting evidence");
});

test("valid non-WOLO transaction is no payout, malformed tx is untrusted", () => {
  assert.deepEqual(extractCanonicalWoloMsgSends(payload([
    { "@type": "/cosmos.staking.v1beta1.MsgDelegate" },
  ]), denom), []);
  assert.equal(extractCanonicalWoloMsgSends({ tx: { body: {} } }, denom), null);
});
test("financial payout guard must use strict helper for all bank transfer evidence", () => {
  const source = readFileSync(new URL("../lib/woloClaimPayoutGuards.ts", import.meta.url), "utf8");
  assert.match(source, /extractCanonicalWoloMsgSends\(payload, WOLO_BASE_DENOM\)/);
  assert.match(source, /success: decoded/);
  assert.match(source, /sends: parsedSends \?\? \[\]/);
  assert.doesNotMatch(source, /asRecordArray\(message.amount\)\.find/);
});
