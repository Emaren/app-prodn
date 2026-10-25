import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {prospectiveEpochDepositIssue,type DurableProspectiveEpoch,type ProspectiveDepositFacts} from "../lib/warSatchelDurableEpoch.ts";
import {SATCHEL_FINANCIAL_BRIDGE_READY} from "../lib/warSatchelFinancialBridgeHold.ts";
const source=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sha=(c:string)=>c.repeat(64);
const vault="wolo1"+"p".repeat(38),wallet="wolo1"+"q".repeat(38);
const at=new Date("2026-10-24T19:10:00.000Z");
const epoch:DurableProspectiveEpoch={epochId:"sample_future_epoch",chainId:"wolo-1",vault,
 startHeight:900n,startAppHash:sha("a"),manifestDigest:sha("b"),
 sourceCommit:"c".repeat(40),legacyClaimsDigest:sha("d"),legacyLiabilitiesDigest:sha("e"),
 custodyWitnessDigest:sha("f"),recoveryWitnessDigest:sha("1"),reservesWitnessDigest:sha("2"),
 fiveReviewerDigest:sha("3"),chainAnchorWitnessDigest:sha("4"),state:"approved",
 approvedAt:new Date("2026-10-24T19:00:00.000Z"),createdAt:new Date("2026-10-24T19:00:01.000Z")};
const facts:ProspectiveDepositFacts={ownerUserId:51,ownerUid:"owner51",ownerWallet:wallet,
 intentCreatedAt:at,vault,txHeight:901n,txHash:"A".repeat(64),txOwnerUid:"owner51",
 txSender:wallet,bankHeight:903n,bankVault:vault};
test("held: exact future epoch positive predicate is STRUCTURAL only, not custody release",()=>{
 assert.equal(prospectiveEpochDepositIssue(epoch,facts),null);
 assert.equal(SATCHEL_FINANCIAL_BRIDGE_READY,false);
 const hold=source("lib/warSatchelFinancialBridgeHold.ts");
 assert.match(hold,/SATCHEL_FINANCIAL_BRIDGE_READY = false as const/);
 const epochSource=source("lib/warSatchelDurableEpoch.ts");
 assert.doesNotMatch(epochSource,/submitOneShot|broadcastTx|wallet\.sign|bank\.send/);
});
test("no retrospective deposits, stale bank or forged vault/owner can pass",()=>{
 const fail=(e:DurableProspectiveEpoch|null,f:ProspectiveDepositFacts)=>assert.notEqual(prospectiveEpochDepositIssue(e,f),null);
 fail(null,facts);
 fail({...epoch,state:"held"},facts);
 fail(epoch,{...facts,txHeight:900n});
 fail(epoch,{...facts,txHeight:899n});
 fail(epoch,{...facts,bankHeight:902n});
 fail(epoch,{...facts,vault:wallet});
 fail(epoch,{...facts,bankVault:wallet});
 fail(epoch,{...facts,txSender:vault});
 fail(epoch,{...facts,txOwnerUid:"not-owner"});
 fail(epoch,{...facts,ownerUserId:0});
 fail(epoch,{...facts,txHash:"0".repeat(64)});
 fail(epoch,{...facts,intentCreatedAt:new Date("2026-10-24T18:59:59.999Z")});
 fail({...epoch,approvedAt:null},facts);
 fail({...epoch,chainId:"not-wolo"},facts);
 fail({...epoch,legacyLiabilitiesDigest:"0".repeat(64)},facts);
 fail({...epoch,sourceCommit:"0".repeat(64)},facts);
});
test("all credit paths require inside-transaction epoch binding; original claims untouched",()=>{
 const ledger=source("lib/warSatchelFundedLedger.ts");
 const start=ledger.indexOf("export async function creditRecordedSatchelProof");
 const end=ledger.indexOf("export async function reserveForWatcherExecution");
 const credit=ledger.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(credit,/withExclusiveSatchelTx\(prisma/);
 assert.match(credit,/requireDurableProspectiveDepositEpoch\(tx/);
 assert.match(credit,/requirePhysicalConsumption\(tx,"deposit",receipt\)/);
 assert.match(credit,/bindDurableEpochReceipt\(tx/);
 assert.ok(credit.indexOf("requireDurableProspectiveDepositEpoch")<credit.indexOf("satchelFundedReceipt.create"));
 assert.ok(credit.indexOf("bindDurableEpochReceipt")<credit.indexOf("satchelFundedJournal.create"));
 assert.match(source("lib/warSatchelDurableEpoch.ts"),/WHERE state='approved'/);
 assert.match(source("lib/warSatchelDurableEpoch.ts"),/LIMIT 2 FOR SHARE/);
 const sql=source("prisma/migrations/20261024_233000_war_satchel_prospective_epoch_admission/migration.sql");
 assert.match(sql,/UNIQUE \("chain_id","tx_hash","message_index"\)/);
 assert.match(sql,/SATCHEL_EPOCH_IMMUTABLE/);
 assert.match(source("lib/warSatchelDurableEpoch.ts"),/FROM public\.war_satchel_prospective_epochs/);
 assert.match(source("lib/warSatchelDurableEpoch.ts"),/INSERT INTO public\.war_satchel_epoch_deposit_receipts/);
 assert.match(sql,/CREATE TABLE public\."war_satchel_prospective_epochs"/);
 assert.match(sql,/CREATE TABLE public\."war_satchel_epoch_deposit_receipts"/);

 assert.match(sql,/OWNER TO aoe2war_epoch_finance_owner/);
 assert.match(sql,/GRANT SELECT ON public\."war_satchel_prospective_epochs" TO aoe2war_epoch_credit_writer/);
 assert.match(sql,/GRANT SELECT, INSERT ON public\."war_satchel_epoch_deposit_receipts" TO aoe2war_epoch_credit_writer/);
 assert.match(sql,/SATCHEL_EPOCH_FINANCE_ROLE_PREENROLLED/);
 assert.match(sql,/NOLOGIN NOINHERIT NOSUPERUSER/);
 assert.doesNotMatch(sql,/GRANT (?:INSERT|ALL) ON public\."war_satchel_prospective_epochs" TO aoe2war_epoch_credit_writer/);

 assert.match(sql,/SATCHEL_EPOCH_OLD_FUNDED_ESTATE_NOT_EMPTY/);
 assert.match(sql,/satchel_epoch_cold_start_v1"\(\) RETURNS TRIGGER LANGUAGE plpgsql AS \$\$/);
 assert.match(sql,/END;\s*\$\$;\s*CREATE TRIGGER "tr_satchel_epoch_cold_start"/);
 assert.match(source("lib/warSatchelDurableEpoch.ts"),/legacy_funded_estate_requires_segregation/);
 assert.match(sql,/canonical_height <= e.start_height/);
 assert.doesNotMatch(sql,/DELETE FROM pending_wolo_claims|UPDATE pending_wolo_claims|TRUNCATE pending_wolo_claims/);
});
