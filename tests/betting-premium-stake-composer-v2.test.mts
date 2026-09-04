import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/bets/page.tsx",
  "utf8",
);

test("E4 retires the skinny horizontal InstrumentStakeRail", () => {
  assert.doesNotMatch(
    source,
    /function InstrumentStakeRail/,
  );

  assert.doesNotMatch(
    source,
    /<InstrumentStakeRail/,
  );
});

test("E4 uses the premium vertical stake composer", () => {
  assert.match(
    source,
    /function PremiumStakeComposer/,
  );

  assert.match(
    source,
    /data-testid="bets-premium-stake-composer"/,
  );

  assert.match(
    source,
    /Bet your WOLO/,
  );

  assert.doesNotMatch(
    source,
    /Choose a stake below\./,
  );

  assert.match(
    source,
    /QUICK STAKE/,
  );

  assert.match(
    source,
    /CUSTOM STAKE/,
  );

  assert.match(
    source,
    /YOUR TICKET/,
  );
});

test("stake presets are large tactile tiles instead of tiny pills", () => {
  assert.match(
    source,
    /min-h-\[6\.5rem\]/,
  );

  assert.match(
    source,
    /grid-cols-2/,
  );

  assert.match(
    source,
    /active:scale-\[0\.985\]/,
  );

  assert.doesNotMatch(
    source,
    /inline-flex h-9 min-w-10/,
  );
});

test("custom stake and final lock action are full-size controls", () => {
  assert.match(
    source,
    /min-h-\[5\.75rem\]/,
  );

  assert.match(
    source,
    /min-h-\[4\.5rem\]/,
  );

  assert.match(
    source,
    /Projected return/,
  );

  assert.match(
    source,
    /BETTING CLOSED/,
  );
});

test("presentation slice preserves current financial admission wiring", () => {
  assert.ok(
    (
      source.match(
        /market\.bettingOpen &&\s*!marketWorkflow/g,
      ) ?? []
    ).length >= 1,
  );

  assert.match(
    source,
    /canEdit=\{canEditSlip\}/,
  );

  assert.match(
    source,
    /onLock=\{onLock\}/,
  );
});
