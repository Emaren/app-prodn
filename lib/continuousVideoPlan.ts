export type LiveChunkPlan =
  | { kind: "wait"; reason: "no-media" | "pending-chunk" }
  | { kind: "fallback"; reason: "behind-window" | "gap" | "too-many-chunks" }
  | { kind: "append"; from: number; through: number };

export function planLiveChunkAdvance(input: {
  lastSeq: number;
  newest: number;
  recommendedStartSeq: number | null;
  availableMediaSeqs: readonly number[];
  maxCatchup: number;
}): LiveChunkPlan {
  const { lastSeq, newest, recommendedStartSeq, maxCatchup } = input;
  if (!Number.isSafeInteger(newest) || newest < 1) {
    return { kind: "wait", reason: "no-media" };
  }
  if (!Number.isSafeInteger(maxCatchup) || maxCatchup < 1) {
    return { kind: "fallback", reason: "too-many-chunks" };
  }
  // A new viewer joins at the broadcaster's recommended recent media
  // clusters rather than fetching the entire two-hour recording.
  const baseline = lastSeq >= 0
    ? lastSeq
    : Math.max(0, Math.min(newest - 1, recommendedStartSeq ?? newest - 10));
  const from = baseline + 1;
  if (from > newest) return { kind: "wait", reason: "no-media" };
  if (newest - baseline > maxCatchup) {
    return { kind: "fallback", reason: "too-many-chunks" };
  }
  const available = new Set(input.availableMediaSeqs.filter((s) =>
    Number.isSafeInteger(s) && s > 0,
  ));
  const firstAvailable = Math.min(...available);
  for (let sequence = from; sequence <= newest; sequence += 1) {
    if (available.has(sequence)) continue;
    // An expired or discontinuous cluster cannot be silently skipped in MSE.
    if (sequence < firstAvailable) return { kind: "fallback", reason: "behind-window" };
    if (sequence < newest) return { kind: "fallback", reason: "gap" };
    return { kind: "wait", reason: "pending-chunk" };
  }
  return { kind: "append", from, through: newest };
}
