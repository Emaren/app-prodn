import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WARGRAPH_REWARD_CONFIG,
  WARGRAPH_FIXED_INTERIOR_CAPACITY,
  WARGRAPH_LAYERS,
  WARGRAPH_MATCH_LAUNCH_MS,
  WARGRAPH_MAX_RESOLVED_CONTESTS,
  WARGRAPH_RING_RESPONSE_MS,
  WARGRAPH_TIME_ZONE,
  areAdjacentWarGraphLayers,
  calculateWarGraphRewards,
  getInwardWarGraphLayer,
  getMatchLaunchDeadline,
  getRingResponseDeadline,
  getWarGraphActionCharges,
  getWarGraphClock,
  getWarGraphNightKey,
  getWarGraphOperationalPhase,
  isBoundPairingCommencementEligible,
  isLegalWarGraphAggressorPath,
  isWarGraphPrimeWindow,
  planDefenseDefaultMovement,
  planGravityMovement,
  planVerifiedBattleMovement,
  qualifyWarGraphGame,
} from "../lib/wargraph/index.ts";

import type {
  WarGraphParticipantAtStart,
  WarGraphQualificationInput,
} from "../lib/wargraph/index.ts";

function participant(
  playerId: string,
  layer: 0 | 1 | 2 | 3,
  overrides: Partial<WarGraphParticipantAtStart> = {},
): WarGraphParticipantAtStart {
  return {
    playerId,
    layer,
    actionsUsed: 0,
    hasConflictingEngagement: false,
    ...overrides,
  };
}

function organicQualification(
  overrides: Partial<WarGraphQualificationInput> = {},
): WarGraphQualificationInput {
  return {
    commencedAt: new Date(
      "2026-08-24T01:00:00.000Z",
    ),
    provenance: "LIVE",
    path: "ORGANIC",
    graphStateAtStartValid: true,
    left: participant("frontier", 3),
    right: participant("ring-two", 2),
    watcherProof: {
      leftWatcherLive: true,
      rightWatcherLive: true,
      sameGame: true,
    },
    ...overrides,
  };
}

test(
  "V1 topology uses layers 0-3 and exact inward adjacency",
  () => {
    assert.equal(WARGRAPH_TIME_ZONE, "America/Edmonton");
    assert.equal(WARGRAPH_LAYERS.CROWN, 0);
    assert.equal(WARGRAPH_LAYERS.RING_I, 1);
    assert.equal(WARGRAPH_LAYERS.RING_II, 2);
    assert.equal(WARGRAPH_LAYERS.FRONTIER, 3);
    assert.equal(
      WARGRAPH_FIXED_INTERIOR_CAPACITY[0],
      1,
    );
    assert.equal(
      WARGRAPH_FIXED_INTERIOR_CAPACITY[1],
      2,
    );
    assert.equal(
      WARGRAPH_FIXED_INTERIOR_CAPACITY[2],
      6,
    );

    assert.equal(areAdjacentWarGraphLayers(3, 2), true);
    assert.equal(areAdjacentWarGraphLayers(2, 1), true);
    assert.equal(areAdjacentWarGraphLayers(1, 0), true);
    assert.equal(areAdjacentWarGraphLayers(3, 1), false);
    assert.equal(areAdjacentWarGraphLayers(2, 2), false);
    assert.equal(areAdjacentWarGraphLayers(4, 3), false);

    assert.equal(isLegalWarGraphAggressorPath(3, 2), true);
    assert.equal(isLegalWarGraphAggressorPath(2, 3), false);
    assert.equal(getInwardWarGraphLayer(3), 2);
    assert.equal(getInwardWarGraphLayer(1), 0);
    assert.equal(getInwardWarGraphLayer(0), null);
  },
);

test(
  "Prime Window is 5 PM inclusive to 11 PM exclusive in Edmonton",
  () => {
    const beforeOpen = new Date(
      "2026-01-15T23:59:59.999Z",
    );
    const opens = new Date(
      "2026-01-16T00:00:00.000Z",
    );
    const lastPrimeInstant = new Date(
      "2026-01-16T05:59:59.999Z",
    );
    const lastCall = new Date(
      "2026-01-16T06:00:00.000Z",
    );

    assert.equal(isWarGraphPrimeWindow(beforeOpen), false);
    assert.equal(isWarGraphPrimeWindow(opens), true);
    assert.equal(isWarGraphPrimeWindow(lastPrimeInstant), true);
    assert.equal(isWarGraphPrimeWindow(lastCall), false);

    assert.deepEqual(
      getWarGraphClock(beforeOpen),
      {
        valid: true,
        phase: "BEFORE_PRIME",
        isPrimeWindow: false,
        local: {
          year: 2026,
          month: 1,
          day: 15,
          hour: 16,
          minute: 59,
          second: 59,
          dateKey: "2026-01-15",
          minuteOfDay: 16 * 60 + 59,
        },
        nightKey: "2026-01-14",
      },
    );

    const after = getWarGraphClock(lastCall);
    assert.equal(after.valid, true);
    if (after.valid) {
      assert.equal(after.phase, "LAST_CALL_PASSED");
      assert.equal(after.nightKey, "2026-01-15");
    }

    assert.deepEqual(
      getWarGraphClock(new Date("invalid")),
      {
        valid: false,
        reason: "INVALID_TIMESTAMP",
      },
    );
  },
);

test(
  "Afterburn versus Static State requires authoritative contract state",
  () => {
    const oneAmMountain = new Date(
      "2026-01-16T08:00:00.000Z",
    );

    assert.equal(
      getWarGraphOperationalPhase(
        oneAmMountain,
        true,
      ),
      "AFTERBURN",
    );
    assert.equal(
      getWarGraphOperationalPhase(
        oneAmMountain,
        false,
      ),
      "STATIC",
    );
  },
);

test(
  "night keys follow the 5 PM Edmonton boundary across midnight",
  () => {
    assert.equal(
      getWarGraphNightKey(
        new Date("2026-01-16T07:30:00.000Z"),
      ),
      "2026-01-15",
    );

    assert.equal(
      getWarGraphNightKey(
        new Date("2026-01-16T23:59:59.999Z"),
      ),
      "2026-01-15",
    );

    assert.equal(
      getWarGraphNightKey(
        new Date("2026-01-17T00:00:00.000Z"),
      ),
      "2026-01-16",
    );
  },
);

test(
  "Prime Window remains DST-safe at spring and fall transitions",
  () => {
    assert.equal(
      isWarGraphPrimeWindow(
        new Date("2026-03-08T22:59:59.999Z"),
      ),
      false,
    );
    assert.equal(
      isWarGraphPrimeWindow(
        new Date("2026-03-08T23:00:00.000Z"),
      ),
      true,
    );

    assert.equal(
      isWarGraphPrimeWindow(
        new Date("2026-11-01T23:59:59.999Z"),
      ),
      false,
    );
    assert.equal(
      isWarGraphPrimeWindow(
        new Date("2026-11-02T00:00:00.000Z"),
      ),
      true,
    );
  },
);

test(
  "Last Call preserves full response and launch windows in Afterburn",
  () => {
    const advanceCreatedAt = new Date(
      "2026-08-24T04:59:00.000Z",
    );
    const acceptedAt = new Date(
      "2026-08-24T05:13:50.000Z",
    );
    const finalValidStart = new Date(
      "2026-08-24T05:43:49.999Z",
    );
    const expiredStart = new Date(
      "2026-08-24T05:43:50.000Z",
    );

    assert.equal(
      getRingResponseDeadline(
        advanceCreatedAt,
      )?.toISOString(),
      "2026-08-24T05:14:00.000Z",
    );
    assert.equal(
      getMatchLaunchDeadline(
        acceptedAt,
      )?.toISOString(),
      "2026-08-24T05:43:50.000Z",
    );

    assert.equal(WARGRAPH_RING_RESPONSE_MS, 900_000);
    assert.equal(WARGRAPH_MATCH_LAUNCH_MS, 1_800_000);

    assert.equal(
      isBoundPairingCommencementEligible(
        finalValidStart,
        {
          advanceCreatedAt,
          acceptedAt,
        },
      ),
      true,
    );

    assert.equal(
      isBoundPairingCommencementEligible(
        expiredStart,
        {
          advanceCreatedAt,
          acceptedAt,
        },
      ),
      false,
    );

    assert.equal(
      getRingResponseDeadline(
        new Date("2026-08-24T05:00:00.000Z"),
      ),
      null,
    );
  },
);

test(
  "organic qualification assigns roles by geometry",
  () => {
    const decision = qualifyWarGraphGame(
      organicQualification(),
    );

    assert.equal(decision.eligible, true);
    if (decision.eligible) {
      assert.equal(decision.reason, "WARGRAPH_ELIGIBLE");
      assert.equal(decision.aggressor.playerId, "frontier");
      assert.equal(decision.defender.playerId, "ring-two");
      assert.equal(decision.nightKey, "2026-08-23");
    }
  },
);

test(
  "eligibility emits stable constitutional reason codes",
  () => {
    const cases: ReadonlyArray<{
      input: WarGraphQualificationInput;
      reason: string;
    }> = [
      {
        input: organicQualification({
          provenance: "MANUAL",
        }),
        reason: "INELIGIBLE_NOT_LIVE",
      },
      {
        input: organicQualification({
          commencedAt: new Date(
            "2026-08-24T17:00:00.000Z",
          ),
        }),
        reason: "INELIGIBLE_OUTSIDE_PRIME_WINDOW",
      },
      {
        input: organicQualification({
          watcherProof: {
            leftWatcherLive: true,
            rightWatcherLive: false,
            sameGame: true,
          },
        }),
        reason: "INELIGIBLE_SINGLE_WATCHER",
      },
      {
        input: organicQualification({
          left: participant("frontier", 3, {
            hasConflictingEngagement: true,
          }),
        }),
        reason: "INELIGIBLE_CONFLICTING_ENGAGEMENT",
      },
      {
        input: organicQualification({
          left: participant("frontier", 3, {
            actionsUsed: 2,
          }),
        }),
        reason: "INELIGIBLE_ACTION_CAP",
      },
      {
        input: organicQualification({
          right: participant("same-ring", 3),
        }),
        reason: "INELIGIBLE_SAME_RING",
      },
      {
        input: organicQualification({
          right: participant("ring-one", 1),
        }),
        reason: "INELIGIBLE_RING_GAP",
      },
      {
        input: organicQualification({
          graphStateAtStartValid: false,
        }),
        reason: "INELIGIBLE_GRAPH_STATE_AT_START",
      },
    ];

    for (const item of cases) {
      const decision = qualifyWarGraphGame(item.input);
      assert.equal(decision.eligible, false);
      assert.equal(decision.reason, item.reason);
    }
  },
);

test(
  "malformed graph state fails closed instead of guessing",
  () => {
    const input = organicQualification({
      left: {
        ...participant("bad-layer", 3),
        layer: 9 as 3,
      },
    });

    assert.deepEqual(
      qualifyWarGraphGame(input),
      {
        eligible: false,
        reason: "INELIGIBLE_GRAPH_STATE_AT_START",
      },
    );
  },
);

test(
  "a bound pairing may legally commence during Afterburn",
  () => {
    const decision = qualifyWarGraphGame(
      organicQualification({
        path: "BOUND_PAIRING",
        commencedAt: new Date(
          "2026-08-24T05:43:49.000Z",
        ),
        pairingTiming: {
          advanceCreatedAt: new Date(
            "2026-08-24T04:59:00.000Z",
          ),
          acceptedAt: new Date(
            "2026-08-24T05:13:50.000Z",
          ),
        },
      }),
    );

    assert.equal(decision.eligible, true);
    if (decision.eligible) {
      assert.equal(decision.nightKey, "2026-08-23");
    }
  },
);

test(
  "the universal action matrix preserves innocent defenders and voids",
  () => {
    assert.equal(WARGRAPH_MAX_RESOLVED_CONTESTS, 2);
    assert.deepEqual(
      getWarGraphActionCharges("VERIFIED_BATTLE"),
      { aggressor: 1, defender: 1 },
    );
    assert.deepEqual(
      getWarGraphActionCharges("DEFENSE_DEFAULT"),
      { aggressor: 1, defender: 1 },
    );
    assert.deepEqual(
      getWarGraphActionCharges(
        "DEFENDER_NO_START_DEFAULT",
      ),
      { aggressor: 1, defender: 1 },
    );
    assert.deepEqual(
      getWarGraphActionCharges(
        "CHALLENGER_ABANDONMENT",
      ),
      { aggressor: 1, defender: 0 },
    );
    assert.deepEqual(
      getWarGraphActionCharges("SYSTEM_VOID"),
      { aggressor: 0, defender: 0 },
    );
    assert.deepEqual(
      getWarGraphActionCharges("GRAVITY_MOVE"),
      { aggressor: 0, defender: 0 },
    );
    assert.equal(
      getWarGraphActionCharges("UNKNOWN"),
      null,
    );
  },
);

test(
  "an Aggressor victory takes the inner seat and catastrophically falls the Defender",
  () => {
    const movement = planVerifiedBattleMovement({
      aggressor: {
        playerId: "outer",
        layer: 3,
        actionsUsed: 0,
      },
      defender: {
        playerId: "middle",
        layer: 2,
        actionsUsed: 1,
      },
      outcome: "AGGRESSOR_WIN",
    });

    assert.equal(movement.ok, true);
    if (movement.ok) {
      assert.deepEqual(movement.aggressor, {
        playerId: "outer",
        fromLayer: 3,
        toLayer: 2,
        actionCharge: 1,
        catastrophicFall: false,
      });
      assert.deepEqual(movement.defender, {
        playerId: "middle",
        fromLayer: 2,
        toLayer: 3,
        actionCharge: 1,
        catastrophicFall: true,
      });
    }
  },
);

test(
  "a Defender victory catastrophically falls an interior Aggressor",
  () => {
    const movement = planVerifiedBattleMovement({
      aggressor: {
        playerId: "middle",
        layer: 2,
        actionsUsed: 0,
      },
      defender: {
        playerId: "inner",
        layer: 1,
        actionsUsed: 0,
      },
      outcome: "DEFENDER_WIN",
    });

    assert.equal(movement.ok, true);
    if (movement.ok) {
      assert.equal(movement.aggressor.toLayer, 3);
      assert.equal(
        movement.aggressor.catastrophicFall,
        true,
      );
      assert.equal(movement.defender?.toLayer, 1);
      assert.equal(
        movement.defender?.catastrophicFall,
        false,
      );
    }
  },
);

test(
  "a Frontier loss holds position while a Crown loss falls to Frontier",
  () => {
    const frontierLoss = planVerifiedBattleMovement({
      aggressor: {
        playerId: "outer",
        layer: 3,
        actionsUsed: 0,
      },
      defender: {
        playerId: "middle",
        layer: 2,
        actionsUsed: 0,
      },
      outcome: "DEFENDER_WIN",
    });

    assert.equal(frontierLoss.ok, true);
    if (frontierLoss.ok) {
      assert.equal(frontierLoss.aggressor.toLayer, 3);
      assert.equal(
        frontierLoss.aggressor.catastrophicFall,
        false,
      );
    }

    const crownLoss = planVerifiedBattleMovement({
      aggressor: {
        playerId: "inner",
        layer: 1,
        actionsUsed: 0,
      },
      defender: {
        playerId: "crown",
        layer: 0,
        actionsUsed: 0,
      },
      outcome: "AGGRESSOR_WIN",
    });

    assert.equal(crownLoss.ok, true);
    if (crownLoss.ok) {
      assert.equal(crownLoss.aggressor.toLayer, 0);
      assert.equal(crownLoss.defender?.toLayer, 3);
      assert.equal(
        crownLoss.defender?.catastrophicFall,
        true,
      );
    }
  },
);

test(
  "defaults move territory without changing battle truth",
  () => {
    const movement = planDefenseDefaultMovement({
      aggressor: {
        playerId: "outer",
        layer: 3,
        actionsUsed: 1,
      },
      defender: {
        playerId: "middle",
        layer: 2,
        actionsUsed: 1,
      },
    });

    assert.equal(movement.ok, true);
    if (movement.ok) {
      assert.equal(movement.kind, "DEFENSE_DEFAULT");
      assert.equal(movement.aggressor.toLayer, 2);
      assert.equal(movement.defender?.toLayer, 3);
    }
  },
);

test(
  "movement rejects action-cap, ring-gap, and Crown Gravity paths",
  () => {
    assert.deepEqual(
      planVerifiedBattleMovement({
        aggressor: {
          playerId: "outer",
          layer: 3,
          actionsUsed: 2,
        },
        defender: {
          playerId: "middle",
          layer: 2,
          actionsUsed: 0,
        },
        outcome: "AGGRESSOR_WIN",
      }),
      {
        ok: false,
        reason: "INELIGIBLE_ACTION_CAP",
      },
    );

    assert.deepEqual(
      planVerifiedBattleMovement({
        aggressor: {
          playerId: "outer",
          layer: 3,
          actionsUsed: 0,
        },
        defender: {
          playerId: "inner",
          layer: 1,
          actionsUsed: 0,
        },
        outcome: "AGGRESSOR_WIN",
      }),
      {
        ok: false,
        reason: "INELIGIBLE_GRAPH_STATE_AT_START",
      },
    );

    assert.equal(
      planGravityMovement({
        playerId: "outer",
        fromLayer: 3,
        toLayer: 2,
      }).ok,
      true,
    );

    assert.deepEqual(
      planGravityMovement({
        playerId: "inner",
        fromLayer: 1 as 2,
        toLayer: 0 as 1,
      }),
      {
        ok: false,
        reason: "INELIGIBLE_GRAPH_STATE_AT_START",
      },
    );
  },
);

test(
  "default configurable rewards match the V1 schedule",
  () => {
    assert.deepEqual(DEFAULT_WARGRAPH_REWARD_CONFIG, {
      frontierToRingII: 1,
      ringIIToRingI: 2,
      firstBlood: 3,
      crownBattleWinner: 50,
    });

    assert.deepEqual(
      calculateWarGraphRewards({
        kind: "VERIFIED_BATTLE",
        aggressorLayer: 3,
        defenderLayer: 2,
        outcome: "AGGRESSOR_WIN",
        isFirstBlood: false,
      }),
      {
        ok: true,
        awards: [
          {
            recipient: "AGGRESSOR",
            component: "FRONTIER_TO_RING_II",
            amountWolo: 1,
          },
        ],
        totalWolo: 1,
      },
    );

    assert.equal(
      calculateWarGraphRewards({
        kind: "VERIFIED_BATTLE",
        aggressorLayer: 2,
        defenderLayer: 1,
        outcome: "AGGRESSOR_WIN",
        isFirstBlood: false,
      }).totalWolo,
      2,
    );

    assert.equal(
      calculateWarGraphRewards({
        kind: "VERIFIED_BATTLE",
        aggressorLayer: 2,
        defenderLayer: 1,
        outcome: "DEFENDER_WIN",
        isFirstBlood: false,
      }).totalWolo,
      0,
    );
  },
);

test(
  "First Blood belongs to the Crown Aggressor while the winner receives 50",
  () => {
    assert.deepEqual(
      calculateWarGraphRewards({
        kind: "VERIFIED_BATTLE",
        aggressorLayer: 1,
        defenderLayer: 0,
        outcome: "DEFENDER_WIN",
        isFirstBlood: true,
      }),
      {
        ok: true,
        awards: [
          {
            recipient: "AGGRESSOR",
            component: "FIRST_BLOOD",
            amountWolo: 3,
          },
          {
            recipient: "DEFENDER",
            component: "CROWN_BATTLE_WINNER",
            amountWolo: 50,
          },
        ],
        totalWolo: 53,
      },
    );

    assert.equal(
      calculateWarGraphRewards({
        kind: "VERIFIED_BATTLE",
        aggressorLayer: 1,
        defenderLayer: 0,
        outcome: "AGGRESSOR_WIN",
        isFirstBlood: true,
      }).totalWolo,
      53,
    );
  },
);

test(
  "defaults, Gravity, and voids always calculate zero battle reward",
  () => {
    for (const kind of [
      "DEFENSE_DEFAULT",
      "DEFENDER_NO_START_DEFAULT",
      "GRAVITY_MOVE",
      "TECHNICAL_VOID",
      "SYSTEM_VOID",
      "MUTUAL_NO_START",
      "CHALLENGER_ABANDONMENT",
    ] as const) {
      assert.deepEqual(
        calculateWarGraphRewards({ kind }),
        {
          ok: true,
          awards: [],
          totalWolo: 0,
        },
      );
    }
  },
);

test(
  "reward math fails closed for invalid config or impossible First Blood",
  () => {
    assert.deepEqual(
      calculateWarGraphRewards(
        {
          kind: "VERIFIED_BATTLE",
          aggressorLayer: 3,
          defenderLayer: 2,
          outcome: "AGGRESSOR_WIN",
          isFirstBlood: false,
        },
        {
          frontierToRingII: 1.5,
          ringIIToRingI: 2,
          firstBlood: 3,
          crownBattleWinner: 50,
        },
      ),
      {
        ok: false,
        reason: "INVALID_REWARD_CONFIGURATION",
        awards: [],
        totalWolo: 0,
      },
    );

    assert.deepEqual(
      calculateWarGraphRewards({
        kind: "VERIFIED_BATTLE",
        aggressorLayer: 3,
        defenderLayer: 2,
        outcome: "AGGRESSOR_WIN",
        isFirstBlood: true,
      }),
      {
        ok: false,
        reason: "INELIGIBLE_GRAPH_STATE_AT_START",
        awards: [],
        totalWolo: 0,
      },
    );
  },
);
