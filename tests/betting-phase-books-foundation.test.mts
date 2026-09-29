import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS,
  authoritativeBetBookPhase,
  buildBetPhaseBookKey,
  phaseBookWindowContains,
  planBetPhaseBookWindows,
  readBetPhaseBooksV2Runtime,
} from "../lib/betPhaseBooks.ts";

const START = new Date("2026-09-29T21:00:00.000Z");

test("phase book identity is deterministic and phase-isolated", () => {
  const common = {
    authorityIdentityKey: "battle:platform:123456",
    marketType: "winner",
  };

  const pre = buildBetPhaseBookKey({ ...common, phase: "pre_game" });
  const opening = buildBetPhaseBookKey({ ...common, phase: "opening_minute" });
  const late = buildBetPhaseBookKey({ ...common, phase: "late" });

  assert.equal(
    pre,
    buildBetPhaseBookKey({ ...common, phase: "pre_game" })
  );
  assert.notEqual(pre, opening);
  assert.notEqual(opening, late);
  assert.notEqual(pre, late);
  assert.match(pre, /^phase-v2:pre_game:[0-9a-f]{48}$/);
  assert.ok(pre.length <= 255);
});

test("phase windows are server-owned and exactly isolate the opening minute", () => {
  const preOpen = new Date("2026-09-29T20:00:00.000Z");
  const terminal = new Date("2026-09-29T21:42:00.000Z");
  const windows = planBetPhaseBookWindows({
    battleStartAt: START,
    preGameOpensAt: preOpen,
    battleTerminalAt: terminal,
  });

  assert.deepEqual(
    windows.map((window) => ({
      phase: window.phase,
      opensAt: window.opensAt?.toISOString() ?? null,
      closesAt: window.closesAt?.toISOString() ?? null,
    })),
    [
      {
        phase: "pre_game",
        opensAt: preOpen.toISOString(),
        closesAt: START.toISOString(),
      },
      {
        phase: "opening_minute",
        opensAt: START.toISOString(),
        closesAt: new Date(
          START.getTime() + BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS
        ).toISOString(),
      },
      {
        phase: "late",
        opensAt: new Date(
          START.getTime() + BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS
        ).toISOString(),
        closesAt: terminal.toISOString(),
      },
    ]
  );

  const opening = windows[1]!;
  assert.equal(phaseBookWindowContains(opening, START), true);
  assert.equal(
    phaseBookWindowContains(
      opening,
      new Date(START.getTime() + BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS - 1)
    ),
    true
  );
  assert.equal(
    phaseBookWindowContains(
      opening,
      new Date(START.getTime() + BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS)
    ),
    false
  );
});

test("authoritative phase classifier uses server time and battle activity", () => {
  assert.equal(
    authoritativeBetBookPhase({
      now: new Date(START.getTime() - 1),
      battleStartAt: START,
      battleActive: false,
    }),
    "pre_game"
  );

  assert.equal(
    authoritativeBetBookPhase({
      now: START,
      battleStartAt: START,
      battleActive: true,
    }),
    "opening_minute"
  );

  assert.equal(
    authoritativeBetBookPhase({
      now: new Date(
        START.getTime() + BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS - 1
      ),
      battleStartAt: START,
      battleActive: true,
    }),
    "opening_minute"
  );

  assert.equal(
    authoritativeBetBookPhase({
      now: new Date(
        START.getTime() + BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS
      ),
      battleStartAt: START,
      battleActive: true,
    }),
    "late"
  );

  assert.equal(
    authoritativeBetBookPhase({
      now: new Date(
        START.getTime() + BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS
      ),
      battleStartAt: START,
      battleActive: false,
    }),
    null
  );
});

test("phase planner rejects impossible server windows", () => {
  assert.throws(
    () =>
      planBetPhaseBookWindows({
        battleStartAt: START,
        preGameOpensAt: START,
      }),
    /Pre-Game must open before/
  );

  assert.throws(
    () =>
      planBetPhaseBookWindows({
        battleStartAt: START,
        battleTerminalAt: START,
      }),
    /terminal time must follow/
  );
});

test("Phase Books V2 runtime cannot become financially live from env alone", () => {
  assert.deepEqual(
    readBetPhaseBooksV2Runtime({ BET_PHASE_BOOKS_V2_MODE: "disabled" }),
    {
      requestedMode: "disabled",
      mode: "disabled",
      activationReady: false,
      detail:
        "Phase Books V2 is disabled. Production wager admission remains unchanged.",
    }
  );

  const shadow = readBetPhaseBooksV2Runtime({
    BET_PHASE_BOOKS_V2_MODE: "shadow",
  });
  assert.equal(shadow.mode, "shadow");
  assert.equal(shadow.activationReady, false);

  const requestedLive = readBetPhaseBooksV2Runtime({
    BET_PHASE_BOOKS_V2_MODE: "live",
  });
  assert.equal(requestedLive.requestedMode, "live");
  assert.equal(requestedLive.mode, "disabled");
  assert.equal(requestedLive.activationReady, false);
  assert.match(requestedLive.detail, /live activation is not installed/);
});

test("schema foundation is additive and existing markets remain legacy", () => {
  const schema = readFileSync(
    new URL("../prisma/schema.prisma", import.meta.url),
    "utf8"
  );
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260929211500_add_betting_phase_books_v2_foundation/migration.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    schema,
    /bookPhase\s+String\s+@default\("legacy"\)\s+@map\("book_phase"\)/
  );
  assert.match(schema, /phaseBookKey\s+String\?\s+@unique/);
  assert.match(schema, /phaseOpensAt\s+DateTime\?/);
  assert.match(schema, /phaseClosesAt\s+DateTime\?/);

  assert.match(
    migration,
    /"book_phase" VARCHAR\(24\) NOT NULL DEFAULT 'legacy'/
  );
  assert.match(migration, /CREATE UNIQUE INDEX "uq_bet_markets_phase_book_key"/);
  assert.doesNotMatch(migration, /UPDATE\s+"bet_markets"/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+"bet_markets"/i);
});

test("production betting remains on the legacy compatibility bridge", () => {
  const bets = readFileSync(new URL("../lib/bets.ts", import.meta.url), "utf8");

  assert.doesNotMatch(bets, /from "@\/lib\/betPhaseBooks"/);
  assert.doesNotMatch(bets, /bookPhase|phaseBookKey|phaseOpensAt|phaseClosesAt/);
});
