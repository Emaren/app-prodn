import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("components/challenge/ChallengeWorkspace.tsx", "utf8");
const championship = readFileSync("lib/championshipChallenges.ts", "utf8");
const config = readFileSync("lib/challengeConfig.ts", "utf8");
const protocol = readFileSync("lib/challengeChampionshipProtocol.ts", "utf8");

test("championship challenges default to zero WOLO and expose only 0 or 100", () => {
  assert.match(config, /CHAMPIONSHIP_DEFAULT_WAGER_WOLO = 0/);
  assert.match(config, /CHAMPIONSHIP_CHALLENGE_WAGER_OPTIONS = \[0, 100\]/);
  assert.match(workspace, /CHAMPIONSHIP_CHALLENGE_WAGER_OPTIONS\.map/);
  assert.match(workspace, /setWagerAmountWolo\(String\(CHAMPIONSHIP_DEFAULT_WAGER_WOLO\)\)/);
  assert.doesNotMatch(championship, /Put positive WOLO on the line/);
  assert.match(championship, /Championship stake must be 0 or 100 WOLO/);
});

test("issuing a championship challenge does not require escrow or wallet funding", () => {
  assert.match(workspace, /if \(!version2 && \(!snapshot\.fundingRail\.configured/);
  assert.match(workspace, /if \(!version2 && \(walletStatus !== "connected"/);
  assert.match(workspace, /if \(version2\) \{[\s\S]*?replaceSnapshot\(payload\)[\s\S]*?Challenge sent/);
  assert.match(workspace, /Watcher required/);
  assert.match(workspace, /Watcher proof\. No wallet required\./);
  assert.match(workspace, /No wallet transaction is required to issue the Challenge\./);
  assert.doesNotMatch(workspace, /Your signed WOLO funds the Challenge purse\. Every warrior funds their own share\./);
  assert.doesNotMatch(workspace, /Accept, fund, and start the qualifying battle within the same server-owned window\./);
});

test("watcher proof owns the championship start copy", () => {
  assert.match(workspace, /A watcher-verified start stops the title-default clock\./);
  assert.match(workspace, /placeholder=\{version2 \? "Call out your rival"/);
  assert.match(protocol, /watcher-verified start owns the competitive clock/);
  assert.doesNotMatch(protocol, /Accept only to confirm and fund WOLO terms/);
  const roomControls = readFileSync("components/challenge/ChallengeRoomControls.tsx", "utf8");
  assert.doesNotMatch(roomControls, /accept and fund only if you want the WOLO stake matched/);
});

test("championship hero reserves glyph breathing room", () => {
  assert.match(workspace, /pb-\[0\.14em\] pr-\[0\.12em\]/);
  assert.match(workspace, /leading-\[0\.96\]/);
});
