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
  assert.match(board, /INTAKE STREAM/);
  assert.match(board, /BATCH CHANNEL/);
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
