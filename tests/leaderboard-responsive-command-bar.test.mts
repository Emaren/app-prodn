import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(
  "app/AppShell.tsx",
  "utf8",
);

const living = fs.readFileSync(
  "components/leaderboard/LivingLeaderboard.tsx",
  "utf8",
);

const lane = fs.readFileSync(
  "components/lobby/LeaderboardLaneToggle.tsx",
  "utf8",
);

const scope = fs.readFileSync(
  "components/leaderboard/LeaderboardScopeToggle.tsx",
  "utf8",
);

test("real mobile shell begins below md instead of below lg", () => {
  assert.match(
    app,
    /<div className="md:hidden">/,
  );

  assert.match(
    app,
    /hidden md:grid md:grid-cols-\[auto_minmax\(0,1fr\)_auto\]/,
  );
});

test("desktop nav owns a fixed-door premium horizontal rail", () => {
  assert.match(
    app,
    /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/,
  );

  assert.match(
    app,
    /aoe2-nav-scroll min-w-0 overflow-x-auto overscroll-x-contain/,
  );

  assert.match(
    app,
    /\[scrollbar-width:none\]/,
  );
});

test("page-heading chrome yields before navigation collides", () => {
  assert.match(
    app,
    /hidden min-w-0 border-l border-white\/10[\s\S]*xl:block/,
  );
});

test("header pills progressively compress and restore at xl", () => {
  assert.match(
    app,
    /min-h-8[\s\S]*px-2[\s\S]*xl:min-h-9[\s\S]*xl:px-3\.5/,
  );

  assert.match(
    app,
    /xl:hidden[\s\S]*Live🔥/,
  );
});

test("cinematic hero survives into md narrow-desktop widths", () => {
  assert.match(
    living,
    /md:grid-cols-\[minmax\(19rem,0\.9fr\)_minmax\(21rem,1\.1fr\)\]/,
  );

  assert.match(
    living,
    /2xl:grid-cols-\[minmax\(36rem,0\.88fr\)_minmax\(43rem,1\.12fr\)\]/,
  );
});

test("command deck has mobile, compact-desktop, and full-desktop states", () => {
  assert.match(
    living,
    /md:grid-cols-\[minmax\(8\.75rem,0\.85fr\)_minmax\(7\.25rem,0\.62fr\)_minmax\(13rem,1\.53fr\)\]/,
  );

  assert.match(
    living,
    /lg:grid-cols-\[minmax\(9rem,0\.7fr\)_minmax\(7\.5rem,0\.6fr\)_minmax\(12rem,1\.7fr\)_auto_minmax\(4\.5rem,auto\)\]/,
  );

  const commandBankClass =
    living.match(
      /className="([^"]*relative flex min-w-0 items-center gap-0[^"]*)"/,
    )?.[1] ?? "";

  assert.ok(
    commandBankClass,
    "command bank class not found",
  );

  assert.match(
    commandBankClass,
    /\bmd:col-span-2\b/,
  );

  assert.match(
    commandBankClass,
    /\blg:col-span-1\b/,
  );
});

test("RM DM has no oversized background heraldry", () => {
  assert.doesNotMatch(
    lane,
    /text-cyan-100\/10/,
  );

  assert.doesNotMatch(
    lane,
    /text-\[2\.6rem\]/,
  );

  assert.match(
    lane,
    /hidden h-8 w-8 text-sm min-\[1800px\]:grid/,
  );
});

test("RM DM centers whenever its decorative icon is absent", () => {
  assert.match(
    lane,
    /justify-center gap-1 min-\[1800px\]:justify-between min-\[1800px\]:gap-3/,
  );

  assert.match(
    lane,
    /text-center min-\[1800px\]:text-left/,
  );

  assert.match(
    lane,
    /hidden h-8 w-8 text-sm min-\[1800px\]:grid/,
  );
});

test("hero title compresses before it can collide with the podium", () => {
  assert.match(
    living,
    /md:max-xl:!text-\[clamp\(2rem,3\.2vw,2\.6rem\)\]/,
  );

  assert.match(
    living,
    /whitespace-nowrap/,
  );
});

test("Warriors Kingdom becomes restrained W K when space is tight", () => {
  assert.match(
    scope,
    /compactLabel: "W"/,
  );

  assert.match(
    scope,
    /compactLabel: "K"/,
  );

  assert.match(
    scope,
    /xl:hidden/,
  );

  assert.match(
    scope,
    /hidden xl:inline/,
  );

  assert.match(
    scope,
    /font-serif text-\[1\.08rem\]/,
  );
});

test("scope command labels stay centered until the wide icon returns", () => {
  assert.match(
    scope,
    /text-center[\s\S]*min-\[1680px\]:text-left/,
  );

  assert.match(
    scope,
    /justify-center gap-1 min-\[1680px\]:justify-between min-\[1680px\]:gap-4/,
  );

  assert.match(
    scope,
    /hidden h-8 w-8 min-\[1680px\]:grid/,
  );
});

test("scope has no oversized background people icon", () => {
  assert.doesNotMatch(
    scope,
    /text-amber-100\/10/,
  );

  assert.doesNotMatch(
    scope,
    /h-10 w-10 -translate-y-1\/2 xl:block/,
  );

  assert.match(
    scope,
    /hidden h-8 w-8 min-\[1680px\]:grid/,
  );
});

test("desktop command icons compress but never wrap", () => {
  const commandBankClass =
    living.match(
      /className="([^"]*relative flex min-w-0 items-center gap-0[^"]*xl:gap-1[^"]*)"/,
    )?.[1] ?? "";

  assert.ok(
    commandBankClass,
    "command bank class not found",
  );

  assert.doesNotMatch(
    commandBankClass,
    /\bflex-wrap\b/,
  );
});
