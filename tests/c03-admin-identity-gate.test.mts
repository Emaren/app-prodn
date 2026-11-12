import assert from "node:assert/strict";
import test from "node:test";
import { c03ExistingAdminIdentity, c03DeniedLegacyAdminData } from "../lib/c03AdminIdentityGate.ts";

const ADMIN={uid:"u_existing_admin",isAdmin:true,id:1};
test("existing signed admin accepted without constructing protected Prisma",async()=>{
  const trace:string[]=[];
  const r=await c03ExistingAdminIdentity(ADMIN.uid,async uid=>{
    trace.push(uid);return ADMIN;
  });
  assert.equal(r?.uid,ADMIN.uid);
  assert.deepEqual(trace,[ADMIN.uid]);
});
test("existing signed ordinary user denied admin privileges",async()=>{
  const r=await c03ExistingAdminIdentity("scribe_existing",async uid=>
    ({uid,isAdmin:false,id:2}));
  assert.equal(r,null);
});
test("no signed identity never consults the reader",async()=>{
  let calls=0;
  for(const uid of [null,"","../financial/secret","x".repeat(150)]){
    const r=await c03ExistingAdminIdentity(uid,async()=>{
      calls++;return ADMIN;
    });
    assert.equal(r,null);
  }
  assert.equal(calls,0);
});
test("reader identity mismatch and malformed role/id are denied",async()=>{
  const cases=[
    {...ADMIN,uid:"u_other"}, {...ADMIN,isAdmin:false},
    {...ADMIN,id:0}, {...ADMIN,id:-1}, {...ADMIN,id:1.5},
  ];
  for(const row of cases){
    const r=await c03ExistingAdminIdentity(ADMIN.uid,async()=>row);
    assert.equal(r,null);
  }
});
test("sealed legacy admin datasource denies every model and raw query",()=>{
  const db=c03DeniedLegacyAdminData<Record<string,unknown>>();
  for(const key of ["user","$queryRaw","$executeRaw","$transaction","bountyPayout"]){
    assert.throws(()=>db[key],/C03_PROTECTED_ADMIN_PRISMA_NOT_ADMITTED/);
  }
  assert.throws(()=>Object.keys(db),/C03_PROTECTED_ADMIN_PRISMA_NOT_ADMITTED/);
  assert.throws(()=>{db.user={};},/C03_PROTECTED_ADMIN_PRISMA_NOT_ADMITTED/);
});
