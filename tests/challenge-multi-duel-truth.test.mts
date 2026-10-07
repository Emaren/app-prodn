import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  challengeDirectionKey,
  challengePairKey,
  challengePairQueueLeader,
  challengePairQueueLeaders,
} from "../lib/challengePairQueue.ts";
import {
  canChallengeWinnerResolveMarketReview,
  inferWinnerSideFromChallenge,
} from "../lib/bets.ts";
import type {
  ScheduledMatchTile,
} from "../lib/challenges.ts";

function read(path: string) {
  return readFileSync(
    new URL(
      `../${path}`,
      import.meta.url,
    ),
    "utf8",
  );
}

test(
  "Challenge pair queue is unordered by pair but directional for issuance",
  () => {
    assert.equal(
      challengePairKey(
        20,
        10,
      ),
      "10:20",
    );

    assert.equal(
      challengePairKey(
        10,
        20,
      ),
      "10:20",
    );

    assert.equal(
      challengeDirectionKey(
        10,
        20,
      ),
      "10:20",
    );

    assert.equal(
      challengeDirectionKey(
        20,
        10,
      ),
      "20:10",
    );
  },
);

test(
  "oldest reverse-direction Challenge owns the next verified duel",
  () => {
    const rows = [
      {
        id: 39,
        challengerUserId: 10,
        challengedUserId: 20,
        createdAt:
          "2026-10-06T23:10:00.000Z",
      },
      {
        id: 38,
        challengerUserId: 20,
        challengedUserId: 10,
        createdAt:
          "2026-10-06T22:10:00.000Z",
      },
      {
        id: 40,
        challengerUserId: 30,
        challengedUserId: 10,
        createdAt:
          "2026-10-06T22:05:00.000Z",
      },
    ];

    assert.equal(
      challengePairQueueLeader(
        rows.slice(
          0,
          2,
        ),
      )?.id,
      38,
    );

    const leaders =
      challengePairQueueLeaders(
        rows,
      );

    assert.equal(
      leaders.get(
        "10:20",
      )?.id,
      38,
    );

    assert.equal(
      leaders.get(
        "10:30",
      )?.id,
      40,
    );
  },
);

test(
  "ordinary Watcher reconciliation queues reverse Challenges instead of declaring pair ambiguity",
  () => {
    const source =
      read(
        "lib/challenges.ts",
      );

    assert.match(
      source,
      /challengePairQueueLeaders/,
    );

    assert.match(
      source,
      /openPairCanClaimNextSession/,
    );

    assert.match(
      source,
      /unlinkedFundedOpenPairLeaders/,
    );

    assert.doesNotMatch(
      source,
      /unlinkedFundedOpenPairCounts/,
    );

    assert.doesNotMatch(
      source,
      /openPairIsUnambiguous/,
    );

    assert.match(
      source,
      /allowOpenPlayAnytimeCorrelation:\s*openPairCanClaimNextSession/,
    );
  },
);

test(
  "championship Watcher reconciliation keeps later reverse Challenges alive",
  () => {
    const source =
      read(
        "lib/championshipChallenges.ts",
      );

    assert.match(
      source,
      /compareChampionshipQueueOrder/,
    );

    assert.match(
      source,
      /const queueLeader =/,
    );

    assert.match(
      source,
      /The session was won by an older queue entry/,
    );

    assert.doesNotMatch(
      source,
      /if\(explicitClaims\.length>1\)continue/,
    );

    assert.doesNotMatch(
      source,
      /eligibleMatches\.length>1/,
    );
  },
);

test(
  "same-direction Challenge issuance is single-flight while reverse direction remains a separate key",
  () => {
    const legacyRoute =
      read(
        "app/api/challenges/route.ts",
      );

    const championship =
      read(
        "lib/championshipChallenges.ts",
      );

    assert.match(
      legacyRoute,
      /challenge-direction:\$\{viewer\.id\}:\$\{challenged\.id\}/,
    );

    assert.match(
      legacyRoute,
      /CHALLENGE_DIRECTION_ALREADY_ACTIVE/,
    );

    assert.match(
      championship,
      /championship-direction:\$\{creator\.id\}:\$\{rival\.id\}/,
    );

    assert.match(
      championship,
      /already have an active Challenge to/,
    );
  },
);

test(
  "chat payload and UI preserve every concurrent pair Challenge",
  () => {
    const inbox =
      read(
        "lib/contactInbox.ts",
      );

    const types =
      read(
        "components/contact/types.ts",
      );

    const panel =
      read(
        "components/contact/ContactInboxPanel.tsx",
      );

    assert.match(
      inbox,
      /activeChallenges:\s*ScheduledMatchTile\[\]/,
    );

    assert.match(
      inbox,
      /loadChallengeThreadTiles/,
    );

    assert.match(
      types,
      /activeChallenges:\s*ScheduledMatchTile\[\]/,
    );

    assert.match(
      panel,
      /oldest duel resolves first/,
    );

    assert.match(
      panel,
      /challenges\.map/,
    );

    assert.match(
      panel,
      /stacked=\{\s*challenges\.length\s*>\s*1\s*\}/,
    );
  },
);

test(
  "completed Challenge presentation is dead while active Challenges retain live color",
  () => {
    const card =
      read(
        "components/challenge/ScheduledMatchCard.tsx",
      );

    const championship =
      read(
        "components/challenge/ChallengeChampionshipState.tsx",
      );

    const chat =
      read(
        "components/contact/ContactInboxPanel.tsx",
      );

    assert.match(
      card,
      /case "completed":[\s\S]*border-rose-950/,
    );

    assert.match(
      championship,
      /terminal \? "border-rose-950/,
    );

    assert.match(
      championship,
      /dense = false/,
    );

    assert.match(
      chat,
      /case "result_ready":[\s\S]*case "settled":[\s\S]*border-rose-950/,
    );
  },
);

test(
  "Live Games Challenge rail contains active obligations only",
  () => {
    const source =
      read(
        "lib/challenges.ts",
      );

    const liveBoard =
      source.match(
        /export async function loadScheduledMatchTilesForLiveBoard[\s\S]*?(?=\nexport async function loadChallengeThreadTiles)/,
      )?.[0] ??
      "";

    assert.match(
      liveBoard,
      /tiles:\s*activeTiles/,
    );

    assert.match(
      liveBoard,
      /matchedCompletedSessionKeys:\s*new Set<string>\(\)/,
    );

    assert.doesNotMatch(
      liveBoard,
      /recentResolvedTiles/,
    );
  },
);

test(
  "Challenge betting holds unresolved result liability under review instead of settling or disappearing",
  () => {
    const source =
      read(
        "lib/bets.ts",
      );

    const statusHelper =
      source.match(
        /function marketStatusFromScheduledMatch[\s\S]*?\n\}/,
      )?.[0] ??
      "";

    assert.match(
      statusHelper,
      /result_pending/,
    );

    assert.match(
      statusHelper,
      /desync_review/,
    );

    assert.match(
      statusHelper,
      /return "under_review"/,
    );

    const challengeSeeds =
      source.match(
        /function buildChallengeMarketSeeds[\s\S]*?(?=\n\nfunction claimPlayerNameForUser)/,
      )?.[0] ??
      "";

    assert.match(
      challengeSeeds,
      /"result_pending"/,
    );

    assert.match(
      challengeSeeds,
      /"desync_review"/,
    );
  },
);

test(
  "durable ScheduledMatch winner authority resolves Challenge bet side even without linked replay winner text",
  () => {
    const base = {
      protocol: {
        resultWinnerUid:
          "jim",
      },
      challenger: {
        uid:
          "emaren",
        name:
          "Emaren",
        inGameName:
          "Emaren",
        steamPersonaName:
          null,
      },
      challenged: {
        uid:
          "jim",
        name:
          "Jim",
        inGameName:
          "Jim",
        steamPersonaName:
          null,
      },
      linkedWinner:
        null,
    } as unknown as ScheduledMatchTile;

    assert.equal(
      inferWinnerSideFromChallenge(
        base,
      ),
      "right",
    );

    assert.equal(
      inferWinnerSideFromChallenge({
        ...base,
        protocol: {
          ...base.protocol,
          resultWinnerUid:
            "emaren",
        },
      }),
      "left",
    );
  },
);

test(
  "Challenge result review releases only when winner authority arrives on a verified clean proposition",
  () => {
    assert.equal(
      canChallengeWinnerResolveMarketReview({
        existingStatus:
          "under_review",
        scheduledMatchId:
          39,
        seedStatus:
          "settled",
        winnerSide:
          "right",
        integrityStatus:
          "verified",
        integrityReason:
          null,
        commissionerReviewState:
          null,
      }),
      true,
    );

    assert.equal(
      canChallengeWinnerResolveMarketReview({
        existingStatus:
          "under_review",
        scheduledMatchId:
          39,
        seedStatus:
          "settled",
        winnerSide:
          "right",
        integrityStatus:
          "under_review",
        integrityReason:
          "roster_changed_after_stake",
        commissionerReviewState:
          null,
      }),
      false,
    );

    assert.equal(
      canChallengeWinnerResolveMarketReview({
        existingStatus:
          "under_review",
        scheduledMatchId:
          39,
        seedStatus:
          "settled",
        winnerSide:
          null,
        integrityStatus:
          "verified",
        integrityReason:
          null,
        commissionerReviewState:
          null,
      }),
      false,
    );
  },
);
