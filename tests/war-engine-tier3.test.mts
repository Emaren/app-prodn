import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWarEngineTier3Candidate,
  WAR_ENGINE_TIER3_ENGINE,
} from "../lib/warEngineTier3.ts";

type PacketArgs = {
  identity: string;
  at: number;
  player: number;
  type?: string;
  objectIds?: number[];
};

function packet({
  identity,
  at,
  player,
  type = "order",
  objectIds = [],
}: PacketArgs) {
  return {
    packet_identity_sha256:
      identity,
    timestamp_ms:
      at,
    type,
    payload: {
      player_id:
        player,
      object_ids:
        objectIds,
    },
  };
}

function candidate(
  duration: number,
  stream: unknown[],
  options: {
    resultTrusted?: boolean;
    resignations?: unknown[];
  } = {}
) {
  return {
    projection: {
      duration,
      players: [
        {
          number: 1,
          name: "Emaren",
        },
        {
          number: 2,
          name: "Julio Alvarez",
        },
      ],
      key_events: {
        result_resolution: {
          result_status:
            options.resultTrusted
              ? "resolved"
              : "review_required",
          result_trusted:
            options.resultTrusted ??
            false,
        },
      },
    },
    actions: {
      stream,
      raw_resignation_timeline:
        options.resignations ??
        [],
    },
  };
}

function collapsePackets() {
  const deletes = [
    4_608_916,
    4_615_736,
    4_617_872,
    4_620_796,
    4_623_046,
    4_628_512,
    4_631_168,
    4_632_614,
  ].map(
    (at, index) =>
      packet({
        identity:
          `emaren-delete-${index}`,
        at,
        player: 1,
        type: "delete",
        objectIds: [
          10_000 + index,
        ],
      })
  );

  const julio = [
    packet({
      identity:
        "julio-terminal-1",
      at: 4_603_000,
      player: 2,
    }),
    packet({
      identity:
        "julio-terminal-2",
      at: 4_617_000,
      player: 2,
    }),
    packet({
      identity:
        "julio-terminal-3",
      at: 4_629_176,
      player: 2,
    }),
  ];

  return [
    ...deletes,
    ...julio,
  ];
}

test(
  "Tier 3 engine identity is stable and explicitly non-authoritative",
  () => {
    assert.deepEqual(
      WAR_ENGINE_TIER3_ENGINE,
      {
        tier: 3,
        engineName:
          "aoe2war.fast_verdict",
        engineVersion:
          "1.0.0",
      }
    );
  }
);

test(
  "duplicate replay packets cannot change a Tier-3 verdict",
  () => {
    const original =
      collapsePackets();

    const duplicated = [
      ...original,
      {
        ...original[0],
      },
      {
        ...original[2],
      },
      {
        ...original[
          original.length - 1
        ],
      },
    ];

    const left =
      classifyWarEngineTier3Candidate(
        candidate(
          4_634,
          original
        )
      );

    const right =
      classifyWarEngineTier3Candidate(
        candidate(
          4_634,
          duplicated
        )
      );

    assert.equal(
      left.classification,
      "likely_outcome"
    );

    assert.equal(
      right.classification,
      left.classification
    );

    assert.deepEqual(
      right.winningPlayerNumbers,
      left.winningPlayerNumbers
    );

    assert.deepEqual(
      right.winningPlayerNames,
      left.winningPlayerNames
    );

    assert.deepEqual(
      right.metricsByPlayer,
      left.metricsByPlayer
    );

    assert.equal(
      right.uniquePacketCount,
      left.uniquePacketCount
    );

    assert.equal(
      right.rawPacketCount,
      left.rawPacketCount + 3
    );
  }
);

test(
  "81-second and 82-second unresolved founding-shaped recordings classify as aborted battles",
  () => {
    for (
      const duration
      of [81, 82]
    ) {
      const verdict =
        classifyWarEngineTier3Candidate(
          candidate(
            duration,
            [
              packet({
                identity:
                  `${duration}-p1`,
                at: 40_000,
                player: 1,
              }),
              packet({
                identity:
                  `${duration}-p2`,
                at: 59_000,
                player: 2,
              }),
            ]
          )
        );

      assert.equal(
        verdict.classification,
        "aborted_battle"
      );

      assert.equal(
        verdict.reasonCode,
        "recording_ended_before_two_minutes"
      );

      assert.equal(
        verdict.winnerConfidenceBps,
        null
      );

      assert.deepEqual(
        verdict
          .winningPlayerNumbers,
        []
      );
    }
  }
);

test(
  "5003-shaped terminal self-delete evidence yields only a likely Julio outcome",
  () => {
    const verdict =
      classifyWarEngineTier3Candidate(
        candidate(
          4_634,
          collapsePackets()
        )
      );

    assert.equal(
      verdict.classification,
      "likely_outcome"
    );

    assert.deepEqual(
      verdict.winningPlayerNumbers,
      [2]
    );

    assert.deepEqual(
      verdict.winningPlayerNames,
      ["Julio Alvarez"]
    );

    assert.equal(
      verdict
        .collapsingPlayerNumber,
      1
    );

    assert.equal(
      verdict
        .metricsByPlayer["1"]
        ?.terminalDeleteCommands,
      8
    );

    assert.equal(
      verdict
        .metricsByPlayer["1"]
        ?.terminalDeletedObjectCount,
      8
    );

    assert.equal(
      verdict.winnerConfidenceBps,
      8000
    );

    assert.equal(
      verdict.resultTrusted,
      false
    );
  }
);

test(
  "active unresolved recordings without a terminal-collapse signature remain inconclusive",
  () => {
    const verdict =
      classifyWarEngineTier3Candidate(
        candidate(
          3_026,
          [
            packet({
              identity:
                "emaren-active",
              at: 2_999_348,
              player: 1,
            }),
            packet({
              identity:
                "julio-active-1",
              at: 3_000_000,
              player: 2,
            }),
            packet({
              identity:
                "julio-active-2",
              at: 3_010_000,
              player: 2,
            }),
            packet({
              identity:
                "julio-active-3",
              at: 3_017_788,
              player: 2,
            }),
          ]
        )
      );

    assert.equal(
      verdict.classification,
      "inconclusive_recording"
    );

    assert.deepEqual(
      verdict.winningPlayerNumbers,
      []
    );

    assert.equal(
      verdict.winnerConfidenceBps,
      null
    );
  }
);

test(
  "every Tier-3 classification is candidate-only and has zero result, aggregate, or betting authority",
  () => {
    const verdicts = [
      classifyWarEngineTier3Candidate(
        candidate(
          81,
          []
        )
      ),

      classifyWarEngineTier3Candidate(
        candidate(
          3_026,
          [
            packet({
              identity: "a",
              at: 3_000_000,
              player: 1,
            }),
            packet({
              identity: "b",
              at: 3_010_000,
              player: 2,
            }),
          ]
        )
      ),

      classifyWarEngineTier3Candidate(
        candidate(
          4_634,
          collapsePackets()
        )
      ),
    ];

    for (
      const verdict
      of verdicts
    ) {
      assert.equal(
        verdict.candidateOnly,
        true
      );

      assert.equal(
        verdict.affectsPublicAggregates,
        false
      );

      assert.equal(
        verdict.affectsBets,
        false
      );

      assert.equal(
        verdict.resultTrusted,
        false
      );
    }
  }
);

test(
  "Tier 3 refuses candidates that already contain trusted standard-parser result truth",
  () => {
    assert.throws(
      () =>
        classifyWarEngineTier3Candidate(
          candidate(
            3_000,
            [],
            {
              resultTrusted:
                true,
            }
          )
        ),
      /WAR_ENGINE_TIER3_PRECONDITION_RESULT_ALREADY_TRUSTED/
    );
  }
);

test(
  "Tier 3 refuses to reinterpret raw resignation evidence owned by the standard parser",
  () => {
    assert.throws(
      () =>
        classifyWarEngineTier3Candidate(
          candidate(
            3_000,
            [],
            {
              resignations: [
                {
                  player_number:
                    1,
                  timestamp_ms:
                    2_999_000,
                },
              ],
            }
          )
        ),
      /WAR_ENGINE_TIER3_PRECONDITION_RESIGNATION_EVIDENCE_PRESENT/
    );
  }
);
