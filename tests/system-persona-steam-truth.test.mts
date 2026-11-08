import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isInternalSystemUid,
  AI_CONCIERGE_UID,
  AI_GRIMER_UID,
  AOE2WAR_HALL_SCRIBE_UID,
  CHALLENGE_PROTOCOL_UID,
} from "../lib/internalSystemAccounts.ts";

test("AI Scribe, Grimer, Hall Scribe and Challenge Protocol are reserved, not Steam identities", () => {
  for (const uid of [AI_CONCIERGE_UID,AI_GRIMER_UID,AOE2WAR_HALL_SCRIBE_UID,CHALLENGE_PROTOCOL_UID]) {
    assert.equal(isInternalSystemUid(uid),true);
  }
  assert.equal(isInternalSystemUid("second-steam-account"),false);
  assert.equal(isInternalSystemUid("The AI Scribe"),false);
});

test("claimed system personas cannot display unjustified Steam-linked or replay badges", () => {
  const directory=readFileSync("app/players/page.tsx","utf8");
  const profile=readFileSync("components/players/PlayerProfilePage.tsx","utf8");
  assert.match(directory,/isInternalSystemUid\(entry.uid\)/);
  assert.match(directory,/isActuallySteamLinked = !isSystemPersona && Boolean\(entry.steamId\)/);
  assert.match(directory,/internal system persona · no Steam login/);
  assert.match(directory,/Automated persona/);
  assert.match(directory,/!isSystemPersona && entry.verified && entry.replayEvidence.length > 0/);
  assert.doesNotMatch(directory,/entry.claimed \? <SteamLinkedBadge compact/);
  assert.match(profile,/profile.steam.steamId/);
  assert.match(profile,/isInternalSystemUid\(profile.identity.uid\)/);
  assert.match(profile,/Internal system profile/);
  assert.doesNotMatch(profile,/profile.verificationLevel > 0 \? <SteamLinkedBadge/);
});
