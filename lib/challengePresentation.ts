/** Presentation choices never alter the server's Challenge protocol. */
export type ChallengeLayout = "basic" | "advanced" | "extreme";
export type ChallengePresentationVersion = 1 | 2;
export const CHALLENGE_DISPLAY_STORAGE_KEY = "aoe2war:challenge:display";

export function normalizeChallengeDisplay(value: unknown) {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    layout: row.layout === "basic" || row.layout === "advanced" ? row.layout : "extreme",
    version: row.version === 1 ? 1 : 2,
  } as { layout: ChallengeLayout; version: ChallengePresentationVersion };
}

export function challengeCountdown(deadline: string | null | undefined, nowMs: number) {
  const target = deadline ? Date.parse(deadline) : NaN;
  if (!Number.isFinite(target) || !Number.isFinite(nowMs)) return { label: "—", finalHour: false, expired: false };
  const seconds = Math.max(0, Math.ceil((target - nowMs) / 1000));
  return {
    label: `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
    finalHour: seconds > 0 && seconds <= 3600,
    expired: seconds === 0,
  };
}

export function championshipPhaseLabel(phase: string, hasTitle = true) {
  const labels: Record<string, string> = {
    open: "Challenge sent",
    ready: "Ready — start your match",
    defense_in_progress: hasTitle ? "Title is being defended" : "Battle in progress",
    result_pending: "Result pending",
    default_grace: "Commissioner grace",
    commissioner_review: "Commissioner review",
    disputed: hasTitle ? "Title in dispute" : "Result in dispute",
    defaulted: hasTitle ? "Title default recorded" : "Challenge default recorded",
    completed: "Result verified",
    settled: "Completed",
    declined: "Challenge declined",
    cancelled: "Challenge cancelled",
    canceled: "Challenge cancelled",
    expired: "Challenge expired",
    commissioner_vetoed: "Commissioner veto",
  };
  return labels[phase] || "Challenge awaiting review";
}

export function challengeStakeLabel(wagerAmountWolo: number) {
  return wagerAmountWolo === 10 ? "Friendly" : wagerAmountWolo === 25 ? "Ranked" : wagerAmountWolo === 100 ? "Grudge" : "Custom stakes";
}
