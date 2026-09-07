import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const detailSource = fs.readFileSync(
  new URL("../components/game-stats/LiveReplayDetail.tsx", import.meta.url),
  "utf8",
);

const shellSource = fs.readFileSync(
  new URL("../app/AppShell.tsx", import.meta.url),
  "utf8",
);

test("live replay detail gets a wide observatory shell", () => {
  assert.match(
    shellSource,
    /pathname\?\.startsWith\(\s*"\/game-stats\/live\/"\s*\)/,
  );
  assert.match(
    shellSource,
    /isLiveReplayDetailSurface[\s\S]*?max-w-\[96rem\]/,
  );
});

test("admin replay diagnostics do not split into a cramped sidebar", () => {
  assert.doesNotMatch(
    detailSource,
    /xl:grid-cols-\[1\.15fr_0\.85fr\]/,
  );

  assert.match(
    detailSource,
    /<section className="grid min-w-0 gap-6">/,
  );
});

test("nested diagnostic grids size from available panel width", () => {
  const pulseBoard =
    detailSource.match(
      /Panel title="Pulse Board"[\s\S]*?<\/Panel>/,
    )?.[0] ?? "";

  assert.match(
    pulseBoard,
    /auto-fit,minmax\(min\(100%,13rem\),1fr\)/,
  );
  assert.doesNotMatch(
    pulseBoard,
    /xl:grid-cols-3/,
  );

  assert.match(
    detailSource,
    /auto-fit,minmax\(min\(100%,20rem\),1fr\)/,
  );
});

test("raw JSON stays contained inside its own horizontal scroller", () => {
  const jsonPanel =
    detailSource.match(
      /function JsonPanel\([\s\S]*?\n}\n\nfunction Tag/,
    )?.[0] ?? "";

  assert.match(jsonPanel, /className="min-w-0"/);
  assert.match(jsonPanel, /max-w-full overflow-x-auto/);
});
