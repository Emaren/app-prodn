import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"..");
const script="scripts/war-satchel-withdrawal-operator.mts";
const source=readFileSync(resolve(root,script),"utf8");
const UUID="fd000000-2222-4222-8222-000000000042";

function call(args: string[]) {
  return spawnSync(process.execPath,[
    "--experimental-strip-types",
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--experimental-loader","./scripts/aoe2-alias-loader.mjs",
    script,...args,
  ],{cwd:root,encoding:"utf8",timeout:25000,env:{
    ...process.env,
    // An arbitrary operator setting cannot defeat the source-level hold.
    WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED:"true",
    WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED:"true",
    WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED:"true",
    WAR_SATCHEL_WITHDRAWAL_EXECUTOR_READY:"true",
    WAR_SATCHEL_SIGNER_CLIENT_ENABLED:"true",
    WAR_SATCHEL_WITHDRAWAL_REVIEW_IMPORT_ENABLED:"true",
  }});
}

test("private operator defaults to explicit mode plus exact identity",()=>{
  const r=call([]);
  assert.equal(r.status,2, r.stderr);
  assert.match(r.stderr,/SATCHEL_WITHDRAW_OPERATOR_REFUSED:usage/);
  assert.doesNotMatch(r.stdout,/authorized|confirmed|submitted/i);
});

test("no financial config can override the compiled withdrawal custody hold",()=>{
  const r=call(["--inspect",UUID]);
  assert.equal(r.status,0,r.stderr);
  const value=JSON.parse(r.stdout) as Record<string,unknown>;
  assert.deepEqual(value,{
    mode:"inspect",state:"bridge_unverified_hold",noFundsMoved:true,
    signerInvoked:false,databaseQueried:false,
  });
});

test("mutating approval or execution refused before reading external files",()=>{
  for(const args of [["--execute",UUID],["--record-review","/definitely/not/present.json"]]){
    const r=call(args);
    assert.equal(r.status,2,r.stderr);
    assert.match(r.stderr,/SATCHEL_WITHDRAW_OPERATOR_FAILED_CLOSED/);
    assert.equal(r.stdout,"");
  }
});

test("new adapter delegates to one source-held already reviewed withdrawal runtime",()=>{
  assert.match(source,/processCertifiedSatchelWithdrawal\(prisma, value\)/);
  assert.match(source,/recordReviewedSatchelWithdrawalApproval\(prisma, review\)/);
  assert.match(source,/constants\.O_NOFOLLOW/);
  assert.match(source,/a\.uid !== 0/);
  assert.match(source,/\(a\.mode & 0o777\) !== 0o600/);
  assert.doesNotMatch(source,/broadcastTx|private.?key|mnemonic|execSync/);
});
