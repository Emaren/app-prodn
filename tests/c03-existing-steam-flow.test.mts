import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  admitVerifiedExistingSteamCallback,
  C03_BLOCKED_OPS,
  type VerifiedSteamCallbackInput,
} from '../lib/c03ExistingSteamFlow.ts';

const STEAM = '76561198000000000';
const NONCE = '2026-11-11T20:00:00ZephemeralSignedNonce';
const VALID = { uid: 'u_existing_admin', verification_level: 1 };
type HarnessOptions = {
  identities?: {uid:string;verification_level:number}[];
  rows?: Record<string, unknown>[];
  admin?: boolean;
  nonceFault?: boolean;
};
function harness(o: HarnessOptions = {}) {
  const calls: string[] = [];
  const reader = {
    async resolveExistingSteam(id: string) {
      assert.equal(id, STEAM);
      calls.push('resolve');
      return o.identities ?? [VALID];
    },
    async readExistingUser(uid: string) {
      calls.push('read');
      return o.rows ?? [{ uid, isAdmin: o.admin ?? true, steamId: STEAM }];
    },
  };
  const nonce = {
    async insertVerifiedCallbackNonce(digest: string, uid: string) {
      calls.push('nonce');
      if (o.nonceFault) throw new Error('duplicate nonce / sidecar outage');
      assert.equal(digest, createHash('sha256').update(NONCE).digest('hex'));
      assert.equal(uid, VALID.uid);
    },
  };
  return { calls, reader, nonce };
}
async function run(
  h: ReturnType<typeof harness>,
  input: Partial<VerifiedSteamCallbackInput> = {},
) {
  return admitVerifiedExistingSteamCallback({
    steamId: STEAM, responseNonce: NONCE, signedSessionUid: null, ...input
  }, h.reader, h.nonce);
}
test('existing linked admin preserves UID and role', async () => {
  const h = harness();
  const r = await run(h);
  assert.equal(r.uid, VALID.uid);
  assert.equal(r.user.isAdmin, true);
  assert.deepEqual(h.calls, ['resolve', 'read', 'nonce']);
});
test('existing linked ordinary user preserves false admin flag', async () => {
  const h = harness({admin:false});
  const r = await run(h);
  assert.equal(r.user.isAdmin, false);
});
test('same existing signed UID is allowed without linking', async () => {
  const h = harness();
  assert.equal((await run(h, {signedSessionUid: VALID.uid})).uid, VALID.uid);
});
test('unknown Steam denies BEFORE nonce claim', async () => {
  const h = harness({identities:[]});
  await assert.rejects(run(h), /UNKNOWN_OR_AMBIGUOUS/);
  assert.deepEqual(h.calls, ['resolve']);
});
test('ambiguous Steam denies before nonce claim', async () => {
  const h = harness({identities:[VALID,VALID]});
  await assert.rejects(run(h), /UNKNOWN_OR_AMBIGUOUS/);
  assert.deepEqual(h.calls, ['resolve']);
});
test('existing unlinked account cannot link new Steam', async () => {
  const h = harness({identities:[]});
  await assert.rejects(run(h,{signedSessionUid:'u_unlinked'}), /UNKNOWN_OR_AMBIGUOUS/);
  assert.deepEqual(h.calls, ['resolve']);
});
test('existing other-user session cannot switch accounts or link', async () => {
  const h = harness();
  await assert.rejects(run(h,{signedSessionUid:'u_different'}), /ACCOUNT_LINKING_OR_SWITCH/);
  assert.deepEqual(h.calls, ['resolve']);
});
test('unverified level cannot mint signed session', async () => {
  const h = harness({identities:[{...VALID, verification_level:0}]});
  await assert.rejects(run(h), /NOT_PREVIOUSLY_VERIFIED/);
  assert.deepEqual(h.calls, ['resolve']);
});
test('Steam ID is constrained to verified 17-digit provider value', async () => {
  const h = harness();
  await assert.rejects(run(h,{steamId:'0123'}), /PROVIDER_ID_NOT_VERIFIED/);
  assert.deepEqual(h.calls, []);
});
test('missing signed response nonce denies before reads', async () => {
  const h = harness();
  await assert.rejects(run(h,{responseNonce:''}), /SIGNED_OPENID_NONCE_MISSING/);
  assert.deepEqual(h.calls, []);
});
test('nonce replay or sidecar outage refuses cookie', async () => {
  const h = harness({nonceFault:true});
  await assert.rejects(run(h), /duplicate nonce/);
  assert.deepEqual(h.calls, ['resolve', 'read', 'nonce']);
});
test('user projection cannot contain financial legacy token', async () => {
  const h = harness({rows:[{uid:VALID.uid,isAdmin:true,token:'private'}]});
  await assert.rejects(run(h), /USER_PROJECTION_OR_ADMIN_MISMATCH/);
  assert.deepEqual(h.calls, ['resolve', 'read']);
});
test('user projection cannot flip UID or strip admin type', async () => {
  for (const row of [{uid:'u_changed',isAdmin:true},{uid:VALID.uid,isAdmin:'true'}]) {
    const h = harness({rows:[row]});
    await assert.rejects(run(h), /USER_PROJECTION_OR_ADMIN_MISMATCH/);
  }
});
test('registered/link/presence policy is explicitly blocked', () => {
  assert.equal(C03_BLOCKED_OPS.protectedLastSeen, 'NEVER_UPDATE_PUBLIC_USERS');
  assert.match(C03_BLOCKED_OPS.firstRegistration, /DISTINCT_FINANCIAL/);
  assert.match(C03_BLOCKED_OPS.accountLinking, /DISTINCT_FINANCIAL/);
});
