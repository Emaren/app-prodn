import test from "node:test";
import assert from "node:assert/strict";
import {
  isLibraryProvenanceAccessDenied,
  loadLibraryHistoricalSnapshot,
  selectLibraryHistoryPage,
} from "../lib/libraryHistoricalIndex.ts";

const fakeGame = {
  id: 910001,
  userUid: null,
  replayHash: "0123456789abcdef",
  createdAt: new Date("2026-11-18T12:00:00.000Z"),
  original_filename: null,
  replay_file: "",
  parse_source: "manual_upload",
  parse_reason: null,
  key_events: null,
  event_types: [],
  players: [],
  winner: null,
  disconnect_detected: false,
  is_final: true,
};
test("only explicit permission errors may degrade provenance",()=>{
  assert.equal(isLibraryProvenanceAccessDenied({code:"42501"}),true);
  assert.equal(isLibraryProvenanceAccessDenied({code:"P1010"}),true);
  assert.equal(isLibraryProvenanceAccessDenied({code:"P2010",meta:{code:"42501"}}),true);
  for (const value of [{code:"P2002"},{code:"57P01"},new Error("timeout"),null]) {
    assert.equal(isLibraryProvenanceAccessDenied(value),false);
  }
});
test("real final replay records survive receipt SELECT denial; never claim full source proof",async()=>{
  let gameReads=0, userReads=0, packageReads=0, batchReads=0;
  const prisma={
    gameStats:{
      findMany:async()=>{gameReads++;return [fakeGame];},
      findFirst:async()=>({id:fakeGame.id}),
    },
    user:{findMany:async()=>{userReads++;return [];}},
    $queryRaw:async(strings: TemplateStringsArray)=>{
      const sql = strings.join(" ");
      if (sql.includes("aoe2war_library_activity_public.replay_uploads")) {
        packageReads++; throw {code:"P1010"};
      }
      if (sql.includes("aoe2war_library_watcher_public.batch_receipts")) {
        batchReads++; throw {code:"42501"};
      }
      throw Error("Unexpected or unauthorized raw SQL read");
    },
  };
  const historical=await loadLibraryHistoricalSnapshot(prisma as never);
  assert.equal(gameReads,1);assert.equal(userReads,1);
  assert.equal(packageReads,1);assert.equal(batchReads,1);
  assert.equal(historical.total,1);
  assert.equal(historical.provenanceComplete,false);
  assert.deepEqual(historical.missingProvenanceSources,["package-receipts","watcher-batch-receipts"]);
  assert.equal(historical.entries[0].id,fakeGame.id);
  assert.equal(selectLibraryHistoryPage(historical,{
    filter:"all",before:null,after:null,limit:48,
  }).rows.length,1);
});
