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
