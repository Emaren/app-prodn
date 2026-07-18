export type ChallengeFundingParticipantSide = "left" | "right";

export type PendingChallengeFundingProof = {
  challengeId: number;
  participantSide: ChallengeFundingParticipantSide;
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
  fundingTxHash: string;
  walletAddress: string;
  savedAt: string;
};

function pendingChallengeFundingKey(challengeId: number) {
  return `aoe2war:challenge:pending-funding:${challengeId}:v2`;
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadPendingChallengeFundingProof(input: {
  challengeId: number;
  participantSide: ChallengeFundingParticipantSide;
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
}) {
  const raw = readStorage(pendingChallengeFundingKey(input.challengeId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingChallengeFundingProof>;
    if (
      parsed.challengeId !== input.challengeId ||
      parsed.participantSide !== input.participantSide ||
      parsed.wagerAmountWolo !== input.wagerAmountWolo ||
      parsed.guaranteeAmountWolo !== input.guaranteeAmountWolo ||
      typeof parsed.fundingTxHash !== "string" ||
      !parsed.fundingTxHash.trim() ||
      typeof parsed.walletAddress !== "string" ||
      !parsed.walletAddress.trim()
    ) {
      return null;
    }

    return {
      challengeId: input.challengeId,
      participantSide: input.participantSide,
      wagerAmountWolo: input.wagerAmountWolo,
      guaranteeAmountWolo: input.guaranteeAmountWolo,
      fundingTxHash: parsed.fundingTxHash.trim(),
      walletAddress: parsed.walletAddress.trim(),
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString(),
    } satisfies PendingChallengeFundingProof;
  } catch {
    return null;
  }
}

export function storePendingChallengeFundingProof(
  proof: Omit<PendingChallengeFundingProof, "savedAt"> & { savedAt?: string }
) {
  const normalized: PendingChallengeFundingProof = {
    ...proof,
    fundingTxHash: proof.fundingTxHash.trim(),
    walletAddress: proof.walletAddress.trim(),
    savedAt: proof.savedAt || new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(
      pendingChallengeFundingKey(proof.challengeId),
      JSON.stringify(normalized)
    );
  } catch {
    // Best-effort retry protection. Server-side funding proof uniqueness remains canonical.
  }

  return normalized;
}

export function clearPendingChallengeFundingProof(challengeId: number) {
  try {
    window.localStorage.removeItem(pendingChallengeFundingKey(challengeId));
  } catch {
    // Best-effort cleanup.
  }
}
