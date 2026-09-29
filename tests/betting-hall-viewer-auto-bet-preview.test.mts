import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  attachViewerAutoBetPreview,
  buildViewerAutoBetPreviewMap,
  type BetViewerAutoBetPreview,
} from "../lib/bets.ts";

function previewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    presetVersion: 4,
    winnerMarketId: 77,
    desyncMarketId: null,
    propositionHash: "a".repeat(64),
    selectedSide: "left",
    winnerStakeWolo: 100,
    desyncSide: "none",
    desyncStakeWolo: 0,
    status: "shadow_ready",
    reason: "shadow_preview_eligible",
    ticketId: null,
    reservationId: null,
    attemptCount: 0,
    nextAttemptAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    acceptedAt: null,
    sourceEvidence: {
      mode: "shadow",
      exactSteamRosterMatch: true,
      exactUploaderUidMatch: true,
      marketIntegrityStatus: "verified",
      teamResolutionStatus: "resolved",
      teamConfidence: "high",
      propositionHash: "a".repeat(64),
      canonicalSessionKey: "platform_match:12345",
      ownerUid: "viewer-uid",
      ownerSteamId: "76561198000000001",
    },
    createdAt: new Date("2026-09-29T20:00:00.000Z"),
    ...overrides,
  };
}

test("viewer Auto Bet preview admits one exact zero-financial shadow row", () => {
  const map = buildViewerAutoBetPreviewMap([previewRow()] as never);

  assert.deepEqual(map.get(77), {
    id: 1,
    presetVersion: 4,
    selectedSide: "left",
    winnerStakeWolo: 100,
    desyncSide: "none",
    desyncStakeWolo: 0,
    desyncMarketId: null,
    propositionHash: "a".repeat(64),
    recordedAt: "2026-09-29T20:00:00.000Z",
    financiallyCommitted: false,
  });
});

test("viewer Auto Bet preview rejects every execution or custody marker", () => {
  const blockedRows = [
    previewRow({ id: 2, ticketId: 22 }),
    previewRow({ id: 3, reservationId: "reservation-3" }),
    previewRow({ id: 4, attemptCount: 1 }),
    previewRow({ id: 5, nextAttemptAt: new Date("2026-09-29T20:01:00.000Z") }),
    previewRow({ id: 6, leaseOwner: "worker-a" }),
    previewRow({ id: 7, leaseExpiresAt: new Date("2026-09-29T20:02:00.000Z") }),
    previewRow({ id: 8, acceptedAt: new Date("2026-09-29T20:03:00.000Z") }),
    previewRow({ id: 9, status: "queued" }),
    previewRow({ id: 10, reason: "funded_execution" }),
    previewRow({ id: 11, sourceEvidence: null }),
    previewRow({
      id: 12,
      sourceEvidence: {
        mode: "shadow",
        exactSteamRosterMatch: true,
        exactUploaderUidMatch: false,
        marketIntegrityStatus: "verified",
        teamResolutionStatus: "resolved",
        teamConfidence: "high",
        propositionHash: "a".repeat(64),
        canonicalSessionKey: "platform_match:12345",
        ownerUid: "viewer-uid",
        ownerSteamId: "76561198000000001",
      },
    }),
    previewRow({
      id: 13,
      sourceEvidence: {
        mode: "shadow",
        exactSteamRosterMatch: true,
        exactUploaderUidMatch: true,
        marketIntegrityStatus: "verified",
        teamResolutionStatus: "resolved",
        teamConfidence: "high",
        propositionHash: "b".repeat(64),
        canonicalSessionKey: "platform_match:12345",
        ownerUid: "viewer-uid",
        ownerSteamId: "76561198000000001",
      },
    }),
  ];

  for (const row of blockedRows) {
    assert.equal(
      buildViewerAutoBetPreviewMap([row] as never).has(77),
      false,
      String(row.id)
    );
  }
});

test("viewer Auto Bet preview requires internally consistent Desync evidence", () => {
  assert.equal(
    buildViewerAutoBetPreviewMap([
      previewRow({
        desyncSide: "yes",
        desyncStakeWolo: 25,
        desyncMarketId: null,
      }),
    ] as never).has(77),
    false
  );
  assert.equal(
    buildViewerAutoBetPreviewMap([
      previewRow({
        desyncSide: "none",
        desyncStakeWolo: 25,
        desyncMarketId: 78,
      }),
    ] as never).has(77),
    false
  );

  const valid = buildViewerAutoBetPreviewMap([
    previewRow({
      desyncSide: "no",
      desyncStakeWolo: 25,
      desyncMarketId: 78,
    }),
  ] as never).get(77);

  assert.equal(valid?.desyncSide, "no");
  assert.equal(valid?.desyncStakeWolo, 25);
  assert.equal(valid?.desyncMarketId, 78);
});

test("duplicate viewer shadow rows fail closed instead of picking newest", () => {
  const map = buildViewerAutoBetPreviewMap([
    previewRow({ id: 11 }),
    previewRow({
      id: 12,
      createdAt: new Date("2026-09-29T20:04:00.000Z"),
    }),
  ] as never);

  assert.equal(map.has(77), false);
});

test("attaching viewer Auto Bet preview cannot change real market economics", () => {
  const market = {
    id: 77,
    viewerAutoBetPreview: null as BetViewerAutoBetPreview | null,
    totalPotWolo: 150,
    left: {
      poolWolo: 100,
      crowdPercent: 67,
      slips: 2,
    },
    right: {
      poolWolo: 50,
      crowdPercent: 33,
      slips: 1,
    },
    viewerWager: {
      side: "left",
      amountWolo: 25,
      slipCount: 1,
    },
  };

  const projected = attachViewerAutoBetPreview(
    market,
    buildViewerAutoBetPreviewMap([previewRow()] as never)
  );
  const { viewerAutoBetPreview: beforePreview, ...beforeMoney } = market;
  const { viewerAutoBetPreview: afterPreview, ...afterMoney } = projected;

  assert.equal(beforePreview, null);
  assert.equal(afterPreview?.financiallyCommitted, false);
  assert.deepEqual(afterMoney, beforeMoney);
  assert.equal(projected.totalPotWolo, 150);
  assert.equal(projected.left.poolWolo, 100);
  assert.equal(projected.right.poolWolo, 50);
});

test("Betting Hall viewer preview is private, preset-scoped, and parent-market only", () => {
  const bets = readFileSync(
    new URL("../lib/bets.ts", import.meta.url),
    "utf8"
  );
  const page = readFileSync(
    new URL("../app/bets/page.tsx", import.meta.url),
    "utf8"
  );
  const route = readFileSync(
    new URL("../app/api/bets/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(bets, /betAutoPreset:\s*\{[\s\S]*?select: \{ id: true \}/);
  assert.match(bets, /presetId: viewer\.betAutoPreset\.id/);
  assert.match(bets, /status: "shadow_ready"/);
  assert.match(bets, /winnerMarketId: \{ in: openMarketIds \}/);
  assert.match(bets, /sourceEvidence: true/);
  assert.match(bets, /exactSteamRosterMatch !== true/);
  assert.match(bets, /exactUploaderUidMatch !== true/);
  assert.match(bets, /sourcePropositionHash !== propositionHash/);
  assert.match(bets, /buildViewerAutoBetPreviewMap\(viewerAutoBetRows\)/);

  assert.match(route, /"Cache-Control": "private, no-store/);
  assert.match(route, /Vary: "Cookie"/);

  assert.match(page, /Your Auto Bet Preview/);
  assert.match(page, /Shadow only · no wager placed/);
  assert.match(page, /financially committed: no/);

  const desyncStart = page.indexOf("function DesyncTicketLeg(");
  const desyncEnd = page.indexOf("function ", desyncStart + 20);
  assert.ok(desyncStart >= 0);
  assert.ok(desyncEnd > desyncStart);
  const desyncComponent = page.slice(desyncStart, desyncEnd);
  assert.match(desyncComponent, /PreviewLiquidityRail market=\{market\} compact/);
  assert.doesNotMatch(desyncComponent, /ViewerAutoBetPreviewRail/);
});
