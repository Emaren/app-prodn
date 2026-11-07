/** Genuine sequential SDK execution and anchored Comet/IAVL verification.
 * Synthetic validator/reviewer authority only: no PG credit, mainnet funds,
 * signer provisioning or runtime/solvency certification is exercised here. */
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import {authenticateWarSatchelFinancialProof,collectAndVerifyPinnedWarSatchelBankProof,financialProofFreshAt,
 type ExpectedWarSatchelFinancialProof} from "../lib/warSatchelAuthenticatedFinancialProof.ts";
import {verifySatchelSignedV2Return} from "../lib/warSatchelSignedV2Return.ts";

const digest=(x:unknown)=>createHash("sha256").update(JSON.stringify(x).replace(/[<>&\u2028\u2029]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"))).digest("hex");
test("genuine 10000-WOLO unmatched return authenticates with the unchanged pinned verifier",{
 skip:process.env.RUN_SATCHEL_REAL_CREDIT_TESTS!=="1"||!process.env.SATCHEL_TEST_MAX_AUTO_RETURN_FIXTURE,
 timeout:60000,
},async t=>{
 const fixture=JSON.parse(readFileSync(process.env.SATCHEL_TEST_MAX_AUTO_RETURN_FIXTURE!,"utf8"));
 assert.equal(fixture.fixture_only,true);assert.equal(fixture.mainnet_authority,false);
 assert.equal(fixture.production_custody_available,false);assert.equal(fixture.successful_transfers,3);
 assert.deepEqual(fixture.steps.map((s:{intent:{AmountUWolo:string}})=>s.intent.AmountUWolo),Array(3).fill("10000000000"));
 const [deposit,funding,returned]=fixture.steps,roles=fixture.roles;
 assert.equal(new Set([roles.owner,roles.vault,roles.escrow]).size,3);
 assert.equal(deposit.intent.Sender,roles.owner);assert.equal(funding.intent.Sender,roles.vault);
 assert.equal(funding.intent.Recipient,roles.escrow);assert.equal(returned.intent.Sender,roles.escrow);
 assert.equal(returned.intent.Recipient,roles.vault);assert.equal(returned.intent.Memo,"aoe2war/satchel/claim-return/v1/101");
 for(const step of fixture.steps){assert.equal(step.fee_uwolo,"1");assert.notEqual(step.replay_code,0);assert.ok(step.head_height-step.height>=3);}
 const states=fixture.bank_states,final=states.at(-1).balances_uwolo;
 assert.equal(final.owner,"0");assert.equal(final.vault,"10000000099");assert.equal(final.escrow,"99");
 assert.equal(final.opponent,states[0].balances_uwolo.opponent);assert.equal(fixture.total_fee_uwolo,"3");
 const sum=(values:Record<string,string>)=>Object.values(values).reduce((a,b)=>a+BigInt(b),0n);
 assert.equal(sum(final)+3n,sum(states[0].balances_uwolo),"full principal plus independent gas budgets conserve");
 const root=realpathSync(mkdtempSync("/tmp/hd-max-auto-return-"));
 const reviewer=generateKeyPairSync("ed25519"),publicKeyHex=reviewer.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex");
 const authority=path.join(root,"fixture-public-authority.json");
 writeFileSync(authority,JSON.stringify({trust_anchor:fixture.anchor,vault:roles.vault,betting_escrow:roles.escrow,approval_public_key_hex:publicKeyHex}),{mode:0o600});
 const old={...process.env};
 Object.assign(process.env,{WAR_SATCHEL_PROOF_VERIFIER_ENABLED:"true",WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED:"true",
  WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS:roles.vault,WAR_SATCHEL_SIGNER_AUTH_TOKEN:"T".repeat(64),
  WAR_SATCHEL_VERIFIER_BINARY:process.env.SATCHEL_TEST_BINARY,WAR_SATCHEL_VERIFIER_SHA256:process.env.SATCHEL_TEST_BINARY_SHA256,
  WAR_SATCHEL_VERIFIER_AUTHORITY_FILE:authority});
 const issued=Math.floor(Date.now()/1000)-1,principal="10000000000";
 const beforeReturn=states.find((s:{after:string})=>s.after==="wager");
 assert.equal(beforeReturn.balances_uwolo.escrow,"10000000100");
 // The synthetic reviewer refers to the actual SDK pre-return snapshot;
 // this signed reference is not a cryptographic escrow proof or solvency grant.
 function signedContext(funded=principal){
  const allocation={version:2,allocation_id:"allocation-max-auto",revision:1,operation_id:"satchel:ticket:1",owner_id:roles.owner_id,ticket_id:"1",funding_tx_hash:funding.tx_hash,
   return_cap_uwolo:principal,funds_budget_id:"isolated-escrow-budget",funds_available_uwolo:beforeReturn.balances_uwolo.escrow,
   bank_evidence_digest:digest(beforeReturn).toUpperCase(),bank_height:funding.vault_bank_proof.height,bank_block_hash:funding.observation.Head.BlockHash,
   legs:[{leg_id:"winner",market_id:"501",stake_uwolo:funded,entitlements:[{entitlement_id:"entitlement:101",claim_id:"101",claim_kind:"bet_refund",principal_uwolo:principal,amount_uwolo:principal}]}],
   issued_at:issued,expires_at:issued+120,signature:""};
  const base=["aoe2war/satchel/return-allocation/v2","wolo-1","uwolo",roles.escrow,roles.vault,2,allocation.allocation_id,1,allocation.operation_id,roles.owner_id,"1",funding.tx_hash,
   principal,allocation.funds_budget_id,allocation.funds_available_uwolo,allocation.bank_evidence_digest,allocation.bank_height,allocation.bank_block_hash,
   [["winner","501",funded,[["entitlement:101","101","bet_refund",principal,principal]]]]];
  allocation.signature=sign(null,Buffer.from(JSON.stringify([...base,issued,issued+120])),reviewer.privateKey).toString("base64");
  const approval={version:2,ticket_id:"1",market_id:"501",leg_id:"winner",entitlement_id:"entitlement:101",allocation,
   operation_id:allocation.operation_id,claim_id:"101",owner_id:roles.owner_id,claim_kind:"bet_refund",amount_uwolo:principal,allocation_digest:digest(base),issued_at:issued,expires_at:issued+120,signature:""};
  approval.signature=sign(null,Buffer.from(JSON.stringify(["aoe2war/satchel/claim-return-approval/v2","wolo-1","uwolo",roles.escrow,roles.vault,2,allocation.operation_id,"101",roles.owner_id,"1","501","winner","entitlement:101","bet_refund",principal,approval.allocation_digest,issued,issued+120])),reviewer.privateKey).toString("base64");
  return {protocol:1,kind:"claim_return",owner_id:roles.owner_id,operation_id:allocation.operation_id,sender:roles.escrow,recipient:roles.vault,amount_uwolo:principal,memo:returned.intent.Memo,tx_hash:returned.tx_hash,funded_amount_uwolo:funded,return_approval:approval};
 }
 const expected=(context=signedContext()):ExpectedWarSatchelFinancialProof=>({kind:"claim_return",ownerUid:roles.owner_id,operationId:context.operation_id,txHash:returned.tx_hash,vault:roles.vault,
  expectedContext:context,requestPath:"/satchel/v1/proofs/return",requestBody:{claim_id:"101"}});
 const envelope=(context=signedContext())=>({protocol:1,chain_id:"wolo-1",denom:"uwolo",context,context_digest:digest(context),tx_hash:returned.tx_hash,receipt_id:`wolo-1:${returned.tx_hash}:1`,
  transfer_index:1,message_index:0,height:returned.observation.Height,block_hash:returned.observation.BlockHash,consensus_authenticated:true,credit_authorized:false,proof:structuredClone(returned.proof)});
 const reader=(body:unknown)=>(async(url,options)=>{
  assert.equal(String(url),"http://127.0.0.1:8094/satchel/v1/proofs/return");assert.equal(options?.method,"POST");
  assert.equal(String(options?.body),JSON.stringify({claim_id:"101"}));return Response.json(body);
 }) as typeof fetch;
 const economicExpected={ownerId:roles.owner_id,operationId:"satchel:ticket:1",ticketId:"1",fundingTxHash:funding.tx_hash,claimId:"101",marketId:"501",legId:"winner",entitlementId:"entitlement:101",claimKind:"bet_refund" as const,
  amountUwolo:principal,principalUwolo:principal,stakeUwolo:principal,fundedAmountUwolo:principal,escrowAddress:roles.escrow,vaultAddress:roles.vault};
 try{
  await t.test("exact 10000 principal is both signed and consensus authenticated, never a credit",async()=>{
   const body=envelope();const proof=await authenticateWarSatchelFinancialProof(expected(body.context),reader(body));
   assert.equal(financialProofFreshAt(proof),true);assert.equal(proof.receiptId,body.receipt_id);assert.equal(proof.height,BigInt(returned.observation.Height));
   const economics=verifySatchelSignedV2Return({approval:body.context.return_approval,independentOperatorPublicKeyHex:publicKeyHex,expected:economicExpected});
   assert.equal(economics.amountUwolo,10_000_000_000n);assert.equal(economics.nonCrediting,true);assert.equal(body.credit_authorized,false);
  });
  await t.test("actual retained IAVL state contains the full returned principal and separate gas",async()=>{
   const bank=await collectAndVerifyPinnedWarSatchelBankProof(roles.vault,(async()=>Response.json(returned.vault_bank_proof)) as typeof fetch);
   assert.equal(bank.balanceUwolo,10_000_000_099n);assert.equal(bank.height,BigInt(returned.vault_bank_proof.height));
  });
  await t.test("genuinely signed original funding over10000 cannot reuse the real10000 return",async()=>{
   const c=signedContext("10001000000");
   assert.throws(()=>verifySatchelSignedV2Return({approval:c.return_approval,independentOperatorPublicKeyHex:publicKeyHex,
    expected:{...economicExpected,fundedAmountUwolo:"10001000000",stakeUwolo:"10001000000"}}),/invalid_reviewed_budget/);
   await assert.rejects(authenticateWarSatchelFinancialProof(expected(c),reader(envelope(c))),/financial proof UNVERIFIABLE/);
  });
  await t.test("forged committed transaction bytes cannot authenticate the principal return",async()=>{
   const body=envelope(),tx=body.proof.responses.find((r:{path:string})=>r.path==="/tx");assert.ok(tx);
   const bytes=Buffer.from(tx.body.result.tx,"base64");bytes[0]^=1;tx.body.result.tx=bytes.toString("base64");
   await assert.rejects(authenticateWarSatchelFinancialProof(expected(body.context),reader(body)),/financial proof UNVERIFIABLE/);
  });
 }finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);rmSync(root,{recursive:true,force:true});}
});
