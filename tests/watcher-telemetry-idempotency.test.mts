import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
  readTelemetryEventId, isTelemetryIdDuplicateError, storeTelemetryIdempotently,
} from "../lib/watcherTelemetryIdempotency.ts";

const id="telemetry_1234567890abcdef1234567890abcdef";
const unique={code:"P2002",meta:{target:["telemetry_event_id"]}};
test("telemetry ID admits only canonical 128-bit event identities",()=>{
  assert.equal(readTelemetryEventId({telemetryEventId:id}),id);
  assert.equal(readTelemetryEventId({telemetryEventId:id.toUpperCase()}),id);
  for(const value of ["","oops","telemetry_1","telemetry_"+"x".repeat(32),null,32]){
    assert.equal(readTelemetryEventId({telemetryEventId:value}),null);
  }
  assert.equal(readTelemetryEventId(null),null);
  assert.equal(readTelemetryEventId([]),null);
});
test("database duplicate constraint is narrowly scoped to the event identity",()=>{
  assert.equal(isTelemetryIdDuplicateError(unique),true);
  assert.equal(isTelemetryIdDuplicateError({code:"P2002",meta:{target:"uq_watcher_client_events_telemetry_event_id"}}),true);
  assert.equal(isTelemetryIdDuplicateError({code:"P2002",meta:{target:["user_id"]}}),false);
  assert.equal(isTelemetryIdDuplicateError({code:"P2002"}),false);
  assert.equal(isTelemetryIdDuplicateError({code:"P1001"}),false);
});
const prisma7AdapterCollision={
  code:"P2002",
  meta:{
    modelName:"WatcherClientEvent",
    driverAdapterError:{
      name:"DriverAdapterError",
      cause:{
        originalCode:"23505",
        kind:"UniqueConstraintViolation",
        constraint:{index:"uq_watcher_client_events_telemetry_event_id"},
        table:"watcher_client_events",
      },
    },
  },
};
test("Prisma 7 PostgreSQL adapter telemetry collisions are acknowledged by exact index only",()=>{
  assert.equal(isTelemetryIdDuplicateError(prisma7AdapterCollision),true);
  assert.equal(isTelemetryIdDuplicateError({...prisma7AdapterCollision,meta:{
    ...prisma7AdapterCollision.meta,
    modelName:"User",
  }}),false,"a different Prisma model must not receive a false ACK");
  for(const [field,bad] of [
    ["originalCode","23503"],
    ["kind","ForeignKeyConstraintViolation"],
    ["constraint",{index:"uq_users_email"}],
  ]){
    const cause={...prisma7AdapterCollision.meta.driverAdapterError.cause,[field]:bad};
    assert.equal(isTelemetryIdDuplicateError({...prisma7AdapterCollision,meta:{
      ...prisma7AdapterCollision.meta,driverAdapterError:{cause},
    }}),false,"bad collision metadata "+field);
  }
  assert.equal(isTelemetryIdDuplicateError({...prisma7AdapterCollision,code:"P1001"}),false);
});

test("exact event retries are accepted only when database uniqueness proves duplication",async()=>{
  let calls=0;
  assert.equal(await storeTelemetryIdempotently(async()=>{calls++},id),"stored");
  assert.equal(await storeTelemetryIdempotently(async()=>{calls++;throw unique},id),"duplicate");
  assert.equal(calls,2);
  await assert.rejects(storeTelemetryIdempotently(async()=>{throw unique},null));
  await assert.rejects(storeTelemetryIdempotently(async()=>{throw {code:"P2002",meta:{target:["user_id"]}}},id));
  await assert.rejects(storeTelemetryIdempotently(async()=>{throw new Error("storage outage")},id));
});
test("simulated simultaneous replays of one ID create exactly one durable event",async()=>{
  const ledger=new Set<string>();
  let stored=0,duplicate=0;
  const attempts=await Promise.all(Array.from({length:40},()=>storeTelemetryIdempotently(async()=>{
    if(ledger.has(id)) throw unique;
    ledger.add(id);
  },id)));
  for(const outcome of attempts) outcome==="stored"?stored++:duplicate++;
  assert.equal(stored,1);
  assert.equal(duplicate,39);
});
test("SQL unique key and route's stored-versus-suppressed counts remain aligned",()=>{
  const schema=readFileSync(new URL("../prisma/schema.prisma",import.meta.url),"utf8");
  const route=readFileSync(new URL("../app/api/watcher/events/route.ts",import.meta.url),"utf8");
  const recorder=readFileSync(new URL("../lib/watcherTelemetry.ts",import.meta.url),"utf8");
  const migration=readFileSync(new URL("../prisma/migrations/20261020_030000_watcher_telemetry_event_id/migration.sql",import.meta.url),"utf8");
  assert.match(schema,/telemetryEventId String\? @unique\(map: "uq_watcher_client_events_telemetry_event_id"\)/);
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS "uq_watcher_client_events_telemetry_event_id"/);
  assert.match(route,/if \(result\.value\.duplicate\)/);
  assert.match(recorder,/telemetryEventId: eventId/);
});
