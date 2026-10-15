import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { PrismaClient } from "../lib/generated/prisma/index.js";
import { recordUncreditedWarSatchelReceipt } from "../lib/warSatchelUncreditedProofRecorder.ts";

const ownerUid = "warrior:alpha", id = "11111111-1111-4111-8111-111111111111";
const wallet = "wolo1" + "q".repeat(38), vault = "wolo1" + "p".repeat(38);
const hash = "AB".repeat(32), time = "2026-10-15T04:00:00.000Z";
const memo = "aoe2war/satchel/v1/" + ownerUid + "/" + "n".repeat(32);
const storedIntent = {
  id, chainId: "wolo-1", senderAddress: wallet, vaultAddress: vault,
  amountUwolo: "100000000", memo, status: "prepared",
  createdAtUtc: time, expiresAtUtc: "2026-10-15T04:30:00.000Z",
};
const canonicalProof = {
  kind: "canonical_chain_candidate_uncredited" as const,
  receiptKey: "wolo-1:" + hash + ":0",
  txHash: hash, height: "296", confirmations: "5",
  intentId: id, ownerUid, canonicalSendCount: 1 as const,
  chainId: "wolo-1" as const, denom: "uwolo" as const,
  creditAuthorized: false as const,
  depositAuthorized: false as const,
  wagerAuthorized: false as const,
};

function fakeDatabase() {
  let existing: null | Record<string, unknown> = null;
  let writes = 0;
  let txs = 0;
  let isolation = "";
  const tx = {
    async $queryRaw(parts: TemplateStringsArray) {
      if (parts.join("").includes("FROM users")) {
        return [{ uid: ownerUid, wallet_address: wallet }];
      }
      return [{ id, user_id: 5, chain_id: "wolo-1",
        sender_address: wallet, vault_address: vault, amount_uwolo: BigInt(100000000),
        memo, status: "prepared", created_at: new Date(time),
        expires_at: new Date("2026-10-15T04:30:00.000Z") }];
    },
    warSatchelProofCandidate: {
      async findUnique() { return existing; },
      async create({ data }: { data: Record<string, unknown> }) {
        writes++;
        existing = { userId: data.userId, txHash: data.txHash,
          chainId: data.chainId, transferIndex: data.transferIndex,
          senderAddress: data.senderAddress, vaultAddress: data.vaultAddress,
          amountUwolo: data.amountUwolo, txHeight: data.txHeight,
          status: data.status };
        return { id: BigInt(1) };
      },
    },
  };
  const db = {
    async $transaction<T>(fn: (inner: typeof tx) => Promise<T>,
      opt: { isolationLevel: string }) {
      txs++;
      isolation = opt.isolationLevel;
      return fn(tx);
    },
  } as unknown as PrismaClient;
  return { db, stats: () => ({ writes, txs, isolation }), setExisting: (v: Record<string, unknown>) => { existing = v; } };
}
function original() {
  return { ownerUserId: 5, ownerUid, ownerWallet: wallet,
    storedIntent, canonicalProof };
}

test("default-off proof persistence cannot write the bank or DB", async () => {
  const old = process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED;
  delete process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED;
  const f = fakeDatabase();
  try {
    await assert.rejects(() => recordUncreditedWarSatchelReceipt(f.db, original()),
      /SATCHEL_PROOF_RECORDING_DISABLED/);
    assert.equal(f.stats().writes, 0);
    assert.equal(f.stats().txs, 0);
  } finally {
    if (old === undefined) delete process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED;
    else process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED = old;
  }
});

test("new exact proof writes one immutable uncredited row, second identical retry is idempotent", async () => {
  const old = process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED;
  process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED = "true";
  const f = fakeDatabase();
  try {
    const first = await recordUncreditedWarSatchelReceipt(f.db, original());
    assert.equal(first.state, "DURABLY_RECORDED_UNCREDITED_PROOF");
    assert.equal(first.creditAuthorized, false);
    assert.equal(first.wagerAuthorized, false);
    assert.equal(f.stats().writes, 1);
    assert.equal(f.stats().isolation, "Serializable");
    const second = await recordUncreditedWarSatchelReceipt(f.db, original());
    assert.equal(second.state, "UNCHANGED_UNCREDITED_PROOF");
    assert.equal(f.stats().writes, 1);
    f.setExisting({ userId: 5, chainId: "wolo-1", txHash: "CD".repeat(32),
      transferIndex: 0, senderAddress: wallet, vaultAddress: vault,
      amountUwolo: BigInt(100000000), txHeight: BigInt(296), status: "uncredited" });
    await assert.rejects(() => recordUncreditedWarSatchelReceipt(f.db, original()),
      /SATCHEL_EXISTING_RECEIPT_CONFLICT/);
    assert.equal(f.stats().writes, 1);
  } finally {
    if (old === undefined) delete process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED;
    else process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED = old;
  }
});

test("forged proof identity and owner are refused before any DB transaction", async () => {
  const old = process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED;
  process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED = "true";
  const f = fakeDatabase();
  try {
    for (const mutation of [
      { ownerUid: "another" },
      { ownerWallet: vault },
      { canonicalProof: { ...canonicalProof, confirmations: "1" } },
      { canonicalProof: { ...canonicalProof, creditAuthorized: true } },
      { canonicalProof: { ...canonicalProof, receiptKey: "forged" } },
      { canonicalProof: { ...canonicalProof, txHash: "notahash" } },
    ]) {
      await assert.rejects(() => recordUncreditedWarSatchelReceipt(f.db,
        { ...original(), ...mutation } as Parameters<typeof recordUncreditedWarSatchelReceipt>[1]),
        /SATCHEL_PROOF_IDENTITY_MISMATCH/);
    }
    assert.equal(f.stats().writes, 0);
  } finally {
    if (old === undefined) delete process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED;
    else process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED = old;
  }
});

test("SQL unique receipt, immutable identity, simulation-only money accounting remain authoritative", () => {
  const sql = readFileSync("prisma/migrations/20261014_103500_war_satchel_noncrediting_foundation/migration.sql", "utf8");
  const ledger = readFileSync("prisma/migrations/20261014_150000_war_satchel_simulated_double_entry/migration.sql", "utf8");
  const route = readFileSync("app/api/user/war-satchel/deposit-evidence/route.ts", "utf8");
  const writer = readFileSync("lib/warSatchelUncreditedProofRecorder.ts", "utf8");
  assert.match(sql, /uq_war_satchel_proofs_chain_tx_ordinal/);
  assert.match(sql, /uq_war_satchel_proofs_intent/);
  assert.match(sql, /war_satchel_proofs_immutable/);
  assert.match(sql, /CHECK \("status" = 'uncredited'\)/);
  assert.match(writer, /FOR UPDATE/);
  assert.match(writer, /isolationLevel: "Serializable"/);
  assert.match(writer, /status: "uncredited", verifiedAt: new Date\(\)/);
  assert.match(route, /WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED === "true"/);
  assert.match(ledger, /simulation/);
  assert.doesNotMatch(writer, /BetStakeTicket|executeWolo|bank\.send|sendTokens|signAndBroadcast/);
  assert.doesNotMatch(route, /transferMemo|signAndBroadcast|sendTokens/);
});
