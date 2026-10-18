import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLatestKingdomIndexRefresh as eligible } from "../lib/kingdomIndexRefreshOrder.ts";

test("late older success and failure cannot mutate the latest Index snapshot",()=>{
  let latest=0, score="initial", disconnected=false;
  const started=()=>++latest;
  const first=started(), second=started();
  if(eligible(second,latest)){score="fresh";disconnected=false;}
  if(eligible(first,latest))score="obsolete";
  if(eligible(first,latest))disconnected=true;
  assert.equal(score,"fresh");
  assert.equal(disconnected,false);
  assert.equal(eligible(2,2),true);
  for(const invalid of [0, -1, NaN, Infinity, 0.5]){
    assert.equal(eligible(invalid,2),false);
  }
  assert.equal(eligible(1,2),false);
});

test("Index uses request token guards on both success and error paths",()=>{
  const source=readFileSync(new URL("../components/kingdom-index/KingdomIndex.tsx",import.meta.url),"utf8");
  assert.match(source,/useRef\(0\)/);
  assert.match(source,/requestId=\+\+latestRefreshId\.current/);
  assert.match(source,/setSnapshot\(next\);setConnectionLost\(false\)/);
  assert.match(source,/isLatestKingdomIndexRefresh\(requestId,latestRefreshId\.current\)/);
  assert.match(source,/setConnectionLost\(true\)/);
  assert.match(source,/signal\?\.aborted/);
});
