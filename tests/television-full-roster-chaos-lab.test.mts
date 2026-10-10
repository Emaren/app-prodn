import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const client=readFileSync("components/television/TelevisionWoloExperience.tsx","utf8");
test("Chaos nomination shows full 4v4 or uneven 8v1 roster, not just the first four",()=>{
  assert.match(client,/playerNames.slice\(0, 16\)/);
  assert.doesNotMatch(client,/playerNames.slice\(0, 4\)/);
  assert.match(client,/candidates.map\(\(name, index\) =>/);
});
test("duplicate names are blocked until signed stable player identity exists",()=>{
  assert.match(client,/disabled=\{!postgame \|\| \(counts.get\(name.trim\(\).toLocaleLowerCase\(\)\)/);
  assert.match(client,/Duplicate display names cannot be nominated safely/);
});
test("full-roster lab remains explicitly non-binding, never changes Chaos custody",()=>{
  assert.match(client,/Chaos Vote Lab/);
  assert.match(client,/Non-binding sandbox/);
  assert.match(client,/nothing is written, no ballot is counted, and title custody cannot change/);
});

test("spectator nominations remain unavailable while the battle is live",()=>{
  assert.match(client,/battle.source !== "live"/);
  assert.match(client,/Spectator nominations unlock after this battle finishes/);
});
