import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inspectTrafficContinuity } from "../lib/sessionCTrafficContinuity.mjs";
import { inspectWatcherTelemetry } from "../lib/sessionCWatcherVisibility.mjs";
import { inspectStorageCapacity } from "../lib/sessionCStorageCapacity.mjs";

const base = fileURLToPath(new URL("../", import.meta.url));
const original = (date,originalSessions,originalPageViews) => ({
  date,kind:"ORIGINAL_CERTIFIED_TRAFFIC_CLAIM",
  originalSessions,originalPageViews,
});
const observed = (date,observedQualifyingIps,observedGetEvents) => ({
  date,kind:"PROVISIONAL_OBSERVED_ONLY",certifiedHuman:false,
  observedQualifyingIps,observedGetEvents,
});
const traffic = () => ({
  certifiedDaily: [
    original("2026-10-17",5,12),
    original("2026-10-19",0,0),
  ],
  provisionalDaily: [
    observed("2026-10-21",2,9),
    observed("2026-10-23",1,4),
  ],
  certifiedBoundaryUtc:"2026-10-19",
  todayUtc:"2026-10-24",
});
const now = "2026-11-10T03:10:00Z";
const plane = (id,freeGiB=16,age="2026-11-10T02:00:00Z") => ({
  id,observedAt:age,
  totalBytes:100*1024**3,
  freeBytes:freeGiB*1024**3,
  serverVisualHmacVerified:true,
  sourceHmacVerifiedAtRead:false,
  durableBridgeAckVerified:false,
  scheduledCyclesVerified:0,
});

test("Traffic preserves original historical zeros, missing days as null, and separate observed claims",()=>{
  const output=inspectTrafficContinuity(traffic());
  assert.equal(output.status,"HOLD_PENDING_CANONICAL_SOURCE_CERTIFICATION");
  assert.deepEqual(output.missingOriginalDays,["2026-10-18"]);
  assert.deepEqual(output.missingProvisionalCompletedDays,["2026-10-20","2026-10-22"]);
  assert.equal(output.originalPoints.length,3);
  assert.equal(output.originalPoints[1].originalSessions,null);
  assert.equal(output.originalPoints[2].originalSessions,0);
  assert.equal(output.provisionalPoints[0].observedGetEvents,null);
  assert.equal(output.provisionalPoints[1].observedGetEvents,9);
  assert.equal(output.fakeZeroDays,0);
  assert.equal(output.certifiedMetricMergedWithObserved,false);
  assert.equal(output.canPublishAsCertifiedHistory,false);
});

test("Traffic partial today stays clearly unfinished and never merges with certified track",()=>{
  const value=traffic();
  value.provisionalDaily.push(observed("2026-10-24",1,8));
  const output=inspectTrafficContinuity(value);
  assert.equal(output.provisionalPoints.at(-1).dayComplete,false);
  assert.equal(output.provisionalPoints.at(-1).certifiedHuman,false);
  assert.equal(output.originalPoints.at(-1).date,"2026-10-19");
});

test("Traffic refuses overlaps and out-of-order original/candidate source",()=>{
  const overlap=traffic();overlap.provisionalDaily.unshift(observed("2026-10-19",1,1));
  assert.throws(()=>inspectTrafficContinuity(overlap),/OVERLAPS/);
  const duplicate=traffic();duplicate.certifiedDaily.push(original("2026-10-19",6,6));
  assert.throws(()=>inspectTrafficContinuity(duplicate),/DUPLICATE/);
  const badSource=traffic();badSource.certifiedDaily[0].kind="FAKE_CERTIFIED";
  assert.throws(()=>inspectTrafficContinuity(badSource),/WRONG_CERTIFIED/);
  const reversed=traffic();reversed.certifiedDaily.reverse();
  assert.throws(()=>inspectTrafficContinuity(reversed),/REGRESSED/);
});

test("Traffic rejects fabricated IP hierarchy and invalid/future UTC days",()=>{
  const fake=traffic();fake.provisionalDaily[0].observedQualifyingIps=99;
  assert.throws(()=>inspectTrafficContinuity(fake),/IP_OVER_GET/);
  const nonexistent=traffic();nonexistent.provisionalDaily[1].date="2026-02-30";
  assert.throws(()=>inspectTrafficContinuity(nonexistent),/INVALID_UTC_DAY/);
  const future=traffic();future.provisionalDaily.push(observed("2026-10-25",1,2));
  assert.throws(()=>inspectTrafficContinuity(future),/UNEXPECTED_PROVISIONAL/);
  const boundary=traffic();boundary.certifiedBoundaryUtc="2026-10-25";
  assert.throws(()=>inspectTrafficContinuity(boundary),/CERTIFICATION_FUTURE/);
});

test("Traffic cannot hide missing certified boundary or claim older provisional as certified",()=>{
  const missing=traffic();missing.certifiedDaily.pop();
  assert.throws(()=>inspectTrafficContinuity(missing),/BOUNDARY_NOT_IN_ORIGINAL/);
  const claimed=traffic();claimed.provisionalDaily[0].certifiedHuman=true;
  assert.throws(()=>inspectTrafficContinuity(claimed),/PROVISIONAL_MISLABELED/);
});

test("Watcher current heartbeat is observational only, with no current game proof",()=>{
  const result=inspectWatcherTelemetry({
    nowUtc:now,
    events:[{
      version:"1.6.5",lastSeenUtc:"2026-11-10T03:08:00Z",
      connected:true,serverVerified:true,userId:928737,
      watcherId:"NEVER_LEAK_DEVICE_IDENTIFIER",
    }],
  });
  assert.equal(result.classifications.current,1);
  assert.equal(result.classifications.monitoringClaimProven,0);
  assert.equal(result.connectedMeansReplayMonitoring,false);
  assert.equal(result.canAutoNotifyOrRestart,false);
  assert.ok(!JSON.stringify(result).includes("NEVER_LEAK"));
  assert.ok(!JSON.stringify(result).includes("928737"));
});

test("Watcher flags stale, future clock, version mismatch, disconnect and unverified data",()=>{
  const sample=(update)=>({
    version:"1.6.5",lastSeenUtc:"2026-11-10T03:09:00Z",
    connected:true,serverVerified:true,...update,
  });
  const result=inspectWatcherTelemetry({nowUtc:now,events:[
    sample({lastSeenUtc:"2026-11-10T02:00:00Z"}),
    sample({lastSeenUtc:"2026-11-10T03:20:00Z"}),
    sample({version:"1.6.4"}),
    sample({connected:false}),
    sample({serverVerified:false}),
  ]});
  assert.deepEqual(result.classifications,{
    current:0,stale:1,future:1,outdatedVersion:1,
    disconnected:1,unverified:1,monitoringClaimProven:0,
  });
});

test("Watcher rejects ambiguous timezone and huge telemetry payloads",()=>{
  assert.throws(()=>inspectWatcherTelemetry({nowUtc:now,events:[
    {version:"1.6.5",lastSeenUtc:"2026-11-10T03:09:00",
     connected:true,serverVerified:true},
  ]}),/INVALID_UTC/);
  assert.throws(()=>inspectWatcherTelemetry({nowUtc:now,
    thresholdSeconds:0}),/UNBOUNDED/);
  assert.throws(()=>inspectWatcherTelemetry({nowUtc:now,
    events:new Array(201).fill({})}),/UNBOUNDED/);
});

test("Storage accepts only three signed-visual planes and preserves backup UNKNOWN",()=>{
  const report=inspectStorageCapacity({nowUtc:now,planes:[
    plane("mac",16),
    plane("hel1-root",6),
    plane("hel1-volume-105319120",22),
  ]});
  assert.equal(report.status,"HOLD_PRIVATE_SIGNED_RECOVERY_NOT_PROVEN");
  assert.equal(report.planes[0].belowFloor,true);
  assert.equal(report.planes[0].floorGiB,30);
  assert.equal(report.planes[1].belowFloor,true);
  assert.equal(report.planes[2].belowFloor,false);
  assert.equal(report.planes[2].capacityGiB,100);
  assert.equal(report.warnings.length,2);
  assert.equal(report.c06BackupCertified,false);
  assert.equal(report.c07RestoreCertified,false);
  assert.equal(report.deletionAuthorized,false);
  assert.equal(report.planes[0].durableBackupVerified,false);
});

test("Storage missing/stale plane is UNKNOWN, never zero or healthy",()=>{
  const report=inspectStorageCapacity({
    nowUtc:now,planes:[plane("mac",16,"2026-11-07T00:00:00Z")],
  });
  assert.equal(report.planes[0].status,"STALE_OR_FUTURE_VISUAL");
  assert.equal(report.planes[0].availableGiB,null);
  assert.equal(report.planes[1].availableGiB,null);
  assert.equal(report.planes[1].belowFloor,null);
  assert.equal(report.warnings.length,3);
});

test("Storage refuses forged backup ACK, source HMAC and implausible capacity",()=>{
  const input=plane("mac");
  for (const payload of [
    {...input,durableBridgeAckVerified:true},
    {...input,sourceHmacVerifiedAtRead:true},
    {...input,scheduledCyclesVerified:1},
    {...input,id:"finance-vault"},
  ]) {
    assert.throws(()=>inspectStorageCapacity({nowUtc:now,
      planes:[payload]}),/FORGED_SOURCE_OR_DUPLICATE/);
  }
  assert.throws(()=>inspectStorageCapacity({nowUtc:now,
    planes:[plane("mac"),plane("mac")]}),/FORGED_SOURCE_OR_DUPLICATE/);
  assert.throws(()=>inspectStorageCapacity({nowUtc:now,
    planes:[{...input,freeBytes:101*1024**3}]}),/INCONSISTENT_BYTES/);
});

test("Watcher and Storage reject normalized impossible calendar timestamps",()=>{
  assert.throws(()=>inspectWatcherTelemetry({
    nowUtc:now,events:[{
      version:"1.6.5",lastSeenUtc:"2026-02-30T03:08:00Z",
      connected:true,serverVerified:true,
    }],
  }),/UNREAL_UTC_CALENDAR/);
  assert.throws(()=>inspectStorageCapacity({
    nowUtc:now,planes:[plane("mac",16,"2026-02-30T03:08:00Z")],
  }),/UNREAL_UTC_CALENDAR/);
});

test("Storage source is a non-mutating, unmounted PRODUCT read model",()=>{
  const files=[
    "lib/sessionCTrafficContinuity.mjs",
    "lib/sessionCWatcherVisibility.mjs",
    "lib/sessionCStorageCapacity.mjs",
  ];
  for (const path of files) {
    const source=readFileSync(fileURLToPath(new URL("../"+path,
      import.meta.url)),"utf8");
    assert.ok(!source.includes("fetch("));
    assert.ok(!source.includes("execSync("));
    assert.ok(!source.includes("DELETE FROM"));
    assert.ok(!source.includes("import { prisma"));
    assert.ok(!source.includes("NEXT_PUBLIC_"));
  }
  const appRoutes=readFileSync(fileURLToPath(new URL(
    "../config/session-c-kingdom-traders-seam.json",import.meta.url)),"utf8");
  assert.equal(JSON.parse(appRoutes).routeMounted,false);
});


test("Unmounted responsive ops panel exposes no route, secrets or live remote fetch", () => {
  const panel=readFileSync(fileURLToPath(new URL(
    "../components/SessionCNonfinancialObservationPanel.tsx",
    import.meta.url)),"utf8");
  assert.match(panel,/role="status"/);
  assert.match(panel,/gridTemplateColumns:/);
  assert.match(panel,/min\(100%,230px\)/);
  assert.match(panel,/SOURCE REVIEW ONLY/);
  assert.match(panel,/original Traffic graph remains authoritative/);
  assert.ok(!panel.includes("fetch("));
  assert.ok(!panel.includes("<button"));
  assert.ok(!panel.includes("useEffect"));
  assert.ok(!panel.includes("NEXT_PUBLIC_"));
  assert.ok(!panel.includes("Authorization"));
  assert.ok(!panel.includes("setInterval"));
});
