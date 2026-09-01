import type { StakingActivityMode } from "@/lib/stakingActivityPreferences";

export type StakingActivityLiveSource = "poll" | "browser-event";

export function shouldQueueStakingActivityLiveRow(input: {
  source: StakingActivityLiveSource;
  mode: StakingActivityMode;
  viewReady: boolean;
  cancelled?: boolean;
  matchesView: boolean;
  alreadyKnown: boolean;
}) {
  if (
    input.cancelled ||
    !input.viewReady ||
    !input.matchesView ||
    input.alreadyKnown
  ) {
    return false;
  }

  // Browser events carry ledger-shaped rows. Grouped-bet rows must come from
  // the canonical server projection so a local event cannot corrupt that view.
  return input.source === "poll" || input.mode === "ledger";
}
