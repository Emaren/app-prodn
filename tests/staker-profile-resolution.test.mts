import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildActiveStakerProfiles,
  loadActiveStakerProfiles,
  resolveActiveStakerProfile,
  resolveStakerProfileFromRows,
  stakerCanonicalSlug,
  type ActiveStakerPositionRow,
  type StakerProfileQueryClient,
} from "../lib/stakerProfileResolver.ts";

function positionRow(
  overrides: Partial<ActiveStakerPositionRow> & Pick<ActiveStakerPositionRow, "user_id">,
): ActiveStakerPositionRow {
  return {
    user_id: overrides.user_id,
    user_uid: null,
    in_game_name: null,
    steam_persona_name: null,
    steam_id: null,
    user_verified: false,
    verification_level: 0,
    verified_at: null,
    position_wallet_address: null,
    user_wallet_address: null,
    current_staked_wolo: 1,
    accumulated_weight: 0n,
    created_at: "2026-05-25T00:00:00.000Z",
    auto_compound_rewards: true,
    status: "active",
    lifetime_rewards_wolo: 0,
    claimed_rewards_wolo: 0,
    compounded_rewards_wolo: 0,
    pending_rewards_wolo: 0,
    ...overrides,
  };
}

const fixtureRows: ActiveStakerPositionRow[] = [
  positionRow({
    user_id: 7,
    user_uid: "u_0df73bdbb64646c19e4a9bfd225b3285",
    in_game_name: "Jim",
    user_verified: true,
    position_wallet_address: "WOLO1JIM000000000000000000000000000000000",
    current_staked_wolo: 100,
  }),
  positionRow({
    user_id: 8,
    in_game_name: "A&B",
    verification_level: 1,
    current_staked_wolo: 90,
  }),
  positionRow({
    user_id: 9,
    in_game_name: "A and B",
    steam_id: "76561198000000009",
    current_staked_wolo: 80,
  }),
  positionRow({
    user_id: 10,
    in_game_name: "Jim",
    position_wallet_address: "wolo1unverified00000000000000000000000000",
    current_staked_wolo: 70,
  }),
];

test("active staker profiles use verified names and neutral fallbacks", () => {
  const profiles = buildActiveStakerProfiles(fixtureRows);
  const jim = profiles.find((profile) => profile.userId === 7);
  const unverified = profiles.find((profile) => profile.userId === 10);

  assert.ok(jim);
  assert.equal(jim.player, "Jim");
  assert.equal(jim.featured?.title, "First Guardian");
  assert.equal(jim.walletAddress, "wolo1jim000000000000000000000000000000000");
  assert.equal(jim.slug, "jim-u7");

  assert.ok(unverified);
  assert.match(unverified.player, /^Staker wolo1unv…000000$/);
  assert.equal(unverified.identityVerified, false);
  assert.equal(unverified.featured, null);
  assert.equal(unverified.presentation.title, "Active Staker");
  assert.equal(unverified.slug, stakerCanonicalSlug(unverified.player, 10));
});

test("featured titles bind to stable account identity, never a matching display name", () => {
  const [imposter] = buildActiveStakerProfiles([
    positionRow({
      user_id: 77,
      user_uid: "u_unrelated_verified_account",
      in_game_name: "Jim",
      steam_persona_name: "Emaren",
      user_verified: true,
      current_staked_wolo: 5,
    }),
  ]);

  assert.equal(imposter.player, "Jim");
  assert.equal(imposter.featured, null);
  assert.equal(imposter.presentation.title, "Active Staker");
});

test("canonical user-id slugs are collision-safe and legacy aliases fail closed when ambiguous", () => {
  const firstCollision = resolveStakerProfileFromRows(fixtureRows, "a-and-b-u8");
  const secondCollision = resolveStakerProfileFromRows(fixtureRows, "a-and-b-u9");

  assert.equal(firstCollision?.userId, 8);
  assert.equal(secondCollision?.userId, 9);
  assert.equal(resolveStakerProfileFromRows(fixtureRows, "a-and-b"), null);
  assert.equal(resolveStakerProfileFromRows(fixtureRows, "jim")?.userId, 7);
  assert.equal(resolveStakerProfileFromRows(fixtureRows, "jim<script>"), null);
});

test("canonical lookup wins over a colliding human-readable alias", () => {
  const rows = [
    positionRow({
      user_id: 2,
      in_game_name: "Foo",
      user_verified: true,
      current_staked_wolo: 2,
    }),
    positionRow({
      user_id: 3,
      in_game_name: "Foo U2",
      user_verified: true,
      current_staked_wolo: 1,
    }),
  ];

  assert.equal(resolveStakerProfileFromRows(rows, "foo-u2")?.userId, 2);
  assert.equal(resolveStakerProfileFromRows(rows, "foo-u2-u3")?.userId, 3);
});

test("database resolver is scoped to live active positions and joined identity", async () => {
  let capturedQuery = "";
  const client: StakerProfileQueryClient = {
    async $queryRawUnsafe<T>(query: string): Promise<T> {
      capturedQuery = query;
      return fixtureRows as T;
    },
  };

  const profiles = await loadActiveStakerProfiles(client);

  assert.equal(profiles.length, fixtureRows.length);
  assert.match(capturedQuery, /from staking_positions sp/i);
  assert.match(capturedQuery, /join users u on u\.id = sp\.user_id/i);
  assert.match(capturedQuery, /sp\.status[\s\S]*active/i);
  assert.match(capturedQuery, /sp\.current_staked_wolo[\s\S]*>[\s\S]*0/i);
  assert.match(capturedQuery, /sp\.compounded_rewards_wolo[\s\S]*>[\s\S]*0/i);
  assert.match(capturedQuery, /u\.verified/i);
  assert.match(capturedQuery, /u\.verification_level/i);
  assert.match(capturedQuery, /sp\.wallet_address as position_wallet_address/i);
  assert.match(capturedQuery, /limit 10001/i);
});

test("canonical slugs use one bounded user-id query instead of scanning the hall", async () => {
  let capturedQuery = "";
  let capturedUserId: unknown = null;
  const client: StakerProfileQueryClient = {
    async $queryRawUnsafe<T>(query: string, userId?: unknown): Promise<T> {
      capturedQuery = query;
      capturedUserId = userId;
      return [fixtureRows[0]] as T;
    },
  };

  const profile = await resolveActiveStakerProfile(client, "jim-u7");
  assert.equal(profile?.userId, 7);
  assert.equal(capturedUserId, 7);
  assert.match(capturedQuery, /where sp\.user_id = \$1/i);
  assert.match(capturedQuery, /limit 1/i);
});

test("page and ledger route share the resolver with no hardcoded existence gate", async () => {
  const [page, route, ledgerPanel, stakingPage] = await Promise.all([
    readFile(new URL("../app/staking/stakers/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/staking/stakers/[slug]/ledger/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/staking/stakers/[slug]/StakerLedgerPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/staking/page.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of [page, route]) {
    assert.match(source, /resolveActiveStakerProfile/);
    assert.doesNotMatch(source, /const\s+REGISTRY\b/);
    assert.doesNotMatch(source, /KNOWN_STAKER_WALLETS/);
  }

  assert.doesNotMatch(page, /fallbackStake|fallbackWeight/);
  assert.match(route, /slug:\s*profile\.slug/);
  assert.match(stakingPage, /loadActiveStakerProfiles/);
  assert.equal((ledgerPanel.match(/<h2\b/g) || []).length, 1);
  assert.match(route, /Invalid before cursor/);
  assert.match(route, /combinedNextCursor\(staking, groupedBets\)/);
  assert.match(route, /A hash is[\s\S]*not event identity/);
  assert.doesNotMatch(route, /const key = tx \? `tx:/);
});
