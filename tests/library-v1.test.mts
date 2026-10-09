import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const page = fs.readFileSync("app/library/page.tsx", "utf8");
const board = fs.readFileSync(
  "components/library/LibraryActivityBoard.tsx",
  "utf8"
);
const activityRoute = fs.readFileSync(
  "app/api/library/activity/route.ts",
  "utf8"
);
const shell = fs.readFileSync("app/AppShell.tsx", "utf8");

test("Library owns a live replay intake command surface", () => {
  assert.match(page, /LibraryActivityBoard/);
  assert.match(board, /REPLAY INTAKE \/\/ LIVE/);
  assert.match(board, /THE INTAKE LEDGER/);
  assert.match(board, /LATEST ARRIVAL/);
  assert.match(board, /data-library-scroll/);
  assert.match(board, /ROW_HEIGHT = 108/);
  assert.match(board, /hasMore/);
  assert.match(board, /scrollRef/);
  assert.match(board, /Full-history source filter active/);
  assert.match(board, /SpeedReadyMarker route="\/library"/);
});

test("Library distinguishes package, manual, and watcher ingestion from durable activity truth", () => {
  assert.match(activityRoute, /userActivityEvent\.findMany/);
  assert.match(activityRoute, /type: "replay_upload"/);
  assert.match(activityRoute, /packageUpload/);
  assert.match(activityRoute, /viaWatcher/);
  assert.match(activityRoute, /watcherClientEvent\.findMany/);
  assert.match(activityRoute, /batch_upload_started/);
  assert.match(activityRoute, /batch_upload_finished/);
  assert.match(activityRoute, /collapseManualBursts/);
  assert.match(activityRoute, /5 \* 60 \* 1000/);
});

test("Library public projection omits raw replay identity and private ingest metadata", () => {
  const responseSection = activityRoute.slice(
    activityRoute.indexOf("return NextResponse.json")
  );

  assert.doesNotMatch(responseSection, /replayHash/);
  assert.doesNotMatch(responseSection, /replayFile/);
  assert.doesNotMatch(responseSection, /archiveFilename/);
  assert.doesNotMatch(responseSection, /filenames/);
  assert.doesNotMatch(responseSection, /ipAddress/);
});

test("Library sits immediately after Academy and before Marketplace", () => {
  const academy = shell.indexOf(
    '{ href: "/academy", label: "Academy"'
  );
  const library = shell.indexOf(
    '{ href: "/library", label: "Library"'
  );
  const market = shell.indexOf(
    '{ href: "/market", label: "Marketplace"'
  );

  assert.ok(academy >= 0);
  assert.ok(library > academy);
  assert.ok(market > library);
});

const gameRoute = fs.readFileSync("app/api/library/games/route.ts", "utf8");
const packageRoute = fs.readFileSync("app/api/replay/upload-package/route.ts", "utf8");

test("Library source filters query complete history before paging", () => {
  const index = fs.readFileSync("lib/libraryHistoricalIndex.ts", "utf8");
  const origin = fs.readFileSync("lib/libraryHistoricalProvenance.ts", "utf8");
  assert.match(gameRoute, /loadLibraryHistoricalSnapshot/);
  assert.match(gameRoute, /selectLibraryHistoryPage/);
  assert.match(gameRoute, /LIBRARY_ORIGIN_FILTERS/);
  assert.match(index, /is_final: true/);
  assert.match(index, /id > options.after/);
  assert.match(index, /id < options.before/);
  assert.match(index, /filterTotal: eligible.length/);
  assert.match(origin, /zip-legacy-correlation/);
  assert.ok(board.includes("origin=${encodeURIComponent(filter)}"));
  assert.match(board, /data-library-scroll/);
  assert.match(board, /LibraryPlayerCensus/);
});

test("Library retains exact ZIP receipts and explicitly inferred legacy provenance", () => {
  const history = fs.readFileSync("lib/libraryHistoricalProvenance.ts", "utf8");
  assert.ok(packageRoute.includes("gameIds: [...new Set"));
  assert.match(history, /zip-exact-id/);
  assert.match(history, /zip-legacy-correlation/);
  assert.match(history, /possibleRows.length !== 1/);
  assert.ok(!gameRoute.includes("filenames.includes"));
});

test("Library public JSON excludes raw replay metadata and keys", () => {
  const responseSection = gameRoute.slice(gameRoute.indexOf("return NextResponse.json(\n      {\n        ok: true"));
  assert.ok(responseSection.length > 0);
  assert.doesNotMatch(responseSection, /replayHash:/);
  assert.doesNotMatch(responseSection, /replayFile:/);
  assert.doesNotMatch(responseSection, /key_events:/);
  assert.doesNotMatch(responseSection, /userUid:/);
});

const censusRoute = fs.readFileSync("app/api/library/census/route.ts", "utf8");
test("Library breakdown counts only claimed uploader-owned records",()=>{
  assert.ok(censusRoute.includes("snapshot.profiles"));
  assert.match(censusRoute,/owner: "Authenticated uploader/);
  assert.match(board,/LibraryPlayerCensus/);
});
