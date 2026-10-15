import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { claim889CanonicalMemo, classifyClaim889CanonicalCandidate } from "../scripts/wolo-claim889-canonical-match.mjs";

const HASH = "AB".repeat(32);
const sender = "wolo1" + "q".repeat(38);
const recipient = "wolo1" + "p".repeat(38);
const claim = {
  source_founder_bonus_id: 15,
  claim_kind: "founders_win",
  claim_group_key: "winner:left",
  amount_wolo: 240,
};
function response(memo = claim889CanonicalMemo(claim), amount = "240000000") {
  return { tx_response: {
    txhash: HASH, code: 0, height: "10000",
    tx: { body: { memo, messages: [{
      "@type": "/cosmos.bank.v1beta1.MsgSend",
      from_address: sender, to_address: recipient,
      amount: [{ amount, denom: "uwolo" }],
    }] } },
  } };
}

test("exact founder identity and canonical successful MsgSend remain only investigative candidates", () => {
  assert.equal(claim889CanonicalMemo(claim),
    "AoE2 Founder payout · bonus 15 · founders-win · winner-left");
  const actual = classifyClaim889CanonicalCandidate({
    claim, cachedTxHash: HASH.toLowerCase(), response: response(),
  });
  assert.equal(actual.status, "CANONICAL_POSSIBLE_PAYOUT_REQUIRES_RECIPIENT_AND_SIGNER_PROOF");
  assert.equal(actual.exactMemoMatched, true);
  assert.equal(actual.exactAmountMsgSendCount, 1);
  assert.equal(actual.actualRecipientBoundToClaim, false);
  assert.equal(actual.independentSenderRoleCertified, false);
  assert.equal(actual.fullyReconciledPayout, false);
});

test("memo mismatch, failed code, wrong amount and multiple identical sends cannot prove payout", () => {
  const cases = [
    response("not the founder payout", "240000000"),
    { ...response(), tx_response: { ...response().tx_response, code: 11 } },
    response(claim889CanonicalMemo(claim), "240000001"),
    { tx_response: { ...response().tx_response,
      tx: { body: { ...response().tx_response.tx.body,
        messages: [...response().tx_response.tx.body.messages,
                   ...response().tx_response.tx.body.messages] } } } },
  ];
  for (const candidate of cases) {
    assert.notEqual(classifyClaim889CanonicalCandidate({
      claim, cachedTxHash: HASH, response: candidate,
    }).status, "CANONICAL_POSSIBLE_PAYOUT_REQUIRES_RECIPIENT_AND_SIGNER_PROOF");
  }
  assert.throws(() => classifyClaim889CanonicalCandidate({
    claim, cachedTxHash: "not-a-tx", response: response(),
  }));
  assert.throws(() => classifyClaim889CanonicalCandidate({
    claim, cachedTxHash: HASH, response: {
      tx_response: { ...response().tx_response, txhash: "CD".repeat(32) },
    },
  }));
  assert.throws(() => claim889CanonicalMemo({ ...claim, source_founder_bonus_id: 16 }));
});

test("live script is read-only, chain-bound, bounded, and requires database authority", () => {
  const path = "scripts/wolo-claim889-canonical-candidates-readonly.mjs";
  const src = readFileSync(path, "utf8");
  assert.match(src, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(src, /default_transaction_read_only=on/);
  assert.match(src, /https:\/\/rpc-mainnet\.aoe2war\.com/);
  assert.match(src, /https:\/\/rest-mainnet\.aoe2war\.com/);
  assert.match(src, /MAX_CANDIDATES = 12/);
  assert.match(src, /MAX_BYTES = 512 \* 1024/);
  assert.match(src, /redirect: "error"/);
  assert.match(src, /node\?\.network !== "wolo-1"/);
  assert.match(src, /historicalTransferIndexComplete: false/);
  assert.match(src, /releaseAuthorized: false/);
  assert.match(src, /process.exitCode = 3/);
  assert.doesNotMatch(src, /\b(INSERT INTO|DELETE FROM|UPDATE pending_wolo_claims|ALTER TABLE|DROP TABLE|TRUNCATE)\b/i);
  assert.doesNotMatch(src, /sendTokens|signAndBroadcast|executeWoloPayout/);

  const env = { ...process.env };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, [path], { env, encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED: isolated read-only production database authority/);
  assert.equal(result.stdout, "");
});
