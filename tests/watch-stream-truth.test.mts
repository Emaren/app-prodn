import assert from "node:assert/strict";
import test from "node:test";

import {
  watchStreamHasProvenLiveVideo,
  watchStreamPresentationLabel,
  type WatchStreamPayload,
} from "../lib/watchStreams.ts";

const NOW = Date.parse("2026-09-08T05:20:00.000Z");

function stream(overrides: Partial<WatchStreamPayload> = {}): WatchStreamPayload {
  return {
    id: 1,
    sessionKey: "battle-1",
    provider: "aoe2war",
    sourceType: "watcher_native",
    role: "caster",
    label: "Battle Cam",
    title: null,
    url: "aoe2war://stream/1",
    playbackUrl: "/api/streams/1/manifest",
    embedId: null,
    playerLabel: null,
    thumbnailUrl: null,
    mediaMimeType: "video/webm",
    isPrimary: true,
    status: "live",
    chunkCount: 12,
    latestChunkSeq: 11,
    lastHeartbeatAt: "2026-09-08T05:19:30.000Z",
    startedAt: "2026-09-08T05:00:00.000Z",
    endedAt: null,
    canEmbed: true,
    externalOnly: false,
    createdAt: "2026-09-08T05:00:00.000Z",
    updatedAt: "2026-09-08T05:19:30.000Z",
    ...overrides,
  };
}

test("fresh first-party chunks prove live video", () => {
  const current = stream();
  assert.equal(watchStreamHasProvenLiveVideo(current, NOW), true);
  assert.equal(
    watchStreamPresentationLabel(current, { completed: false, nowMs: NOW }),
    "Video live"
  );
});

test("external Twitch rows are watch feeds, not proof of live video", () => {
  const external = stream({
    provider: "twitch",
    sourceType: "external",
    url: "https://www.twitch.tv/emaren19",
    playbackUrl: null,
    embedId: "emaren19",
    chunkCount: 0,
    latestChunkSeq: -1,
    lastHeartbeatAt: null,
  });

  assert.equal(watchStreamHasProvenLiveVideo(external, NOW), false);
  assert.equal(
    watchStreamPresentationLabel(external, { completed: false, nowMs: NOW }),
    "Watch feed"
  );
});

test("stale or chunkless first-party rows do not claim live video", () => {
  const stale = stream({
    lastHeartbeatAt: "2026-09-08T05:15:00.000Z",
    updatedAt: "2026-09-08T05:15:00.000Z",
  });
  const chunkless = stream({ chunkCount: 0, latestChunkSeq: -1 });

  assert.equal(watchStreamHasProvenLiveVideo(stale, NOW), false);
  assert.equal(watchStreamHasProvenLiveVideo(chunkless, NOW), false);
  assert.equal(
    watchStreamPresentationLabel(stale, { completed: false, nowMs: NOW }),
    "Watch feed"
  );
});

test("completed first-party recordings are labeled saved, external links remain feeds", () => {
  assert.equal(
    watchStreamPresentationLabel(stream({ status: "ended" }), {
      completed: true,
      nowMs: NOW,
    }),
    "Video saved"
  );
  assert.equal(
    watchStreamPresentationLabel(
      stream({
        provider: "twitch",
        sourceType: "external",
        chunkCount: 0,
        latestChunkSeq: -1,
        lastHeartbeatAt: null,
      }),
      { completed: true, nowMs: NOW }
    ),
    "Watch feed"
  );
});
