import {
  DEFAULT_WARGRAPH_REWARD_CONFIG,
  WARGRAPH_LAYERS,
} from "./constants.ts";

import {
  isLegalWarGraphAggressorPath,
} from "./eligibility.ts";

import type {
  WarGraphRewardAward,
  WarGraphRewardConfig,
  WarGraphRewardDecision,
  WarGraphRewardInput,
} from "./types.ts";

function isRewardAmountValid(value: unknown): boolean {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= 0
  );
}

export function isWarGraphRewardConfigValid(
  config: WarGraphRewardConfig,
): boolean {
  return (
    config != null &&
    isRewardAmountValid(config.frontierToRingII) &&
    isRewardAmountValid(config.ringIIToRingI) &&
    isRewardAmountValid(config.firstBlood) &&
    isRewardAmountValid(config.crownBattleWinner)
  );
}

function invalidConfig(): WarGraphRewardDecision {
  return {
    ok: false,
    reason: "INVALID_REWARD_CONFIGURATION",
    awards: [],
    totalWolo: 0,
  };
}

function invalidGraph(): WarGraphRewardDecision {
  return {
    ok: false,
    reason: "INELIGIBLE_GRAPH_STATE_AT_START",
    awards: [],
    totalWolo: 0,
  };
}

function addAward(
  awards: WarGraphRewardAward[],
  award: WarGraphRewardAward,
): void {
  if (award.amountWolo > 0) {
    awards.push(award);
  }
}

export function calculateWarGraphRewards(
  input: WarGraphRewardInput,
  config: WarGraphRewardConfig =
    DEFAULT_WARGRAPH_REWARD_CONFIG,
): WarGraphRewardDecision {
  if (!isWarGraphRewardConfigValid(config)) {
    return invalidConfig();
  }

  if (!input || typeof input.kind !== "string") {
    return invalidGraph();
  }

  if (input.kind !== "VERIFIED_BATTLE") {
    switch (input.kind) {
      case "DEFENSE_DEFAULT":
      case "DEFENDER_NO_START_DEFAULT":
      case "CHALLENGER_ABANDONMENT":
      case "TECHNICAL_VOID":
      case "SYSTEM_VOID":
      case "MUTUAL_NO_START":
      case "GRAVITY_MOVE":
        return {
          ok: true,
          awards: [],
          totalWolo: 0,
        };

      default:
        return invalidGraph();
    }
  }

  if (
    !isLegalWarGraphAggressorPath(
      input.aggressorLayer,
      input.defenderLayer,
    ) ||
    (
      input.outcome !== "AGGRESSOR_WIN" &&
      input.outcome !== "DEFENDER_WIN"
    ) ||
    typeof input.isFirstBlood !== "boolean" ||
    (
      input.isFirstBlood &&
      input.defenderLayer !== WARGRAPH_LAYERS.CROWN
    )
  ) {
    return invalidGraph();
  }

  const awards: WarGraphRewardAward[] = [];

  if (
    input.outcome === "AGGRESSOR_WIN" &&
    input.aggressorLayer ===
      WARGRAPH_LAYERS.FRONTIER &&
    input.defenderLayer === WARGRAPH_LAYERS.RING_II
  ) {
    addAward(awards, {
      recipient: "AGGRESSOR",
      component: "FRONTIER_TO_RING_II",
      amountWolo: config.frontierToRingII,
    });
  }

  if (
    input.outcome === "AGGRESSOR_WIN" &&
    input.aggressorLayer ===
      WARGRAPH_LAYERS.RING_II &&
    input.defenderLayer === WARGRAPH_LAYERS.RING_I
  ) {
    addAward(awards, {
      recipient: "AGGRESSOR",
      component: "RING_II_TO_RING_I",
      amountWolo: config.ringIIToRingI,
    });
  }

  if (input.defenderLayer === WARGRAPH_LAYERS.CROWN) {
    if (input.isFirstBlood) {
      addAward(awards, {
        recipient: "AGGRESSOR",
        component: "FIRST_BLOOD",
        amountWolo: config.firstBlood,
      });
    }

    addAward(awards, {
      recipient:
        input.outcome === "AGGRESSOR_WIN"
          ? "AGGRESSOR"
          : "DEFENDER",
      component: "CROWN_BATTLE_WINNER",
      amountWolo: config.crownBattleWinner,
    });
  }

  const totalWolo = awards.reduce(
    (total, award) => total + award.amountWolo,
    0,
  );

  if (!Number.isSafeInteger(totalWolo)) {
    return invalidConfig();
  }

  return {
    ok: true,
    awards,
    totalWolo,
  };
}
