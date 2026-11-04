import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectPublicStationRows } from "../lib/nonfinancialPublicRadio.ts";

const sql = readFileSync(
  new URL("../config/nonfinancial-public-radio-v2.sql",import.meta.url), "utf8",
);
const station = (overrides:Record<string,unknown>={})=>({
  state: "on_air", startedAt:new Date("2026-10-07T23:44:51Z"),
  stoppedAt:null, programId:42,
  programPublicId:"65efc499-4376-4135-a5d2-a7fe2a8829a9",
  programName:"New Broadcast Hour", programStatus:"ready",
  itemId:15,itemPosition:0,itemTransition:"cut",itemCrossfadeMs:0,
  assetPublicId:"62cfadae-fdbc-4448-9141-ab2466a1fa6e",
  assetTitle:"Original test composition",assetCredit:null,
  assetKind:"music",assetDurationMs:25000,assetIsReady:true,
  ...overrides,
});

test("only explicitly published and rights-consented submissions enter the public list",()=>{
  assert.match(sql, /status='published' AND rights_accepted IS TRUE AND published_at IS NOT NULL/);
  const subsection=sql.split("CREATE OR REPLACE VIEW aoe2war_public_v2.radio_published_tracks")[1]
    .split("REVOKE ALL")[0];
  for(const secret of ["contact_email","contact_discord","notes","admin_note",
                       "submitter_uid","created_by_uid","rights_statement_version"])
    assert.doesNotMatch(subsection,new RegExp(secret));
});

test("station preview presents real active ready program item",()=>{
  const result=projectPublicStationRows([station()]);
  assert.equal(result?.state,"on_air");
  assert.equal(result?.program?.items.length,1);
  assert.equal(result?.program?.items[0].asset.title,"Original test composition");
  assert.equal(result?.program?.name,"New Broadcast Hour");
});

test("rejects inconsistent current state and unpublished assets instead of fabricating a station",()=>{
  assert.throws(()=>projectPublicStationRows([
    station(),station({state:"off_air",itemPosition:1}),
  ]),/INCONSISTENT/);
  assert.throws(()=>projectPublicStationRows([station({assetIsReady:false})]),/NOT_READY/);
  assert.throws(()=>projectPublicStationRows([station({itemPosition:null})]),/NOT_READY/);
  assert.throws(()=>projectPublicStationRows([station({programStatus:"draft"})]),/NOT_PUBLISHED_READY/);
  assert.throws(()=>projectPublicStationRows([station({assetDurationMs:0})]),/NOT_READY/);
  assert.throws(()=>projectPublicStationRows([station({itemId:null})]),/WITHOUT_ITEMS/);
  assert.throws(()=>projectPublicStationRows([
    station(),station({itemId:16}),
  ]),/NOT_READY/);
});

test("off-air singleton and absent row never pretend on-air playback exists",()=>{
  assert.equal(projectPublicStationRows([]),null);
  const result=projectPublicStationRows([
    station({state:"off_air",startedAt:null,programId:null,
      programPublicId:null,programName:null,programStatus:null,
      itemId:null,itemPosition:null,assetPublicId:null,assetIsReady:null}),
  ]);
  assert.equal(result?.state,"off_air");
  assert.equal(result?.program,null);
});

test("three Radio public endpoints use a single scoped adapter",()=>{
  for(const file of [
    "../app/radio/page.tsx",
    "../app/api/radio/tracks/[publicId]/audio/route.ts",
    "../app/api/radio/tracks/[publicId]/artwork/route.ts",
    "../app/api/radio/station/route.ts",
  ]){
    const source=readFileSync(new URL(file,import.meta.url),"utf8");
    assert.match(source,/nonfinancialPublicRadio/);
    assert.doesNotMatch(source,/\.radioSubmission\.find(Many|First)\(/);
    assert.doesNotMatch(source,/\.radioStationState\.findUnique\(/);
  }
});

test("no blanket raw-table SELECT or write authority is granted",()=>{
  const grants=[...sql.matchAll(/^GRANT SELECT ON ([^ ]+) TO aoe2war_web_prod;$/gm)]
    .map(match=>match[1]);
  assert.deepEqual(grants,[
    "aoe2war_public_v2.radio_published_tracks",
    "aoe2war_public_v2.radio_station_display",
  ]);
  assert.doesNotMatch(sql,/GRANT (?:ALL|INSERT|UPDATE|DELETE) ON/);
  assert.match(sql,/PUBLIC_RADIO_PRIVATE_AUTHORITY_DRIFT/);
  for(const raw of ["radio_submissions","radio_programs","radio_assets",
                     "radio_program_items","radio_station_state"]){
    assert.match(sql,new RegExp("has_table_privilege\\('aoe2war_web_prod','public\\."+raw+"'"));
  }
});
