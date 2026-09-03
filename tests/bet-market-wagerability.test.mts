import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFreshBetMarketWriteWhere,
  freshBettingCloseReason,
  isFreshBetMarketWagerable,
} from "../lib/betMarketWagerability.ts";

const NOW =
  new Date(
    "2026-09-03T21:00:00.000Z"
  );

test(
  "plain manual open market remains fresh-bettable",
  () => {
    assert.equal(
      isFreshBetMarketWagerable(
        {
          marketType: "winner",
          status: "open",
          closeAt: null,
          linkedSessionKey: null,
          scheduledMatchId: null,
        },
        NOW
      ),
      true
    );
  }
);

test(
  "scheduled winner market is bettable strictly before cutoff",
  () => {
    assert.equal(
      isFreshBetMarketWagerable(
        {
          marketType: "winner",
          status: "open",
          closeAt:
            new Date(
              "2026-09-03T21:00:01.000Z"
            ),
          linkedSessionKey: null,
          scheduledMatchId: 42,
        },
        NOW
      ),
      true
    );
  }
);

test(
  "scheduled winner market closes at the exact cutoff",
  () => {
    const market = {
      marketType: "winner",
      status: "open",
      closeAt: NOW,
      linkedSessionKey: null,
      scheduledMatchId: 42,
    };

    assert.equal(
      isFreshBetMarketWagerable(
        market,
        NOW
      ),
      false
    );

    assert.equal(
      freshBettingCloseReason(
        market,
        NOW
      ),
      "scheduled_cutoff_reached"
    );
  }
);

test(
  "scheduled winner market remains closed after cutoff",
  () => {
    assert.equal(
      freshBettingCloseReason(
        {
          marketType: "winner",
          status: "open",
          closeAt:
            new Date(
              "2026-09-03T20:59:59.000Z"
            ),
          linkedSessionKey: null,
          scheduledMatchId: 42,
        },
        NOW
      ),
      "scheduled_cutoff_reached"
    );
  }
);

test(
  "scheduled live winner market rejects a fresh stake",
  () => {
    assert.equal(
      freshBettingCloseReason(
        {
          marketType: "winner",
          status: "live",
          closeAt: NOW,
          linkedSessionKey:
            "scheduled-session",
          scheduledMatchId: 42,
        },
        NOW
      ),
      "market_not_open"
    );
  }
);

test(
  "watcher-discovered unscheduled battle can never open a fresh book",
  () => {
    for (const status of [
      "open",
      "live",
    ]) {
      assert.equal(
        freshBettingCloseReason(
          {
            marketType: "winner",
            status,
            closeAt: null,
            linkedSessionKey:
              "watcher-session-123",
            scheduledMatchId: null,
          },
          NOW
        ),
        "watcher_battle_already_started"
      );
    }
  }
);

test(
  "Desync cannot become a post-start betting loophole",
  () => {
    for (const status of [
      "open",
      "live",
    ]) {
      assert.equal(
        isFreshBetMarketWagerable(
          {
            marketType: "desync",
            status,
            linkedSessionKey:
              "watcher-session-123",
          },
          NOW
        ),
        false
      );
    }
  }
);

test(
  "unknown proposition types fail closed",
  () => {
    assert.equal(
      freshBettingCloseReason(
        {
          marketType:
            "future_live_market",
          status:
            "open",
          closeAt:
            null,
          linkedSessionKey:
            null,
          scheduledMatchId:
            null,
        },
        NOW
      ),
      "market_type_not_wagerable"
    );
  }
);

test(
  "scheduled market without authoritative cutoff fails closed",
  () => {
    assert.equal(
      freshBettingCloseReason(
        {
          marketType: "winner",
          status: "open",
          closeAt: null,
          scheduledMatchId: 42,
        },
        NOW
      ),
      "scheduled_cutoff_missing"
    );
  }
);

test(
  "invalid explicit cutoff fails closed",
  () => {
    assert.equal(
      freshBettingCloseReason(
        {
          marketType: "winner",
          status: "open",
          closeAt: "not-a-date",
        },
        NOW
      ),
      "scheduled_cutoff_invalid"
    );
  }
);

test(
  "closing proof review and terminal states never admit fresh money",
  () => {
    for (const status of [
      "closing",
      "awaiting_final_proof",
      "under_review",
      "settled",
      "voided",
    ]) {
      assert.equal(
        isFreshBetMarketWagerable(
          {
            marketType: "winner",
            status,
          },
          NOW
        ),
        false,
        status
      );
    }
  }
);

test(
  "database write guard carries the same exact-start law",
  () => {
    const serialized =
      JSON.stringify(
        buildFreshBetMarketWriteWhere(
          NOW
        )
      );

    assert.match(
      serialized,
      /"status":"open"/
    );

    assert.match(
      serialized,
      /"marketType":"winner"/
    );

    assert.match(
      serialized,
      /"scheduledMatchId":\{"not":null\}/
    );

    assert.match(
      serialized,
      /"closeAt":\{"gt":"2026-09-03T21:00:00\.000Z"\}/
    );

    assert.match(
      serialized,
      /"linkedSessionKey":null/
    );
  }
);
