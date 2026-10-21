import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  INSTRUMENT_CONSUMER_PAGES,
  INSTRUMENT_IMPORT,
  INSTRUMENT_SOURCE_PREFIX,
  sharedSourcePrefixesForHref,
  validateInstrumentImporters,
} from "../scripts/kingdom_index_shared_dependencies.mjs";

const routes = INSTRUMENT_CONSUMER_PAGES.map(
  (page) => "/" + page.slice("app/".length, -"/page.tsx".length),
);

test("all six canonical instrument pages include the shared source root", () => {
  assert.equal(routes.length, 6);
  assert.equal(new Set(routes).size, 6);
  for (const href of routes) {
    assert.deepEqual(sharedSourcePrefixesForHref(href), [INSTRUMENT_SOURCE_PREFIX]);
  }
  for (const href of ["/kingdom-intelligence", "/game-stats", "/", "/kingdom-index"]) {
    assert.deepEqual(sharedSourcePrefixesForHref(href), [], href + " must not over-invalidate");
  }
});

test("fail closed on unknown, missing or unexpected instrument consumers", () => {
  assert.doesNotThrow(() => validateInstrumentImporters(INSTRUMENT_CONSUMER_PAGES));
  assert.throws(
    () => validateInstrumentImporters(INSTRUMENT_CONSUMER_PAGES.slice(1)),
    /KINGDOM INDEX SHARED IMPORT DRIFT.*missing/,
  );
  assert.throws(
    () => validateInstrumentImporters([...INSTRUMENT_CONSUMER_PAGES, "app/unknown/page.tsx"]),
    /KINGDOM INDEX SHARED IMPORT DRIFT.*unexpected/,
  );
});

test("HEAD import discovery exactly matches the declared shared-source consumers", () => {
  const discovered = execFileSync(
    "git",
    ["grep", "-l", "-F", INSTRUMENT_IMPORT, "HEAD", "--", "app"],
    { encoding: "utf8", maxBuffer: 2_000_000 },
  ).trim().split("\n").filter(Boolean).map((v) => v.replace(/^HEAD:/, ""));
  assert.doesNotThrow(() => validateInstrumentImporters(discovered));
});

test("auditor hashes shared source blobs for all consumers and nowhere else", () => {
  const source = readFileSync("scripts/kingdom_index_source_audit.mjs", "utf8");
  assert.match(source, /validateInstrumentImporters\(knownImporters\)/);
  assert.match(source, /sharedSourcePrefixesForHref\(href\)/);
  assert.match(source, /"grep", "-l", "-F", INSTRUMENT_IMPORT, "HEAD", "--", "app"/);
  assert.match(source, /"ls-tree","-r","HEAD"/);
  assert.match(source, /file\.path\.startsWith\(prefix\)/);
  assert.match(source, /const value=file\.path\+"\\\\0"\+file\.sha\+"\\\\0"/);

  const sharedFile = "components/kingdom-instruments/KingdomInstruments.tsx";
  const newPolicyFile = "components/kingdom-instruments/instrumentFeedPolicy.ts";
  for (const href of routes) {
    for (const file of [sharedFile, newPolicyFile]) {
      assert.ok(sharedSourcePrefixesForHref(href).some((prefix) => file.startsWith(prefix)));
    }
  }
  assert.ok(!sharedSourcePrefixesForHref("/kingdom-intelligence").some(
    (prefix) => sharedFile.startsWith(prefix),
  ));
});
