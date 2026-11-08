import assert from "node:assert/strict";
import test from "node:test";

import { resolveManagedMediaUrl } from "../lib/managedMediaAssets.ts";

type MediaSelect = {
  where?: Record<string, unknown>;
  orderBy?: Array<Record<string, string>>;
  select?: Record<string, boolean>;
};

function mediaPrisma(result: { url: string } | null, seen: MediaSelect[]) {
  return {
    managedMediaAsset: {
      async findFirst(query: MediaSelect) {
        seen.push(query);
        return result;
      },
    },
  } as Parameters<typeof resolveManagedMediaUrl>[0];
}

test("public managed avatar resolves the actual asset with an exact URL-only projection", async () => {
  const calls: MediaSelect[] = [];
  const path = await resolveManagedMediaUrl(
    mediaPrisma({ url: "/uploads/managed-assets/avatar/actual-player.webp" }, calls),
    "avatar",
    "Player-42",
    "/champions/players/silhouette.card.webp",
  );
  assert.equal(path, "/uploads/managed-assets/avatar/actual-player.webp");
  assert.deepEqual(calls, [{
    where: { kind: "avatar", target: "player-42", active: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { url: true },
  }]);
  assert.equal(Object.keys(calls[0].select ?? {}).length, 1);
});

test("no assigned active portrait keeps the existing deterministic safe fallback", async () => {
  const seen: MediaSelect[] = [];
  assert.equal(await resolveManagedMediaUrl(
    mediaPrisma(null, seen),
    "avatar",
    "Missing Player",
    "/champions/players/silhouette.card.webp",
  ), "/champions/players/silhouette.card.webp");
  assert.deepEqual(seen[0].select, { url: true });
});

test("untrusted lookup kind and invalid target cannot authorize a new database query", async () => {
  const seen: MediaSelect[] = [];
  assert.equal(await resolveManagedMediaUrl(
    mediaPrisma(null, seen),
    "avatar",
    "!!!",
    "/champions/players/silhouette.card.webp",
  ), "/champions/players/silhouette.card.webp");
  assert.equal(seen.length, 0);
});
