import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("replay progressbar component requires and renders descriptive names",()=>{
 const s=read("components/replay-engine/HdReplayEngine.tsx");
 assert.match(s,/function Meter\(\{ value, max, label,/);
 assert.match(s,/label: string;/);
 assert.match(s,/role="progressbar" aria-label=\{label\}/);
 for(const name of ["Final game record intake","Verified player sides",
  "Decoded replay artifacts","Verified final results","Fully proven logical battles"]){
  assert.ok(s.includes('label="'+name+'"'),name);
 }
 assert.match(s,/label=\{row\.label\}/);
});
test("belt-only links in legacy Champions have independent accessible labels",()=>{
 const s=read("app/champions/legacy/page.tsx");
 assert.ok((s.match(/championship details/g)||[]).length>=5);
 assert.match(s,/aria-label=/);
});
test("Kingdom hero gives keyboard control to a distinct named button",()=>{
 const s=read("app/kingdom/KingdomHero.tsx");
 assert.match(s,/<button type="button" onClick=\{cycleTitle\}/);
 assert.match(s,/aria-label="Cycle Kingdom hero title styles"/);
 assert.doesNotMatch(s,/\btabIndex=\{0\}/);
 assert.doesNotMatch(s,/handleHeroKeyDown/);
 assert.match(s,/if \(target\.closest\("a,button"\)\) return;/);
});

test("unavailable replay gauges do not masquerade as measured zero",()=>{
 const s=read("components/kingdom-instruments/KingdomInstruments.tsx");
 assert.match(s,/role=\{valid \? "meter" : undefined\}/);
 assert.match(s,/aria-valuenow=\{valid \? fraction : undefined\}/);
 assert.match(s,/MEASUREMENT UNAVAILABLE/);
});
test("download installer commands are keyboard reachable",()=>{
 const s=read("app/download/page.tsx");
 assert.match(s,/<pre role="region" tabIndex=\{0\} aria-label="Watcher installation commands"/);
});

test("Academy variant controls are separately keyboard operable, not nested in a button",()=>{
 const s=read("app/academy/AcademyHero.tsx");
 assert.doesNotMatch(s,/role="button"/);
 assert.doesNotMatch(s,/tabIndex=\{0\}/);
 assert.doesNotMatch(s,/handleHeroKeyDown/);
 assert.match(s,/<nav className="clan-bae-toggle"/);
 assert.match(s,/aria-pressed=\{active\}/);
});
