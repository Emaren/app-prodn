export type AutoBetPreviewSlipSide = "left" | "right";

export type AutoBetPreviewSlipSelection = {
  marketId: number;
  side: AutoBetPreviewSlipSide;
  stake: number;
  desync: {
    marketId: number;
    side: AutoBetPreviewSlipSide;
    stake: number;
  } | null;
};

export type AutoBetPreviewSlipBlocker =
  | "preview_missing"
  | "preview_not_shadow_only"
  | "winner_market_closed"
  | "winner_wager_already_exists"
  | "winner_stake_invalid"
  | "winner_stake_exceeds_current_limit"
  | "desync_shape_invalid"
  | "desync_market_missing"
  | "desync_market_changed"
  | "desync_market_closed"
  | "desync_wager_already_exists"
  | "desync_stake_invalid"
  | "combined_stake_exceeds_current_limit";

export type AutoBetPreviewSlipPlan =
  | {
      ok: true;
      selection: AutoBetPreviewSlipSelection;
      totalStakeWolo: number;
    }
  | {
      ok: false;
      blocker: AutoBetPreviewSlipBlocker;
    };

type ViewerWager = {
  side: string;
} | null;

type ViewerAutoBetPreview = {
  selectedSide: string;
  winnerStakeWolo: number;
  desyncSide: string;
  desyncStakeWolo: number;
  desyncMarketId: number | null;
  financiallyCommitted: boolean;
} | null;

type DesyncMarket = {
  id: number;
  bettingOpen: boolean;
  viewerWager: ViewerWager;
} | null;

function validPositiveWholeWolo(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Pure, non-financial planner for copying one frozen Auto Bet shadow decision
 * into the local manual Bet Slip.
 *
 * It never clamps amounts or changes sides. If the exact recorded plan cannot
 * be represented safely against the current market state, it fails closed.
 */
export function planAutoBetPreviewSlip(input: {
  marketId: number;
  bettingOpen: boolean;
  viewerWager: ViewerWager;
  desyncMarket: DesyncMarket;
  preview: ViewerAutoBetPreview;
  maxStakeWolo: number;
}): AutoBetPreviewSlipPlan {
  const preview = input.preview;
  if (!preview) {
    return { ok: false, blocker: "preview_missing" };
  }
  if (preview.financiallyCommitted !== false) {
    return { ok: false, blocker: "preview_not_shadow_only" };
  }
  if (!input.bettingOpen) {
    return { ok: false, blocker: "winner_market_closed" };
  }
  if (input.viewerWager) {
    return { ok: false, blocker: "winner_wager_already_exists" };
  }
  if (
    preview.selectedSide !== "left" &&
    preview.selectedSide !== "right"
  ) {
    return { ok: false, blocker: "winner_stake_invalid" };
  }
  if (!validPositiveWholeWolo(preview.winnerStakeWolo)) {
    return { ok: false, blocker: "winner_stake_invalid" };
  }
  if (
    !Number.isSafeInteger(input.maxStakeWolo) ||
    input.maxStakeWolo < 1 ||
    preview.winnerStakeWolo > input.maxStakeWolo
  ) {
    return { ok: false, blocker: "winner_stake_exceeds_current_limit" };
  }

  if (preview.desyncSide === "none") {
    if (preview.desyncMarketId !== null || preview.desyncStakeWolo !== 0) {
      return { ok: false, blocker: "desync_shape_invalid" };
    }

    return {
      ok: true,
      selection: {
        marketId: input.marketId,
        side: preview.selectedSide,
        stake: preview.winnerStakeWolo,
        desync: null,
      },
      totalStakeWolo: preview.winnerStakeWolo,
    };
  }

  if (preview.desyncSide !== "yes" && preview.desyncSide !== "no") {
    return { ok: false, blocker: "desync_shape_invalid" };
  }
  if (!validPositiveWholeWolo(preview.desyncStakeWolo)) {
    return { ok: false, blocker: "desync_stake_invalid" };
  }
  if (!input.desyncMarket || preview.desyncMarketId === null) {
    return { ok: false, blocker: "desync_market_missing" };
  }
  if (input.desyncMarket.id !== preview.desyncMarketId) {
    return { ok: false, blocker: "desync_market_changed" };
  }
  if (!input.desyncMarket.bettingOpen) {
    return { ok: false, blocker: "desync_market_closed" };
  }
  if (input.desyncMarket.viewerWager) {
    return { ok: false, blocker: "desync_wager_already_exists" };
  }

  const totalStakeWolo =
    preview.winnerStakeWolo + preview.desyncStakeWolo;
  if (
    !Number.isSafeInteger(totalStakeWolo) ||
    totalStakeWolo > input.maxStakeWolo
  ) {
    return {
      ok: false,
      blocker: "combined_stake_exceeds_current_limit",
    };
  }

  return {
    ok: true,
    selection: {
      marketId: input.marketId,
      side: preview.selectedSide,
      stake: preview.winnerStakeWolo,
      desync: {
        marketId: input.desyncMarket.id,
        side: preview.desyncSide === "yes" ? "right" : "left",
        stake: preview.desyncStakeWolo,
      },
    },
    totalStakeWolo,
  };
}

export function autoBetPreviewSlipBlockerLabel(
  blocker: AutoBetPreviewSlipBlocker
) {
  switch (blocker) {
    case "preview_missing":
      return "No Auto Bet preview is available.";
    case "preview_not_shadow_only":
      return "This preview is no longer shadow-only.";
    case "winner_market_closed":
      return "This winner book is no longer open for a new slip.";
    case "winner_wager_already_exists":
      return "A real winner wager already exists for this book.";
    case "winner_stake_invalid":
      return "The recorded winner amount is not a valid whole-WOLO stake.";
    case "winner_stake_exceeds_current_limit":
      return "The recorded winner amount exceeds the current wallet/app limit.";
    case "desync_shape_invalid":
      return "The recorded Desync preview is internally inconsistent.";
    case "desync_market_missing":
      return "The recorded Desync market is no longer attached.";
    case "desync_market_changed":
      return "The current Desync market is not the one recorded by Auto Bet.";
    case "desync_market_closed":
      return "The recorded Desync book is no longer open.";
    case "desync_wager_already_exists":
      return "A real Desync wager already exists for this book.";
    case "desync_stake_invalid":
      return "The recorded Desync amount is not a valid whole-WOLO stake.";
    case "combined_stake_exceeds_current_limit":
      return "The recorded Winner + Desync total exceeds the current wallet/app limit.";
  }
}
