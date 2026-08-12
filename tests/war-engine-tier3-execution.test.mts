import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildWarEngineTier3RunIdentity,
  resolveWarEngineTier3StableWinner,
  warEngineTier3PersistenceConfidence,
  warEngineTier3PublicCopy,
} from "../lib/warEngineTier3Execution.ts";

import {
  classifyWarEngineTier3Candidate,
} from "../lib/warEngineTier3.ts";

function packet(
  identity: string,
  at: number,
  player: number,
  type = "order",
  objectIds: number[] = []
) {
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

function collapseCandidate() {
  const deletes =
    Array.from(
      { length: 8 },
      (_, index) =>
        packet(
          `delete-${index}`,
          4_608_000 +
            index * 3_000,
          1,
          "delete",
          [10_000 + index]
        )
    );

  return {
    projection: {
      duration: 4_634,
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
      team_resolution: {
        teams: [
          {
            players: [
              "Emaren",
            ],
            team_id:
              "steam:76561198065420384",
            player_keys: [
              "steam:76561198065420384",
            ],
          },
          {
            players: [
              "Julio Alvarez",
            ],
            team_id:
              "steam:76561198190973517",
            player_keys: [
              "steam:76561198190973517",
            ],
          },
        ],
      },
      key_events: {
        result_resolution: {
          result_status:
            "review_required",
          result_trusted:
            false,
          winning_player_keys:
            [],
          winning_team_id:
            null,
        },
      },
    },

    actions: {
      stream: [
        ...deletes,
        packet(
          "julio-1",
          4_610_000,
          2
        ),
        packet(
          "julio-2",
          4_620_000,
          2
        ),
        packet(
          "julio-3",
          4_629_176,
          2
        ),
      ],
      raw_resignation_timeline:
        [],
    },
  };
}

test(
  "Tier-3 run identity is deterministic and changes when its immutable input changes",
  () => {
    const base = {
      caseId: 7,
      gameStatsId: 5003,
      sourceParseRunId: 4958,
      sourceParseRunIdentityHash:
        "a".repeat(64),
      inputHash:
        "b".repeat(64),
      engineName:
        "aoe2war.fast_verdict",
      engineVersion:
        "1.0.0",
    };

    const first =
      buildWarEngineTier3RunIdentity(
        base
      );

    const second =
      buildWarEngineTier3RunIdentity(
        { ...base }
      );

    const changed =
      buildWarEngineTier3RunIdentity({
        ...base,
        inputHash:
          "c".repeat(64),
      });

    assert.equal(
      first,
      second
    );

    assert.notEqual(
      first,
      changed
    );

    assert.match(
      first,
      /^[0-9a-f]{64}$/
    );
  }
);

test(
  "likely Julio outcome resolves to the canonical Steam team/player key",
  () => {
    const candidate =
      collapseCandidate();

    const verdict =
      classifyWarEngineTier3Candidate(
        candidate
      );

    assert.equal(
      verdict.classification,
      "likely_outcome"
    );

    assert.deepEqual(
      resolveWarEngineTier3StableWinner(
        candidate,
        verdict
      ),
      {
        winningTeamKey:
          "steam:76561198190973517",
        winningPlayerKeys: [
          "steam:76561198190973517",
        ],
      }
    );
  }
);

test(
  "winner confidence alone is eligible for DB/public confidence",
  () => {
    const likely =
      classifyWarEngineTier3Candidate(
        collapseCandidate()
      );

    assert.equal(
      warEngineTier3PersistenceConfidence(
        likely
      ),
      8000
    );

    const aborted =
      classifyWarEngineTier3Candidate({
        projection: {
          duration: 82,
          players: [],
          key_events: {
            result_resolution: {
              result_status:
                "review_required",
              result_trusted:
                false,
            },
          },
        },
        actions: {
          stream: [],
          raw_resignation_timeline:
            [],
        },
      });

    assert.equal(
      warEngineTier3PersistenceConfidence(
        aborted
      ),
      null
    );
  }
);

test(
  "public copy does not overstate Tier-3 authority",
  () => {
    const verdict =
      classifyWarEngineTier3Candidate(
        collapseCandidate()
      );

    const copy =
      warEngineTier3PublicCopy(
        verdict
      );

    assert.equal(
      copy.publicLabel,
      "LIKELY OUTCOME"
    );

    assert.match(
      copy.publicDetail,
      /strongly favors Julio Alvarez/
    );

    assert.match(
      copy.publicDetail,
      /no official result was encoded/
    );
  }
);

test(
  "executor mutation surface is exactly the two append-only War Engine writes",
  () => {
    const source =
      readFileSync(
        "scripts/execute-war-engine-tier3.mts",
        "utf8"
      );

    const mutations = [
      ...source.matchAll(
        /\.\s*([A-Za-z][A-Za-z0-9_]*)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g
      ),
    ].map(
      (match) =>
        `${match[1]}.${match[2]}`
    );

    assert.deepEqual(
      mutations.sort(),
      [
        "warEngineCaseEvent.create",
        "warEngineRun.create",
      ]
    );

    /*
     * Raw SQL is forbidden here as well so the exact delegate
     * mutation gate cannot be bypassed.
     */
    assert.doesNotMatch(
      source,
      /\$(?:executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe)\b/
    );
  }
);
