import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAMPIONSHIP_CHALLENGE_WINDOW_MS,
  CHAMPIONSHIP_COMMISSIONER_GRACE_MS,
} from "../lib/challengeChampionshipProtocol.ts";
import { reconcileChampionshipEvidence } from "../lib/championshipChallenges.ts";

test("championship reconciliation requests scoped evidence for the full challenge plus Commissioner hour", async () => {
  let received:
    | { evidenceLookbackMs?: number; evidenceParticipantUids?: readonly string[] }
    | undefined;
  const loadSnapshot = async (
    _prisma: unknown,
    options?: { evidenceLookbackMs?: number; evidenceParticipantUids?: readonly string[] }
  ) => {
    received = options;
    return { activeSessions: [], recentlyCompletedSessions: [] };
  };

  const prisma = {
    championshipChallenge: {
      findMany: async () => [
        {
          participants: [
            { uidSnapshot: "challenger-uid" },
            { uidSnapshot: "defender-uid" },
          ],
        },
      ],
    },
  };

  const resolved = await reconcileChampionshipEvidence(
    prisma as never,
    {},
    { loadSnapshot: loadSnapshot as never }
  );

  assert.deepEqual(resolved, []);
  assert.equal(
    received?.evidenceLookbackMs,
    CHAMPIONSHIP_CHALLENGE_WINDOW_MS + CHAMPIONSHIP_COMMISSIONER_GRACE_MS
  );
  assert.deepEqual(received?.evidenceParticipantUids, [
    "challenger-uid",
    "defender-uid",
  ]);
});
