import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  RADIO_RIGHTS_STATEMENT,
  detectArtworkType,
  detectAudioType,
  radioStoragePath,
  safeOriginalFilename,
} from "../lib/radioWolo.ts";
import { normalizeWorkshopDialogue } from "../lib/workshop.ts";

test("Radio WOLO validates file bytes instead of trusting upload extensions", () => {
  assert.deepEqual(detectAudioType(new Uint8Array(Buffer.from("ID3music"))), {
    extension: ".mp3",
    mediaType: "audio/mpeg",
  });
  assert.deepEqual(detectAudioType(new Uint8Array(Buffer.from("RIFF0000WAVEdata"))), {
    extension: ".wav",
    mediaType: "audio/wav",
  });
  assert.equal(detectAudioType(new Uint8Array(Buffer.from("not-a-track"))), null);
  assert.deepEqual(
    detectArtworkType(new Uint8Array([0xff, 0xd8, 0xff, 0x00])),
    { extension: ".jpg", mediaType: "image/jpeg" }
  );
  assert.equal(detectArtworkType(new Uint8Array(Buffer.from("<svg>"))), null);
});

test("Radio WOLO storage keys cannot escape the configured media root", () => {
  const previous = process.env.RADIO_WOLO_MEDIA_DIR;
  process.env.RADIO_WOLO_MEDIA_DIR = "/tmp/radio-wolo-test";
  try {
    assert.equal(
      radioStoragePath("submissions/audio/track.mp3"),
      "/tmp/radio-wolo-test/submissions/audio/track.mp3"
    );
    assert.throws(() => radioStoragePath("../../etc/passwd"), /Invalid Radio WOLO storage key/);
    assert.equal(safeOriginalFilename("../odd/../battle♫.mp3"), "battle_.mp3");
  } finally {
    if (previous === undefined) delete process.env.RADIO_WOLO_MEDIA_DIR;
    else process.env.RADIO_WOLO_MEDIA_DIR = previous;
  }
});

test("creator rights remain limited and copyright-preserving", () => {
  assert.match(RADIO_RIGHTS_STATEMENT, /non-exclusive, revocable permission/);
  assert.match(RADIO_RIGHTS_STATEMENT, /Copyright remains with the rights holder/);
});

test("kingdom expansion migration preserves append-only bounty evidence", () => {
  const migration = readFileSync(
    new URL("../prisma/migrations/20260716210000_add_kingdom_expansion_surfaces/migration.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /CREATE TABLE "ai_request_traces"/);
  assert.match(migration, /CREATE TABLE "bounty_events"/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "bounty_events"/);
  assert.match(migration, /CREATE TABLE "radio_submissions"/);
  assert.match(migration, /CHECK \("rights_accepted" = TRUE\)/);
  assert.doesNotMatch(migration, /provider_key|api_key|password/i);
});

test("hero rotation still honors the saved pause-on-hover setting", () => {
  const carousel = readFileSync(new URL("../components/hero/HeroCarousel.tsx", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../lib/hero/actions.ts", import.meta.url), "utf8");
  assert.match(carousel, /settings\.pauseOnHover/);
  assert.match(carousel, /onMouseEnter: \(\) => setInteractionPaused\(true\)/);
  assert.match(carousel, /onMouseLeave: \(\) => setInteractionPaused\(false\)/);
  assert.match(actions, /pauseOnHover: boolValue\(payload\.pauseOnHover, playlist\.pauseOnHover\)/);
});

test("Workshop migration makes publication explicit and seeds no live fiction", () => {
  const migration = readFileSync(
    new URL("../prisma/migrations/20260716233000_add_workshop_foundation/migration.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /CREATE TABLE "workshop_status"/);
  assert.match(migration, /CREATE TABLE "workshop_entries"/);
  assert.match(migration, /CREATE TABLE "workshop_streams"/);
  assert.match(migration, /fk_workshop_status_active_stream/);
  assert.match(migration, /"status" = 'published' AND "visibility" = 'public'/);
  assert.match(migration, /TRUE, FALSE, 'quiet_work', 'THE WORKSHOP IS OPEN'/);
  assert.doesNotMatch(migration, /provider_key|api_key|password|database_url/i);
});

test("Workshop AI excerpts are bounded and discard malformed turns", () => {
  const turns = normalizeWorkshopDialogue([
    { speaker: "EMAREN", body: "Build the Workshop." },
    { speaker: "", body: "private" },
    { speaker: "THE AI SCRIBE", body: "Publish only a curated projection." },
    "bad",
  ]);
  assert.deepEqual(turns, [
    { speaker: "EMAREN", body: "Build the Workshop.", tone: null },
    { speaker: "THE AI SCRIBE", body: "Publish only a curated projection.", tone: null },
  ]);
});

test("public Workshop query hard-gates drafts and private records", () => {
  const source = readFileSync(new URL("../lib/workshop.ts", import.meta.url), "utf8");
  assert.match(source, /status: "published", visibility: "public", publishedAt: \{ not: null \}/);
  assert.match(source, /artifacts:[\s\S]*where: \{ isPublic: true \}/);
});

test("Parser Observatory keeps compatibility candidates separate from the canonical contract", () => {
  const page = readFileSync(new URL("../app/game-stats/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Canonical Parser Contract/);
  assert.match(page, /HD_REPLAY_PARSER_CONTRACT\.parserName/);
  assert.match(page, /version\.parserVersion === HD_REPLAY_PARSER_CONTRACT\.parserVersion/);
  assert.doesNotMatch(page, /const activeVersion = data\.parser\.versions\[0\]/);
});
