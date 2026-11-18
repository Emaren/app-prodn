import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import { verifySocialSignedSession } from "../lib/socialWriterSession.mjs";

const key="owner-local-isolated-social-jwt-synthetic-key-0001";
const keyBytes=new TextEncoder().encode(key);
const make=async ({
  uid="u_alice",issuer="aoe2hdbets",alg="HS256",
  iat=Math.floor(Date.now()/1000)-3,exp=Math.floor(Date.now()/1000)+120,
  secret=keyBytes,
}={})=>
  new SignJWT({uid}).setProtectedHeader({alg}).setIssuer(issuer)
    .setIssuedAt(iat).setExpirationTime(exp).sign(secret);

test("genuine legacy HS256 session becomes only the bounded UID",async()=>{
  assert.equal(await verifySocialSignedSession(await make(),key),"u_alice");
});
test("no token, malformed token, changed signing key all rejected",async()=>{
  await assert.rejects(()=>verifySocialSignedSession(null,key));
  await assert.rejects(()=>verifySocialSignedSession("x".repeat(64),key));
  await assert.rejects(()=>make().then(t=>verifySocialSignedSession(t,key+"x")));
});
test("incorrect issuer and non-HS256 signature rejected",async()=>{
  await assert.rejects(()=>make({issuer:"other"}).then(t=>verifySocialSignedSession(t,key)));
  await assert.rejects(()=>make({alg:"HS512"}).then(t=>verifySocialSignedSession(t,key)));
});
test("expired, future-issued, overlong and forged-identity claims rejected",async()=>{
  const now=Math.floor(Date.now()/1000);
  await assert.rejects(()=>make({iat:now-120,exp:now-60}).then(t=>verifySocialSignedSession(t,key)));
  await assert.rejects(()=>make({iat:now+30,exp:now+300}).then(t=>verifySocialSignedSession(t,key)));
  await assert.rejects(()=>make({iat:now-2,exp:now+31*86400}).then(t=>verifySocialSignedSession(t,key)));
  await assert.rejects(()=>make({uid:"../../admin"}).then(t=>verifySocialSignedSession(t,key)));
  await assert.rejects(()=>make({uid:"x".repeat(101)}).then(t=>verifySocialSignedSession(t,key)));
});
