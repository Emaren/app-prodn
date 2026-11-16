import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { projectAdminDirectory, ADMIN_DIRECTORY_LIMIT, ADMIN_DIRECTORY_SCHEMA } from "../lib/adminNonfinancialDirectoryProjection.ts";

const file = (relative: string) =>
  readFileSync(new URL("../" + relative, import.meta.url), "utf8");

const valid = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  uid: "u_verified",
  inGameName: "Emaren",
  steamPersonaName: "Steam Emaren",
  steamId: "76561190000000001",
  verified: true,
  verificationLevel: 2,
  createdAt: new Date("2026-08-01T10:00:00.000Z"),
  ...overrides,
});

test("real registered identities are counted without pretending to know warrior claims", () => {
  const result = projectAdminDirectory([
    valid(), valid({
      id: 2, uid: "u_scribe", inGameName: null,
      steamPersonaName: "Scribe", steamId: null,
      verified: false, verificationLevel: 0,
    }),
  ]);
  assert.equal(result.schema, ADMIN_DIRECTORY_SCHEMA);
  assert.deepEqual(result.summary, {
    registeredAccounts: 2,
    verifiedProfiles: 1,
    steamLinkedProfiles: 1,
  });
  assert.equal(result.users[0].displayName, "Emaren");
  assert.equal(result.users[1].displayName, "Scribe");
  assert.equal(result.unavailable.warriorClaimState, "REQUIRES_SEPARATE_CLAIM_READER");
  assert.equal(result.unavailable.financialAndWolo, "RESTRICTED");
  assert.equal("claimedWarriors" in result.summary, false);
  assert.equal("isAdmin" in result.users[0], false);
  assert.equal("walletAddress" in result.users[0], false);
  assert.equal("email" in result.users[0], false);
  assert.equal("token" in result.users[0], false);
});

test("empty approved identity census is a true empty result, not an invented error default", () => {
  const result = projectAdminDirectory([]);
  assert.deepEqual(result.users, []);
  assert.equal(result.summary.registeredAccounts, 0);
  assert.equal(result.unavailable.perAccountAdminRole, "REQUIRES_SEPARATE_ADMIN_READER");
});

test("bounded reader refuses truncated census rather than misreporting 1000", () => {
  const rows = Array.from({ length: ADMIN_DIRECTORY_LIMIT + 1 }, (_, index) =>
    valid({ id: index + 1, uid: "u_" + index }),
  );
  assert.throws(() => projectAdminDirectory(rows), /OVER_BOUNDED_LIMIT/);
});

test("rejects duplicate, malformed and unsafe source identity rows", () => {
  assert.throws(
    () => projectAdminDirectory([valid(), valid({ id: 2 })]),
    /SOURCE_ROW_INVALID/,
  );
  for (const row of [
    valid({ id: -1 }),
    valid({ id: 1.1 }),
    valid({ uid: "" }),
    valid({ uid: "u".repeat(101) }),
    valid({ verified: "true" }),
    valid({ verificationLevel: 1.2 }),
    valid({ createdAt: "2026-08-01" }),
    valid({ createdAt: new Date(NaN) }),
  ]) {
    assert.throws(() => projectAdminDirectory([row as ReturnType<typeof valid>]), /SOURCE_ROW_INVALID/);
  }
});

test("the query is read-only, bounded and limited to admitted public_v5 identity columns", () => {
  const source = file("lib/adminNonfinancialDirectory.ts");
  const sql = source.slice(source.indexOf("Prisma.sql`"));
  assert.match(sql, /FROM aoe2war_public_v5\.user_profiles/);
  assert.match(source, /LIMIT \$\{ADMIN_DIRECTORY_LIMIT \+ 1\}/);
  assert.match(source, /ORDER BY created_at ASC, id ASC/);
  for (const restricted of [
    "public.users", "radio_listener_states", "bet_wagers", "bet_auto_presets",
    "pending_wolo_claims", "trophies", "INSERT ", "UPDATE ", "DELETE ", "GRANT ",
  ]) {
    assert.doesNotMatch(sql, new RegExp(restricted.replace(".", "\\.")));
  }
  for (const field of ["email", "wallet_address", "token", "is_admin", "claimed"]) {
    assert.doesNotMatch(source, new RegExp("\\b" + field + "\\b", "i"));
  }
});

test("new directory GET requires actual signed admin before any user enumeration", () => {
  const route = file("app/api/admin/user-directory/route.ts");
  const signed = route.indexOf("await requireAdmin");
  const denied = route.indexOf('if ("error" in gate)');
  const profile = route.indexOf("if (!isNonfinancialPublicReadProfile())");
  const reader = route.indexOf("await loadAdminNonfinancialDirectory(gate.prisma)");
  assert.ok(signed >= 0 && signed < denied && denied < profile && profile < reader);
  assert.match(route, /"Cache-Control": "private, no-store/);
  assert.match(route, /Vary: "Cookie"/);
});

test("protected legacy GET short-circuits BEFORE trophy seed or betting intent writes", () => {
  const legacy = file("app/api/admin/users/route.ts");
  const start = legacy.indexOf("export async function GET");
  const auth = legacy.indexOf("await requireAdmin(request)", start);
  const scoped = legacy.indexOf("if (isNonfinancialPublicReadProfile())", start);
  const seed = legacy.indexOf("await ensureTrophySeedData(prisma)", start);
  const stake = legacy.indexOf("await refreshRecoverableBetStakeIntents(", start);
  assert.ok(start >= 0 && auth > start && scoped > auth && seed > scoped && stake > scoped);
  assert.match(legacy.slice(scoped, seed), /loadAdminNonfinancialDirectory\(prisma\)/);
});

test("production page uses new safe directory instead of hidden legacy bootstrap", () => {
  const page = file("app/admin/user-list/page.tsx");
  const guard = page.indexOf("await requireServerAdmin()");
  const render = page.indexOf("<AdminNonfinancialDirectoryPage />");
  assert.ok(guard >= 0 && guard < render);
  assert.match(page, /isNonfinancialPublicReadProfile\(\)/);
  const client = file("components/admin/command-tower/AdminNonfinancialDirectoryPage.tsx");
  assert.match(client, /fetch\("\/api\/admin\/user-directory"/);
  assert.doesNotMatch(client, /fetch\("\/api\/admin\/users"/);
  assert.match(client, /SiteThemeCampaignPanel/);
  assert.match(client, /ADMIN_ATLAS_ROUTES/);
  assert.match(client, /separate reviewed readers/);
});
