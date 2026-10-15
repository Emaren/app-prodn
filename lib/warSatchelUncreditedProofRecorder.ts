/**
 * C3d — persist a canonical mainnet deposit proof as immutable UNCredited
 * evidence only. No ledger posting, spendable balance, transfer or wager.
 * Only call after inspectCanonicalSatchelDeposit authenticated full chain
 * bytes against the exact owner and database intent. Inputs are server-only.
 */
import type { PrismaClient } from "@/lib/generated/prisma";
import type { SatchelImmutableIntent, inspectCanonicalSatchelDeposit } from "./warSatchelCanonicalReceipt";

type CanonicalProof = ReturnType<typeof inspectCanonicalSatchelDeposit>;
const HASH = /^[A-F0-9]{64}$/;

export async function recordUncreditedWarSatchelReceipt(
  prisma: PrismaClient,
  input: {
    ownerUserId: number;
    ownerUid: string;
    ownerWallet: string;
    storedIntent: SatchelImmutableIntent;
    canonicalProof: CanonicalProof;
  },
) {
  if (process.env.WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED !== "true") {
    throw new Error("SATCHEL_PROOF_RECORDING_DISABLED");
  }
  const { ownerUserId, ownerUid, ownerWallet, storedIntent: intent, canonicalProof: proof } = input;
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0 ||
      !proof || proof.kind !== "canonical_chain_candidate_uncredited" ||
      proof.creditAuthorized !== false || proof.wagerAuthorized !== false ||
      proof.depositAuthorized !== false || proof.ownerUid !== ownerUid ||
      proof.intentId !== intent.id || proof.chainId !== "wolo-1" ||
      proof.denom !== "uwolo" || proof.canonicalSendCount !== 1 ||
      !HASH.test(proof.txHash) ||
      proof.receiptKey !== "wolo-1:" + proof.txHash + ":0" ||
      !/^[1-9][0-9]*$/.test(proof.height) ||
      !/^[1-9][0-9]*$/.test(proof.confirmations) ||
      BigInt(proof.confirmations) < BigInt(3) ||
      intent.status !== "prepared" || intent.chainId !== "wolo-1" ||
      intent.senderAddress !== ownerWallet ||
      !/^[1-9][0-9]{0,18}$/.test(intent.amountUwolo)) {
    throw new Error("SATCHEL_PROOF_IDENTITY_MISMATCH");
  }

  // Serializable per-owner lock + immutable intent row lock. SQL unique keys
  // (intent, chain-hash-transferOrdinal) provide global at-most-once even
  // across other users, restarts, or concurrently racing workers.
  return prisma.$transaction(async tx => {
    const owner = await tx.$queryRaw<Array<{ uid: string; wallet_address: string | null }>>`
      SELECT uid, wallet_address FROM users WHERE id = ${ownerUserId} FOR UPDATE
    `;
    if (owner.length !== 1 || owner[0].uid !== ownerUid ||
        owner[0].wallet_address !== ownerWallet) {
      throw new Error("SATCHEL_OWNER_CHANGED");
    }
    const locked = await tx.$queryRaw<Array<{
      id: string; user_id: number; chain_id: string; sender_address: string;
      vault_address: string; amount_uwolo: bigint; memo: string; status: string;
      created_at: Date; expires_at: Date;
    }>>`
      SELECT id, user_id, chain_id, sender_address, vault_address,
        amount_uwolo, memo, status, created_at, expires_at
      FROM war_satchel_deposit_intents
      WHERE id = ${intent.id}::uuid AND user_id = ${ownerUserId}
      FOR UPDATE
    `;
    const row = locked[0];
    if (locked.length !== 1 || row.status !== "prepared" ||
        row.chain_id !== "wolo-1" || row.sender_address !== ownerWallet ||
        row.vault_address !== intent.vaultAddress ||
        row.amount_uwolo.toString() !== intent.amountUwolo ||
        row.memo !== intent.memo ||
        row.created_at.toISOString() !== intent.createdAtUtc ||
        row.expires_at.toISOString() !== intent.expiresAtUtc) {
      throw new Error("SATCHEL_PREPARED_ECONOMICS_DRIFT");
    }

    const existing = await tx.warSatchelProofCandidate.findUnique({
      where: { intentId: intent.id },
      select: {
        userId: true, txHash: true, chainId: true, transferIndex: true,
        senderAddress: true, vaultAddress: true, amountUwolo: true,
        txHeight: true, status: true,
      },
    });
    if (existing) {
      if (existing.userId !== ownerUserId || existing.chainId !== "wolo-1" ||
          existing.txHash !== proof.txHash || existing.transferIndex !== 0 ||
          existing.senderAddress !== ownerWallet ||
          existing.vaultAddress !== intent.vaultAddress ||
          existing.amountUwolo.toString() !== intent.amountUwolo ||
          existing.txHeight.toString() !== proof.height ||
          existing.status !== "uncredited") {
        throw new Error("SATCHEL_EXISTING_RECEIPT_CONFLICT");
      }
      return Object.freeze({
        state: "UNCHANGED_UNCREDITED_PROOF" as const,
        receiptKey: proof.receiptKey,
        creditAuthorized: false as const,
        wagerAuthorized: false as const,
      });
    }

    await tx.warSatchelProofCandidate.create({
      data: {
        intentId: intent.id, userId: ownerUserId,
        chainId: "wolo-1", txHash: proof.txHash, transferIndex: 0,
        senderAddress: ownerWallet, vaultAddress: intent.vaultAddress,
        amountUwolo: BigInt(intent.amountUwolo), txHeight: BigInt(proof.height),
        status: "uncredited", verifiedAt: new Date(),
      },
      select: { id: true },
    });
    return Object.freeze({
      state: "DURABLY_RECORDED_UNCREDITED_PROOF" as const,
      receiptKey: proof.receiptKey,
      creditAuthorized: false as const,
      wagerAuthorized: false as const,
    });
  }, { isolationLevel: "Serializable", maxWait: 4000, timeout: 7000 });
}
