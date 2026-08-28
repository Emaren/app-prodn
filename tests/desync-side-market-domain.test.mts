import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DESYNC_MARKET_REVIEW_GRACE_MINUTES,
  DESYNC_SIDE_MARKET_LEFT_LABEL,
  DESYNC_SIDE_MARKET_RIGHT_LABEL,
  DESYNC_SIDE_MARKET_TYPE,
  buildDesyncSideMarketSlug,
  desyncReviewDeadlineMs,
  isDesyncSideMarketType,
  nestDesyncSideMarkets,
  resolveDesyncSideMarketWinner,
  winnerSlugFromDesyncSideMarketSlug,
} from "../lib/desyncSideMarket.ts";


test(
  "desync propositions are nested under one stable parent and never emitted as rows",
  () => {
    const grouped = nestDesyncSideMarkets([
      {
        id: 12,
        parentMarketId: 1,
        slug: "desync-watcher-live-one",
        marketType: "desync",
        linkedSessionKey: "platform:one",
        label: "YES / NO",
      },
      {
        id: 1,
        parentMarketId: null,
        slug: "watcher-live-one",
        marketType: "winner",
        linkedSessionKey: "platform:one",
        label: "Alice vs Bob",
      },
      {
        id: 2,
        parentMarketId: null,
        slug: "watcher-live-two",
        marketType: "winner",
        linkedSessionKey: "platform:two",
        label: "Carol vs Dan",
      },
      {
        id: 13,
        parentMarketId: null,
        slug: "desync-watcher-live-two",
        marketType: "desync",
        linkedSessionKey: "platform:two",
        label: "YES / NO",
      },
      {
        id: 99,
        parentMarketId: 404,
        slug: "desync-orphan",
        marketType: "desync",
        linkedSessionKey: "platform:orphan",
        label: "orphan",
      },
    ]);

    assert.deepEqual(
      grouped.map((market) => market.id),
      [1, 2],
    );
    assert.equal(grouped[0].desyncMarket?.id, 12);
    assert.equal(grouped[1].desyncMarket?.id, 13);
    assert.equal(
      grouped.some((market) => market.marketType === "desync"),
      false,
    );
  },
);


test(
  "desync side-market constants are explicit",
  () => {
    assert.equal(
      DESYNC_SIDE_MARKET_TYPE,
      "desync"
    );

    assert.equal(
      DESYNC_SIDE_MARKET_LEFT_LABEL,
      "NO"
    );

    assert.equal(
      DESYNC_SIDE_MARKET_RIGHT_LABEL,
      "YES"
    );

    assert.equal(
      DEFAULT_DESYNC_MARKET_REVIEW_GRACE_MINUTES,
      10
    );
  }
);


test(
  "desync market slug is deterministic and reversible",
  () => {
    assert.equal(
      buildDesyncSideMarketSlug(
        "watcher-live-abc123"
      ),
      "desync-watcher-live-abc123"
    );

    assert.equal(
      buildDesyncSideMarketSlug(
        "desync-watcher-live-abc123"
      ),
      "desync-watcher-live-abc123"
    );

    assert.equal(
      winnerSlugFromDesyncSideMarketSlug(
        "desync-watcher-live-abc123"
      ),
      "watcher-live-abc123"
    );

    assert.equal(
      winnerSlugFromDesyncSideMarketSlug(
        "watcher-live-abc123"
      ),
      null
    );
  }
);


test(
  "market type discriminator is exact",
  () => {
    assert.equal(
      isDesyncSideMarketType(
        "desync"
      ),
      true
    );

    assert.equal(
      isDesyncSideMarketType(
        "winner"
      ),
      false
    );

    assert.equal(
      isDesyncSideMarketType(
        null
      ),
      false
    );
  }
);


test(
  "human-confirmed desync immediately resolves YES",
  () => {
    assert.equal(
      resolveDesyncSideMarketWinner({
        desyncOccurred:
          true,

        parentStatus:
          "under_review",

        parentWinnerSide:
          null,

        parentSettledAtMs:
          null,

        nowMs:
          1,
      }),
      "right"
    );
  }
);


test(
  "an explicit human false correction immediately resolves NO",
  () => {
    assert.equal(
      resolveDesyncSideMarketWinner({
        desyncOccurred:
          false,

        humanDesyncDecisionPresent:
          true,

        parentStatus:
          "live",

        parentWinnerSide:
          null,

        parentSettledAtMs:
          null,

        nowMs:
          1,
      }),
      "left"
    );
  }
);


test(
  "absence of desync truth never resolves NO before safe competitive finality",
  () => {
    assert.equal(
      resolveDesyncSideMarketWinner({
        desyncOccurred:
          false,

        humanDesyncDecisionPresent:
          false,

        parentStatus:
          "live",

        parentWinnerSide:
          null,

        parentSettledAtMs:
          null,

        nowMs:
          1_000_000,
      }),
      null
    );

    assert.equal(
      resolveDesyncSideMarketWinner({
        desyncOccurred:
          false,

        humanDesyncDecisionPresent:
          false,

        parentStatus:
          "under_review",

        parentWinnerSide:
          null,

        parentSettledAtMs:
          null,

        nowMs:
          1_000_000,
      }),
      null
    );
  }
);


test(
  "NO remains unresolved during the human review grace window",
  () => {
    const settledAt =
      1_000_000;

    const deadline =
      desyncReviewDeadlineMs(
        settledAt,
        10
      );

    assert.equal(
      resolveDesyncSideMarketWinner({
        desyncOccurred:
          false,

        parentStatus:
          "settled",

        parentWinnerSide:
          "left",

        parentSettledAtMs:
          settledAt,

        nowMs:
          deadline - 1,

        reviewGraceMinutes:
          10,
      }),
      null
    );
  }
);


test(
  "safe competitive finality plus expired review window resolves NO",
  () => {
    const settledAt =
      1_000_000;

    const deadline =
      desyncReviewDeadlineMs(
        settledAt,
        10
      );

    for (
      const parentWinnerSide of
      [
        "left",
        "right",
      ]
    ) {
      assert.equal(
        resolveDesyncSideMarketWinner({
          desyncOccurred:
            false,

          parentStatus:
            "settled",

          parentWinnerSide,

          parentSettledAtMs:
            settledAt,

          nowMs:
            deadline,

          reviewGraceMinutes:
            10,
        }),
        "left"
      );
    }
  }
);
