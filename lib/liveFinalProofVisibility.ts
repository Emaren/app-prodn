export const LIVE_FINAL_PROOF_VISIBILITY_MS = 15 * 60 * 1000;

export type FinalProofVisibilityInput = {
  liveActivityAtMs: number;
  finalActivityAtMs: number;
  finalDisposition: "live" | "result_ready" | "saved_rehost" | "result_review";
  nowMs?: number;
};

/**
 * Keep one battle visible in the active command surface while a newer watcher
 * final artifact is present but the final result still requires proof review.
 *
 * This is presentation authority only. Callers must independently lock betting
 * and settlement whenever this function returns true.
 */
export function shouldKeepFinalProofVisible({
  liveActivityAtMs,
  finalActivityAtMs,
  finalDisposition,
  nowMs = Date.now(),
}: FinalProofVisibilityInput) {
  if (![liveActivityAtMs, finalActivityAtMs, nowMs].every(Number.isFinite)) {
    return false;
  }

  return (
    finalDisposition === "result_review" &&
    finalActivityAtMs >= liveActivityAtMs &&
    finalActivityAtMs >= nowMs - LIVE_FINAL_PROOF_VISIBILITY_MS
  );
}
