import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_PROFILE_VIEW,
  isProfileViewVariant,
  profileViewFamily,
  profileViewStorageKey,
} from "../lib/profileViewVariant.ts";

test("E2 is the default and B/A/E have two explicit selectable variants", () => {
  assert.equal(DEFAULT_PROFILE_VIEW, "e2");
  for (const family of ["b", "a", "e"]) {
    for (const version of [1, 2]) {
      assert.equal(isProfileViewVariant(family + version), true);
    }
  }
  assert.equal(isProfileViewVariant("extreme"), false);
  assert.equal(profileViewFamily("e1"), "extreme");
  assert.equal(profileViewFamily("e2"), "extreme");
  assert.equal(profileViewFamily("b2"), "basic");
  assert.equal(profileViewFamily("a1"), "advanced");
});

test("profile view preferences are account scoped and encoded", () => {
  assert.notEqual(profileViewStorageKey("uid/a"), profileViewStorageKey("uid/b"));
  assert.match(profileViewStorageKey("uid/a"), /uid%2Fa/);
});

test("E2 renders on the existing Extreme profile stage and preserves E1", () => {
  const page = readFileSync(new URL("../app/profile/page.tsx", import.meta.url), "utf8");
  assert.match(page, /profileFamily === "extreme"/);
  assert.equal((page.match(/relative z-40 flex flex-wrap items-center justify-between gap-3/g) || []).length, 2);
  assert.match(page, /profileViewMode === "e2"/);
  assert.match(page, /readProfileViewVariant\(uid\)/);
  assert.match(page, /saveProfileViewVariant\(uid, next\)/);
  const selector = readFileSync(new URL("../components/profile/ProfileViewSelector.tsx", import.meta.url), "utf8");
  assert.match(selector, /onPointerEnter/);
  assert.match(selector, /onPointerLeave/);
  assert.match(selector, /onClick=\{\(\) => setOpen\(group\.family\)\}/);
  assert.match(selector, /onKeyDown/);
  assert.match(selector, /aria-expanded/);
});

test("profile E2 mounts a route-scoped query client before reading the wallet", () => {
  const profileLayout = readFileSync(new URL("../app/profile/layout.tsx", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../app/Providers.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/profile/page.tsx", import.meta.url), "utf8");
  const card = readFileSync(new URL("../components/profile/MechaAutoBetCard.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../hooks/useWoloBalance.ts", import.meta.url), "utf8");
  assert.match(profileLayout, /import\s*\{\s*Providers\s*\}\s*from\s*["']@\/app\/Providers["']/);
  assert.match(profileLayout, /return\s*<Providers>\{children\}<\/Providers>/);
  assert.match(provider, /<QueryClientProvider\s+client=\{queryClient\}>\{children\}<\/QueryClientProvider>/);
  assert.match(page, /profileViewMode === "e2"\s*\?\s*<MechaAutoBetCard/);
  assert.match(card, /useWoloBalance\(/);
  assert.match(hook, /useQuery<string>\(/);
  // Provider must remain route-scoped: no global wallet-query initialization.
  const rootLayout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(rootLayout, /QueryClientProvider|<Providers>/);
});

test("Mecha UI shows only server-owned preview status; not an on-chain wallet", () => {
  const card = readFileSync(new URL("../components/profile/MechaAutoBetCard.tsx", import.meta.url), "utf8");
  assert.match(card, /role="switch"/);
  assert.match(card, /AUTO BETTING \/\/ NEXT MATCH/);
  assert.match(card, /WAR SATCHEL/);
  assert.match(card, /NEXT MATCH BET/);
  assert.match(card, /BET PLAN/);
  assert.match(card, /DESYNC/);
  assert.doesNotMatch(card, /LOADOUT|D-SYNC OPTIONS|>DS</);
  assert.match(card, /NO WOLO MOVED · NO BET PLACED/);
  assert.match(card, /useKeplr\(\)/);
  assert.match(card, /useWoloBalance\(/);
  assert.match(card, /deriveWoloBalanceReadState\(/);
  assert.match(card, /formatMinimalDenomAmount\(/);
  assert.match(card, /walletStatus === "connected"/);
  assert.match(card, /Connect Keplr/);
  assert.match(card, /Chain verified/);
  assert.match(card, /LOAD SATCHEL/);
  assert.match(card, /WOLO FROM YOUR WALLET/);
  assert.match(card, /LOAD FROM WALLET · COMING SOON/);
  assert.doesNotMatch(card, /depositAmountValue <= 50_000/);
  assert.match(card, /disabled aria-disabled="true"/);
  assert.match(card, /escrow verification pending/);
  assert.match(card, /satchelVerifiedBalanceWolo: string \| null = null/);
  assert.match(card, /satchelVerifiedBalanceWolo \?\? "—"/);
  assert.doesNotMatch(card, /0 LOCKED|satchelVerified \? "0"/);
  assert.match(card, /DESYNC OPTIONS/);
  assert.match(card, /PREVIEW ACTIVE/);
  assert.match(card, /ARM PREVIEW/);
  assert.doesNotMatch(card, /onClick=.*sendTokens|SigningStargateClient|MsgSend/);
  assert.match(card, /MAX_AUTO_GAME_WOLO = 1_000/);
  assert.match(card, /expectedVersion: server.preset.version/);
  assert.match(card, /if \(armed\) void pause\(\)/);
  assert.match(card, /action: "pause"/);
  assert.match(card, /\/api\/user\/bet-automation/);
  const legacy = readFileSync(new URL("../components/profile/AutoBetReserveCard.tsx", import.meta.url), "utf8");
  assert.match(legacy, /maxPerGameWolo/);
  assert.match(legacy, /if \(enabled\) void pause\(\)/);
  const route = readFileSync(new URL("../app/api/user/bet-automation/route.ts", import.meta.url), "utf8");
  assert.match(route, /pauseOnly = body\?\.action === "pause"/);
  assert.match(route, /enabled: false, pausedReason: "user_paused"/);
});

test("Mecha wallet control is authenticated ADR-36 only, never a deposit authorization", () => {
  const card = readFileSync(new URL("../components/profile/MechaAutoBetCard.tsx", import.meta.url), "utf8");
  const control = readFileSync(new URL("../components/profile/WarSatchelWalletProof.tsx", import.meta.url), "utf8");
  const server = readFileSync(new URL("../app/api/user/war-satchel/wallet-proof/route.ts", import.meta.url), "utf8");
  assert.match(card, /<WarSatchelWalletProof walletAddress=/);
  assert.match(control, /signArbitrary\("wolo-1", walletAddress, challenge.message\)/);
  assert.match(control, /walletControlVerified !== true/);
  assert.match(control, /result.custodyApproved !== false/);
  assert.match(control, /result.creditAuthorized !== false/);
  assert.match(control, /result.wagerAuthorized !== false/);
  assert.match(control, /0 WOLO MOVED/);
  assert.doesNotMatch(control, /sendTokens|signAndBroadcast|MsgSend|bank\/send/);
  assert.match(server, /WAR_SATCHEL_OWNER_PROOF_ENABLED !== "true"/);
  assert.match(card, /LOAD FROM WALLET · COMING SOON/);
});
