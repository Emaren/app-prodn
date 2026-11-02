import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path:string)=>readFileSync(path,"utf8");
const token = 'NEXT_PUBLIC_AOE2WAR_ISOLATED_GET_ONLY';
test("GET-only build flag is set only on the disposable Renaissance Chrome job",()=>{
  const workflow=read(".github/workflows/renaissance-88-a11y-preview.yml");
  const anchor="      "+token+": '1'";
  assert.equal(workflow.split(anchor).length-1,1);
  const chrome=workflow.indexOf("  chrome:");
  const source=workflow.indexOf("  source:");
  const position=workflow.indexOf(anchor);
  assert.ok(chrome>=0 && position>chrome);
  assert.ok(source<0 || position>source);
});
test("external analytics scripts are under the exact opt-in quiet-preview branch",()=>{
  const src=read("app/layout.tsx");
  assert.match(src,/const isolatedGetOnlyPreview\s*=\s*process\.env\.NEXT_PUBLIC_AOE2WAR_ISOLATED_GET_ONLY === "1"/);
  assert.match(src,/\{!isolatedGetOnlyPreview && \(/);
  assert.equal((src.match(/src="https:\/\/plausible\.io\/js\/script\.js"/g)||[]).length,1);
  assert.equal((src.match(/src="https:\/\/traffic\.tokentap\.ca\/api\/beacon\.js"/g)||[]).length,1);
});
test("CI-only quiet preview refuses speed and presence publication before fetch",()=>{
  const speed=read("lib/speed/transport.ts");
  const presence=read("components/presence/LivingKingdomClient.tsx");
  assert.match(speed,/if \(process\.env\.NEXT_PUBLIC_AOE2WAR_ISOLATED_GET_ONLY === "1"\) return;/);
  assert.match(presence,/if \(process\.env\.NEXT_PUBLIC_AOE2WAR_ISOLATED_GET_ONLY === "1"\) return null;/);
  assert.ok(speed.indexOf(token)<speed.indexOf('fetch("/api/speed/sample"'));
  assert.ok(presence.indexOf(token)<presence.indexOf('endpoint: "/api/kingdom-presence/anonymous-state"'));
});
test("original browser interceptor still aborts all foreign and mutation requests",()=>{
 const browser=read("scripts/aoe2_release_r16_w1safe_disposable_chrome.cjs");
 assert.match(browser,/const foreign=u\.origin!==base/);
 assert.match(browser,/const mutating=!\["GET","HEAD"\]\.includes\(req\.method\(\)\)/);
 assert.match(browser,/if \(foreign \|\| mutating\)/);
 assert.match(browser,/return route\.abort\(\)/);
 assert.match(browser,/process\.exitCode=report\.status===\"PASS\"\?0:2/);
});
