import assert from "node:assert/strict";
import test from "node:test";
import {
  reconstructLibraryOrigins,
  matchesLibraryOriginFilter,
  type LibraryHistoryRow,
} from "../lib/libraryHistoricalProvenance.ts";
import { selectLibraryHistoryPage } from "../lib/libraryHistoricalIndex.ts";

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 9, 19, 0, seconds));
function row(id: number, source: string, name: string, uid = "jim"): LibraryHistoryRow {
  return {
    id,
    userUid: uid,
    replayHash: id.toString(16).padStart(64, "0"),
    createdAt: at(id),
    original_filename: name,
    replay_file: name,
    parse_source: source,
    key_events: {},
  };
}

test("old ZIP filename evidence upgrades only a unique same-uploader nearby game and stays inferred", () => {
  const rows = [row(10,"file_upload","Unique.aoe2record"),
    row(11,"file_upload","Collision.aoe2record"),
    row(12,"file_upload","Collision.aoe2record"),
    row(13,"file_upload","Unique.aoe2record","not-jim")];
  const result = reconstructLibraryOrigins(rows, [{
    createdAt: at(60),
    uid: "jim",
    metadata: { filenames: ["Unique.aoe2record","Collision.aoe2record"] },
  }], []);
  assert.deepEqual(result.get(10), {
    kind: "manual-zip", evidence: "zip-legacy-correlation",
  });
  assert.equal(result.get(11)?.kind, "manual");
  assert.equal(result.get(12)?.kind, "manual");
  assert.equal(result.get(13)?.kind, "manual");
});

test("multiple possible historic ZIP receipts cannot silently claim a row", () => {
  const game = row(10,"file_upload","Same.aoe2record");
  const result = reconstructLibraryOrigins([game], [20,40].map(second => ({
    createdAt: at(second), uid: "jim",
    metadata: { filenames: ["Same.aoe2record"] },
  })), []);
  assert.equal(result.get(10)?.kind,"manual");
});

test("new exact ZIP game-ID receipt wins and cross-account claims fail", () => {
  const games=[row(10,"file_upload","Archive.aoe2record")];
  const result=reconstructLibraryOrigins(games, [
    { createdAt: at(20), uid:"not-jim", metadata:{ gameIds:[10] } },
    { createdAt: at(30), uid:"jim", metadata:{ gameIds:[10] } },
  ],[]);
  assert.deepEqual(result.get(10), {kind:"manual-zip", evidence:"zip-exact-id"});
});

test("watcher batch telemetry joins only matching uploader+hash+nearby time", () => {
  const g=row(11,"watcher_final","saved.aoe2record");
  const batch=[{createdAt:at(30),userUid:"not-jim",replayHash:g.replayHash},
    {createdAt:at(32),userUid:"jim",replayHash:g.replayHash}];
  const result=reconstructLibraryOrigins([g],[],batch);
  assert.deepEqual(result.get(11),{kind:"watcher-batch",evidence:"watcher-batch-telemetry"});
  const failed=reconstructLibraryOrigins([g],[],batch.slice(0,1));
  assert.equal(failed.get(11)?.kind,"watcher-legacy");
});

test("an explicit historical_import always labels batch independent of telemetry",()=>{
  const g={...row(31,"watcher_final","abc.aoe2record"),key_events:{
    watcher_upload: { ingestion_provenance:"historical_import" },
  }};
  assert.equal(reconstructLibraryOrigins([g],[],[]).get(31)?.kind,"watcher-batch");
});

test("full-history source filters page the desired cohort before slicing",()=>{
  const types = ["manual","watcher-live","manual-zip","watcher-batch"] as const;
  const entries=Array.from({length:120},(_,i)=>({
    id:120-i,
    source:{kind:types[i % types.length],evidence:"source-record" as const},
    ordinal:120-i,
    userUid:"jim",
    createdAt:at(0),
    unknownOutcome:false,
    checkpoint:false,
  }));
  const snapshot={generatedAt:"",total:120,last24h:120,entries,
    byId:new Map(entries.map(e=>[e.id,e])),profiles:[],totalByOrigin:{} as never};
  const first=selectLibraryHistoryPage(snapshot,{filter:"manual-zip",before:null,after:null,limit:5});
  assert.equal(first.filterTotal,30);
  assert.equal(first.rows.length,5);
  assert.equal(first.rows[0].source.kind,"manual-zip");
  assert.ok(first.hasMore);
  const second=selectLibraryHistoryPage(snapshot,{filter:"manual-zip",before:first.nextBefore,after:null,limit:5});
  assert.equal(second.rows[0].id,first.rows[4].id-4);
  assert.ok(!first.rows.some(a=>second.rows.some(b=>a.id===b.id)));
  const newPage=selectLibraryHistoryPage(snapshot,{filter:"all",before:null,after:109,limit:4});
  assert.deepEqual(newPage.rows.map(x=>x.id),[113,112,111,110]);
  assert.equal(matchesLibraryOriginFilter("watcher-legacy","other"),true);
});
