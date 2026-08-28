import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalBattleIdentityKey,
  ensurePublicBattleIdentities,
  platformMatchIdFromBattleSession,
} from "../lib/battleIdentity.ts";

test("platform match identity is canonical across watcher casing", () => {
  assert.equal(canonicalBattleIdentityKey("  PLATFORM:7656119  "), "platform:7656119");
  assert.equal(platformMatchIdFromBattleSession("platform:7656119"), "7656119");
});

test("fallback session identity remains exact and namespaced", () => {
  assert.equal(
    canonicalBattleIdentityKey("record.2026-08-01-13-01-02.aoe2record"),
    "session:record.2026-08-01-13-01-02.aoe2record"
  );
  assert.equal(platformMatchIdFromBattleSession("local-file.mgx2"), null);
});

test("production numbering begins immediately after the 2,819-file archive", async () => {
  const migration = await readFile(
    "prisma/migrations/20260801203000_add_canonical_battle_numbers/migration.sql",
    "utf8"
  );
  assert.match(migration, /START WITH 2820/);
  assert.match(migration, /UNIQUE INDEX "uq_battle_identities_public_number"/);
});

test("same-game allocation uses a transaction advisory lock before sequence insert", async () => {
  const source = await readFile("lib/battleIdentity.ts", "utf8");
  assert.match(
    source,
    /await tx\.\$executeRaw`[\s\S]*pg_advisory_xact_lock\(hashtextextended/
  );
  assert.doesNotMatch(
    source,
    /await tx\.\$queryRaw`[\s\S]*SELECT\s+pg_advisory_xact_lock\(/
  );
  assert.match(source, /findUnique[\s\S]*battleIdentity\.create/);
});

test("historical proof and review rows cannot consume the first post-rollout number", async () => {
  let nextPublicNumber = 2820;
  let createCalls = 0;
  const rows = new Map<
    string,
    {
      id: number;
      identityKey: string;
      publicNumber: number;
      state: string;
      startedAt: Date | null;
      completedAt: Date | null;
    }
  >();
  const tx = {
    $executeRaw: async () => 0,
    battleIdentity: {
      findUnique: async ({ where }: { where: { identityKey: string } }) =>
        rows.get(where.identityKey) ?? null,
      create: async ({ data }: { data: { identityKey: string; state: string } }) => {
        createCalls += 1;
        const row = {
          id: createCalls,
          identityKey: data.identityKey,
          publicNumber: nextPublicNumber++,
          state: data.state,
          startedAt: null,
          completedAt: null,
        };
        rows.set(row.identityKey, row);
        return {
          id: row.id,
          identityKey: row.identityKey,
          publicNumber: row.publicNumber,
        };
      },
      update: async ({ where, data }: { where: { id: number }; data: { state: string } }) => {
        const row = [...rows.values()].find((candidate) => candidate.id === where.id);
        assert.ok(row);
        row.state = data.state;
        return {
          id: row.id,
          identityKey: row.identityKey,
          publicNumber: row.publicNumber,
        };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };

  const historical = await ensurePublicBattleIdentities(prisma as never, [
    {
      sessionKey: "platform:historical-proof",
      state: "awaiting_final_proof",
      allowCreate: false,
    },
    {
      sessionKey: "platform:historical-review",
      state: "under_review",
      allowCreate: false,
    },
  ]);
  assert.equal(historical.size, 0);
  assert.equal(createCalls, 0);
  assert.equal(nextPublicNumber, 2820);

  const live = await ensurePublicBattleIdentities(prisma as never, [
    {
      sessionKey: "platform:first-new-live-stream",
      state: "live",
      allowCreate: true,
    },
  ]);
  assert.equal(live.get("platform:first-new-live-stream")?.publicNumber, 2820);
  assert.equal(createCalls, 1);

  const awaitingProof = await ensurePublicBattleIdentities(prisma as never, [
    {
      sessionKey: "platform:first-new-live-stream",
      state: "awaiting_final_proof",
      allowCreate: false,
    },
  ]);
  assert.equal(awaitingProof.get("platform:first-new-live-stream")?.publicNumber, 2820);
  assert.equal(rows.get("platform:first-new-live-stream")?.state, "awaiting_final_proof");
  assert.equal(createCalls, 1);

  const completed = await ensurePublicBattleIdentities(prisma as never, [
    {
      sessionKey: "platform:first-new-live-stream",
      state: "completed",
      completedAt: new Date("2026-08-01T19:00:00.000Z"),
      allowCreate: false,
    },
  ]);
  assert.equal(completed.get("platform:first-new-live-stream")?.publicNumber, 2820);
  assert.equal(rows.get("platform:first-new-live-stream")?.state, "completed");
  assert.equal(createCalls, 1);
});

test("a promoted fallback identity serves the canonical platform key without burning a number", async () => {
  const aliasSessionKey = "watcher-session:jims-watcher:battle:1724695200000";
  const aliasIdentityKey = canonicalBattleIdentityKey(aliasSessionKey);
  assert.ok(aliasIdentityKey);
  const row = {
    id: 41,
    identityKey: aliasIdentityKey,
    publicNumber: 2820,
    state: "live",
    platformMatchId: "battle-42",
    startedAt: new Date("2026-08-26T19:00:00.000Z"),
    completedAt: null as Date | null,
  };
  let createCalls = 0;
  const tx = {
    $executeRaw: async () => 0,
    battleIdentity: {
      findUnique: async ({ where }: {
        where: { identityKey?: string; platformMatchId?: string };
      }) => {
        if (where.platformMatchId) {
          return row.platformMatchId === where.platformMatchId ? row : null;
        }
        return row.identityKey === where.identityKey ? row : null;
      },
      create: async () => {
        createCalls += 1;
        throw new Error("promotion must reuse the existing public number");
      },
      update: async ({ data }: {
        where: { id: number };
        data: {
          state: string;
          platformMatchId?: string | null;
          completedAt?: Date | null;
        };
      }) => {
        row.state = data.state;
        if (data.platformMatchId !== undefined) {
          row.platformMatchId = data.platformMatchId;
        }
        if (data.completedAt !== undefined) {
          row.completedAt = data.completedAt;
        }
        return {
          id: row.id,
          identityKey: row.identityKey,
          publicNumber: row.publicNumber,
        };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };

  const canonical = await ensurePublicBattleIdentities(prisma as never, [
    {
      sessionKey: "platform:battle-42",
      state: "live",
      allowCreate: true,
    },
  ]);
  assert.equal(canonical.get("platform:battle-42")?.publicNumber, 2820);
  assert.equal(canonical.get("platform:battle-42")?.identityKey, aliasIdentityKey);
  assert.equal(createCalls, 0);

  await ensurePublicBattleIdentities(prisma as never, [
    {
      sessionKey: aliasSessionKey,
      state: "awaiting_final_proof",
      allowCreate: false,
    },
  ]);
  assert.equal(row.platformMatchId, "battle-42");
  assert.equal(row.state, "awaiting_final_proof");
  assert.equal(createCalls, 0);
});

test("the bet board only allows live seeds to create battle identities", async () => {
  const source = await readFile("lib/bets.ts", "utf8");
  assert.match(source, /allowCreate:\s*seed\.status === "live"/);
  assert.doesNotMatch(
    source,
    /allowCreate:[^\n]*(?:awaiting_final_proof|under_review)/
  );
});

test("bet board exposes the immutable battle number", async () => {
  const source = await readFile("lib/bets.ts", "utf8");
  assert.match(source, /battleNumber:\s*market\.battle\?\.publicNumber \?\? null/);
  assert.match(source, /battleId:\s*seed\.battleId \?\? null/);
});
