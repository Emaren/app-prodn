import test from "node:test";
import assert from "node:assert/strict";
import {
  libraryOrigin,
  libraryMapName,
  libraryPlayerNames,
  libraryPendingReason,
} from "../lib/libraryLedger.ts";

test("watcher origin never promotes unknown history to signed live intake", () => {
  assert.equal(libraryOrigin("watcher_final", {
    watcher_upload: { ingestion_provenance: "live_monitor" },
  }, false), "watcher-live");
  assert.equal(libraryOrigin("watcher_final", {
    watcher_upload: { ingestion_provenance: "historical_import" },
  }, false), "watcher-batch");
  assert.equal(libraryOrigin("watcher_final", {}, false), "watcher-legacy");
  assert.equal(libraryOrigin("file_upload", {}, false), "manual");
  assert.equal(libraryOrigin("file_upload", {}, true), "manual-zip");
  assert.equal(libraryOrigin("unknown", {}, false), "unclassified");
  assert.equal(libraryOrigin("legacy", {}, true), "manual-zip");
});

test("public game labels omit hashes, unknown map and duplicate roster names", () => {
  assert.equal(libraryMapName({ name: "Black Forest" }), "Black Forest");
  assert.equal(libraryMapName({ name: "Unknown" }), null);
  assert.deepEqual(
    libraryPlayerNames([{ name: "Zodiac" }, { name: "Jim" }, { name: "Jim" }, { name: "Unknown" }]),
    ["Zodiac", "Jim"],
  );
});

test("pending final parse is not represented as a certified battle result", () => {
  assert.equal(libraryPendingReason("watcher_final_unparsed"), true);
  assert.equal(libraryPendingReason("watcher_live_pending_parse"), true);
  assert.equal(libraryPendingReason("postgame_parsed"), false);
});
