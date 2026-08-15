import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const chamberPage = fs.readFileSync(
  new URL("../app/round-chamber/page.tsx", import.meta.url),
  "utf8",
);

const chamberClient = fs.readFileSync(
  new URL(
    "../components/round-chamber/RoundChamberClient.tsx",
    import.meta.url,
  ),
  "utf8",
);

const shell = fs.readFileSync(
  new URL("../app/AppShell.tsx", import.meta.url),
  "utf8",
);

test(
  "Round Chamber ships its initial civic snapshot with the server render",
  () => {
    assert.match(
      chamberPage,
      /export default async function RoundChamberPage/,
    );

    assert.match(
      chamberPage,
      /getRoundChamberSnapshot/,
    );

    assert.match(
      chamberPage,
      /initialSnapshot=\{initialSnapshot\}/,
    );

    assert.match(
      chamberClient,
      /initialSnapshot: RoundChamberSnapshot \| null/,
    );

    assert.match(
      chamberClient,
      /useState<RoundChamberSnapshot \| null>\(initialSnapshot\)/,
    );

    assert.match(
      chamberClient,
      /useState\(initialSnapshot === null\)/,
    );

    assert.match(
      chamberClient,
      /if \(initialSnapshot\) return;/,
    );
  },
);

test(
  "Round Chamber reports authoritative readiness after data exists",
  () => {
    assert.match(
      chamberClient,
      /SpeedReadyMarker/,
    );

    assert.match(
      chamberClient,
      /route="\/round-chamber"/,
    );

    assert.match(
      chamberClient,
      /ready=\{!loading && snapshot !== null\}/,
    );
  },
);

test(
  "global route geometry does not animate max-width",
  () => {
    assert.doesNotMatch(
      shell,
      /transition-\[max-width\] duration-300/,
    );
  },
);
