/** Actual Prisma writers + native SDK/Comet execution on one isolated chain.
 * Private ephemeral reviewer authority and fixtures never certify mainnet.
 * No inherited database, signer, RPC, bearer or wallet configuration is used. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash,generateKeyPairSync,randomUUID,sign} from "node:crypto";
import {mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import type {IsolatedSatchelSigner} from "../lib/warSatchelAutoBetExecutor.ts";
import type {SatchelWagerSnapshot} from "../lib/warSatchelWagerAuthorization.ts";
import type {SatchelWagerReservation} from "../lib/warSatchelWagerReservation.ts";
import {startLifecycleDatabase,installLifecycleFinancialAdmission,seedLifecycleOwnerAndMarkets,lifecycleOwnerKey} from "./fixtures/satchel-lifecycle-db.mts";

const U=1000000n;
const digest=(x:unknown)=>createHash("sha256").update(JSON.stringify(x).replace(/[<>&\u2028\u2029]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"))).digest("hex");
// Exact SDK GenPrivKeyFromSecret field mapping, fixture keys only.
const fixtureKey=(role:string)=>((BigInt("0x"+createHash("sha256").update("isolated-satchel-lifecycle-test-only/"+role).digest("hex"))%(BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141")-1n))+1n).toString(16).padStart(64,"0");
type RecipeStep={name:string;sender_role:string;recipient_role:string;amount_uwolo:string;memo:string};
type PortableProof={responses:{source:string;path:string;query:string;body:unknown}[]};
type DepositIntent={OwnerID:string;Sender:string;Vault:string;AmountUWolo:string;Memo:string;CreatedAt:string;ExpiresAt:string};
type NativeStep={name:string;intent:{Sender:string;Recipient:string;AmountUWolo:string;Memo:string};tx_hash:string;
  proof:PortableProof;observation:{Height:number;BlockHash:string;Head:{Height:number;BlockHash:string}};vault_balance_uwolo:string;
  vault_bank_proof:{height:number};deposit_intent?:DepositIntent;deposit_proof?:PortableProof};
type NativeBankState={balances_uwolo:Record<string,string>;cumulative_fee_uwolo:string};
type NativeFixture={fixture_only:true;mainnet_authority:false;now:string;anchor:unknown;roles:Record<string,string>;steps:NativeStep[];bank_states:NativeBankState[]};


// Each case owns one private PostgreSQL cluster and one genuine SDK chain.
// Review signatures and signer delivery are controlled fixture authorities.
// Canonical settlement creates claims; test orchestration attaches the genuine
// SDK payout hashes. The production escrow payout executor is not exercised.
// Every credited transfer/bank proof passes the unmodified pinned CLI.
test("canonical two-market claims and native authenticated HD credit conserve one 100-WOLO ticket", {
  skip: process.env.RUN_SATCHEL_FULL_LIFECYCLE_TESTS !== "1", timeout: 360000,
}, async t => {
  assert.equal(process.env.RUN_SATCHEL_REAL_CREDIT_TESTS, "1");
  for (const team of [false, true]) for (const reversed of [false, true]) {
    await t.test(`${team ? "team" : "solo"}, ${reversed ? "Desync" : "winner"} return first`, {timeout: 90000}, async () => {
      const source=process.env.SATCHEL_LIFECYCLE_WOLO_SOURCE!, binary=process.env.SATCHEL_TEST_BINARY!;
      assert.ok(path.isAbsolute(source) && path.isAbsolute(binary));
      const root=realpathSync(mkdtempSync("/tmp/aoe2-satchel-two-market-")), db=await startLifecycleDatabase();
      const originalFetch=globalThis.fetch, originalEnv={...process.env};
      const reviewer=generateKeyPairSync("ed25519"), financial=generateKeyPairSync("ed25519");
      const pub=(key:typeof reviewer)=>key.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex");
      const vault=lifecycleOwnerKey(fixtureKey("vault")).walletAddress, escrow=lifecycleOwnerKey(fixtureKey("escrow")).walletAddress;
      const ownerKey=lifecycleOwnerKey(fixtureKey("owner")), opponentKey=lifecycleOwnerKey(fixtureKey("opponent"));
      const authority=path.join(root,"financial-authority.json"), wagerAuthority=path.join(root,"wager-proof-authority.json"), wagerKeyFile=path.join(root,"wager-reviewer.json");
      let fixture:NativeFixture, bankStep:NativeStep, withdrawalContext:Record<string,unknown>;
      const reservationReviews=new Map<string,SatchelWagerReservation>(), returnContexts=new Map<string,Record<string,unknown>>();
      const nativeReturnByClaim=new Map<string,string>();
      let sends=0;
      const returnNames=reversed ? ["return_desync","return_winner"] : ["return_winner","return_desync"];
      const recipe:RecipeStep[]=[
        {name:"deposit",sender_role:"owner",recipient_role:"vault",amount_uwolo:"100000000",memo:"aoe2war/satchel/v1/lifecycle-owner/abcdefghijklmnop"},
        {name:"wager",sender_role:"vault",recipient_role:"escrow",amount_uwolo:"100000000",memo:"AoE2HDBets bet ticket v1 · ticket 1"},
        {name:"opponent",sender_role:"opponent",recipient_role:"escrow",amount_uwolo:"40000000",memo:"AoE2HDBets bet stake · market 1"},
        ...returnNames.map(name=>({name,sender_role:"escrow",recipient_role:"vault",amount_uwolo:name==="return_winner"?"78000000":"60000000",memo:"aoe2war/satchel/claim-return/v1/"+(name==="return_winner"?101:102)})),
      ];
      function nativeExport(now?:string) {
        const file=path.join(root,"recipe.json");
        writeFileSync(file,JSON.stringify({version:1,scenario:"two_market_ticket",...(now?{now}:{}),steps:recipe}),{mode:0o600});
        const env:NodeJS.ProcessEnv={...process.env,CGO_ENABLED:"0",SATCHEL_LIFECYCLE_RECIPE:file,SATCHEL_LIFECYCLE_FIXTURE_DIR:root,GOTOOLCHAIN:"local",GOENV:"off",GOWORK:"off",GOFLAGS:""};
        for(const k of Object.keys(env))if(k==="DATABASE_URL"||k==="DIRECT_URL"||k.startsWith("PG"))delete env[k];
        execFileSync("go",["test","-tags=go1.27","./internal/satchel","-run","^TestAuthenticatedContinuousSDKLifecycle$","-count=1"],{cwd:source,env,stdio:"pipe",timeout:60000});
        const value:NativeFixture=JSON.parse(readFileSync(path.join(root,"two_market_ticket/isolated-sdk-lifecycle.json"),"utf8"));
        assert.equal(value.fixture_only,true); assert.equal(value.mainnet_authority,false); return value;
      }
      function nativeStep(name:string) {const step=fixture.steps.find(s=>s.name===name); assert.ok(step,name); return step;}
      function envelope(step:NativeStep,context:unknown,deposit=false) {
        const o=step.observation;
        return {protocol:1,chain_id:"wolo-1",denom:"uwolo",context,context_digest:digest(context),tx_hash:step.tx_hash,
          receipt_id:`wolo-1:${step.tx_hash}:${deposit?0:1}`,transfer_index:deposit?0:1,message_index:0,height:o.Height,block_hash:o.BlockHash,
          consensus_authenticated:true,credit_authorized:false,proof:deposit?step.deposit_proof:step.proof};
      }
      try {
        // Public aliases take priority inside woloChain.ts at module import.
        // Scrub inherited overrides even when this test is invoked directly.
        for(const key of Object.keys(process.env))if(key.startsWith("NEXT_PUBLIC_WOLO_"))delete process.env[key];
        Object.assign(process.env,{BET_AUTOMATION_MODE:"shadow",WOLO_CHAIN_ID:"wolo-1",NEXT_PUBLIC_WOLO_CHAIN_ID:"wolo-1",
          WOLO_BET_ESCROW_ADDRESS:escrow,NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS:escrow,WOLO_BET_PAYOUT_ADDRESS:ownerKey.walletAddress,
          WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS:vault,WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED:"true",WAR_SATCHEL_FUNDED_LEDGER_ENABLED:"true",
          WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED:"true",WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED:"true",WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED:"true",
          WAR_SATCHEL_LIVE_EXECUTOR_ENABLED:"true",WAR_SATCHEL_AUTO_CONSENT_ENABLED:"true",WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED:"true",
          WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED:"true",WAR_SATCHEL_CLAIM_RETURN_CREDIT_ENABLED:"true",WAR_SATCHEL_RETURN_REVIEW_IMPORT_ENABLED:"true",
          WAR_SATCHEL_PROOF_VERIFIER_ENABLED:"true",WAR_SATCHEL_SIGNER_AUTH_TOKEN:"isolated_test_"+"t".repeat(64),
          WAR_SATCHEL_VERIFIER_BINARY:binary,WAR_SATCHEL_VERIFIER_SHA256:process.env.SATCHEL_TEST_BINARY_SHA256,
          WAR_SATCHEL_VERIFIER_AUTHORITY_FILE:authority,WAR_SATCHEL_WAGER_PROOF_VERIFIER_AUTHORITY_FILE:wagerAuthority,
          WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE:wagerKeyFile,WAR_SATCHEL_RETURN_APPROVAL_PUBLIC_KEY_HEX:pub(financial),
          WAR_SATCHEL_SIGNER_CLIENT_ENABLED:"true",WAR_SATCHEL_WITHDRAWAL_EXECUTOR_READY:"true"});
        const seeded=await seedLifecycleOwnerAndMarkets(db,{ownerPrivateKeyHex:fixtureKey("owner"),ownerUid:"lifecycle-owner",stakeWolo:40,
          desyncSide:"yes",desyncStakeWolo:60,gamesRemaining:1,team,sessionKey:"watcher:two-market"});
        assert.ok(seeded.desyncMarket);
        assert.equal(seeded.market.id,1,"native stake memo binds actual canonical market ID");
        await db.sql.query("ALTER SEQUENCE pending_wolo_claims_id_seq RESTART WITH 101");
        fixture=nativeExport(); bankStep=nativeStep("deposit");
        assert.equal(fixture.roles.owner,ownerKey.walletAddress); assert.equal(fixture.roles.vault,vault); assert.equal(fixture.roles.escrow,escrow);
        writeFileSync(authority,JSON.stringify({trust_anchor:fixture.anchor,vault,betting_escrow:escrow,approval_public_key_hex:pub(financial)}),{mode:0o600});
        writeFileSync(wagerAuthority,JSON.stringify({trust_anchor:fixture.anchor,vault,betting_escrow:escrow,approval_public_key_hex:pub(financial),wager_approval_public_key_hex:pub(reviewer)}),{mode:0o600});
        writeFileSync(wagerKeyFile,JSON.stringify({wager_approval_public_key_hex:pub(reviewer)}),{mode:0o600});
        const ledger=await import("../lib/warSatchelFundedLedger.ts"), deposit=await import("../lib/warSatchelAuthenticatedDeposit.ts"), shadow=await import("../lib/betAutomationShadowWorker.ts"), executor=await import("../lib/warSatchelAutoBetExecutor.ts");
        const wager=await import("../lib/warSatchelWagerAuthorization.ts"), review=await import("../lib/warSatchelWagerReservation.ts");
        const canonical=await import("../lib/bets.ts") as unknown as {settleIsolatedLifecycleMarkets(prisma:typeof db.prisma):Promise<void>};
        const returnReview=await import("../lib/warSatchelClaimReturnAuthorization.ts"), returnProof=await import("../lib/warSatchelAuthenticatedClaimReturn.ts");
        const intents=await import("../lib/betStakeIntents.ts"), manual=await import("../lib/betWagering.ts");
        const opponent=await db.prisma.user.create({data:{uid:"lifecycle-opponent",walletAddress:opponentKey.walletAddress,inGameName:"LifecycleOpponent",steamId:"76561198000000002",verified:true,verificationLevel:2}});
        globalThis.fetch=(async(url,options)=>{
          const target=String(url),body=options?.body?JSON.parse(String(options.body)):{};
          if(target.endsWith("/satchel/v1/proofs/bank")){assert.deepEqual(body,{protocol:1});return Response.json(bankStep.vault_bank_proof);}
          if(target.endsWith("/satchel/v1/proofs/deposit")){
            const step=nativeStep("deposit"),i=step.deposit_intent!;
            return Response.json(envelope(step,{protocol:1,kind:"deposit",owner_id:i.OwnerID,sender:i.Sender,recipient:i.Vault,amount_uwolo:i.AmountUWolo,memo:i.Memo,tx_hash:step.tx_hash,created_at:new Date(i.CreatedAt).toISOString(),expires_at:new Date(i.ExpiresAt).toISOString()},true));
          }
          if(target.endsWith("/satchel/v1/proofs/operation")){
            if(String(body.operation_id).startsWith("satchel:withdrawal:"))return Response.json(envelope(nativeStep("withdrawal"),withdrawalContext));
            const step=nativeStep("wager"),row=await db.prisma.satchelWagerAuthorization.findUniqueOrThrow({where:{operationId:body.operation_id}});
            return Response.json(envelope(step,wager.wagerFinancialContext(wager.buildSatchelWagerAuthorization(row.snapshotJson as unknown as SatchelWagerSnapshot),reservationReviews.get(body.operation_id)!,step.tx_hash)));
          }
          if(target.endsWith("/satchel/v1/proofs/return")){
            const name=nativeReturnByClaim.get(String(body.claim_id));assert.ok(name);
            const step=nativeStep(name);bankStep=step;return Response.json(envelope(step,returnContexts.get(String(body.claim_id))));
          }
          const transaction=/\/cosmos\/tx\/v1beta1\/txs\/([A-F0-9]{64})$/.exec(target);
          if(transaction){const step=fixture.steps.find(s=>s.tx_hash===transaction[1]);assert.ok(step);const rest=step.proof.responses.find(r=>r.source==="rest");assert.ok(rest);return Response.json(rest.body);}
          throw Error("unexpected isolated financial network access: "+target);
        }) as typeof fetch;
        const nativeDeposit=nativeStep("deposit"),i=nativeDeposit.deposit_intent!,tx=nativeDeposit.tx_hash,intentId=randomUUID();
        await db.prisma.warSatchelDepositIntent.create({data:{id:intentId,userId:seeded.owner.id,senderAddress:i.Sender,vaultAddress:vault,amountUwolo:100n*U,memo:i.Memo,nonce:"abcdefghijklmnop",createdAt:new Date(i.CreatedAt),expiresAt:new Date(i.ExpiresAt)}});
        const candidate=await db.prisma.warSatchelProofCandidate.create({data:{intentId,userId:seeded.owner.id,chainId:"wolo-1",txHash:tx,transferIndex:0,senderAddress:i.Sender,vaultAddress:vault,amountUwolo:100n*U,txHeight:BigInt(nativeDeposit.observation.Height),verifiedAt:new Date()}});
        const authenticated=await deposit.authenticateOwnerDeposit({intentId,ownerUid:seeded.owner.uid,sender:i.Sender,vault,amountUwolo:"100000000",memo:i.Memo,createdAtUtc:new Date(i.CreatedAt).toISOString(),expiresAtUtc:new Date(i.ExpiresAt).toISOString(),txHash:tx});
        const creditInput={ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid,proofCandidateId:candidate.id,expectedTxHash:tx,authenticatedDeposit:authenticated,bank:await ledger.readIndependentSatchelBank()};
        await ledger.creditRecordedSatchelProof(db.prisma,creditInput);
        await ledger.creditRecordedSatchelProof(db.prisma,creditInput);
        assert.equal(await db.prisma.satchelFundedReceipt.count(),1);
        const signer:IsolatedSatchelSigner={attestedVaultAddress:vault,custodyRole:"exclusive-war-satchel-v1",async submitOneShot(input){
          sends++;assert.equal(sends,1);const step=nativeStep("wager");
          assert.equal(input.ownerUid,seeded.owner.uid);assert.equal(input.senderAddress,vault);assert.equal(input.recipientAddress,escrow);
          assert.equal(input.chainId,"wolo-1");assert.equal(input.denom,"uwolo");assert.equal(input.amountUwolo,"100000000");
          assert.equal(input.memo,step.intent.Memo);assert.deepEqual(input.reservation,reservationReviews.get(input.requestId));bankStep=step;
          return {kind:"broadcast_accepted",txHash:step.tx_hash};
        }};
        const produced=await shadow.runBetAutoShadowWorker(db.prisma,{activeSessions:[seeded.session],env:{BET_AUTOMATION_MODE:"shadow"}});
        assert.equal(produced.createdCount,1);
        const execution=await db.prisma.betAutoExecution.findFirstOrThrow({where:{winnerMarketId:seeded.market.id}});
        assert.equal(execution.selectedSide,"left");assert.equal(execution.desyncMarketId,seeded.desyncMarket.id);
        assert.equal(seeded.session.players.filter(p=>p.teamId==="1").length,team?2:1);
        await executor.executeFundedMechaTicketBatch(db.prisma,signer,[execution.id]);
        assert.equal(sends,0,"independent review required before first send");
        const row=await db.prisma.satchelWagerAuthorization.findUniqueOrThrow({where:{operationId:"satchel:ticket:"+execution.id}}),a=wager.buildSatchelWagerAuthorization(row.snapshotJson as unknown as SatchelWagerSnapshot);
        assert.equal(a.snapshot.amountUwolo,"100000000");assert.equal(a.snapshot.legs.length,2);
        const reviewIssued=Math.floor(Date.now()/1000)-1,unsigned={version:1 as const,operation_id:a.operationId,owner_id:seeded.owner.uid,vault,recipient:escrow,amount_uwolo:a.snapshot.amountUwolo,memo:a.snapshot.memo,reservation_digest:a.reservationDigest,ledger_revision:a.ledgerRevision,consent_digest:a.consentDigest,fee_uwolo:"1",issued_at:reviewIssued,expires_at:reviewIssued+120,signature:""};
        const wagerApproval={...unsigned,signature:sign(null,review.wagerReservationSignBytes(unsigned),reviewer.privateKey).toString("base64")};reservationReviews.set(a.operationId,wagerApproval);
        await ledger.attachIndependentSatchelWagerReview(db.prisma,{operationId:a.operationId,ownerUserId:seeded.owner.id,approval:wagerApproval});
        await executor.executeFundedMechaTicketBatch(db.prisma,signer,[execution.id]);
        await executor.executeFundedMechaTicketBatch(db.prisma,signer,[execution.id]);
        const accepted=await db.prisma.betAutoExecution.findUniqueOrThrow({where:{id:execution.id}});assert.equal(accepted.status,"accepted");
        const ticket=await db.prisma.betStakeTicket.findUniqueOrThrow({where:{id:accepted.ticketId!},include:{legs:true}});
        assert.equal(ticket.id,1);assert.equal(ticket.totalAmountWolo,100);assert.equal(ticket.stakeTxHash,nativeStep("wager").tx_hash);
        assert.deepEqual(ticket.legs.map(l=>[l.marketId,l.amountWolo]).sort((l,r)=>Number(l[0])-Number(r[0])),[[seeded.market.id,40],[seeded.desyncMarket.id,60]]);
        assert.equal(sends,1);assert.equal(await db.prisma.satchelFundedReservation.count(),1);assert.equal(await db.prisma.satchelWagerBroadcast.count(),1);
        assert.equal((await db.prisma.betAutoPreset.findUniqueOrThrow({where:{id:seeded.preset.id}})).gamesRemaining,0);
        const counter=nativeStep("opponent");
        const intent=await intents.createBetStakeIntent(db.prisma,{marketId:seeded.market.id,userId:opponent.id,side:"right",amountWolo:40,propositionHash:seeded.market.propositionHash,walletAddress:opponent.walletAddress,walletProvider:"keplr"});
        await intents.updateBetStakeIntentBroadcast(db.prisma,{intentId:intent.id,stakeTxHash:counter.tx_hash,walletAddress:opponent.walletAddress});
        await manual.placePooledBetWager(db.prisma,{viewer:opponent,marketId:seeded.market.id,side:"right",amountWolo:40,walletAddress:opponent.walletAddress,stakeTxHash:counter.tx_hash,stakeIntentId:intent.id});
        const finalPlayers=seeded.session.players.map(p=>({name:p.name,steam_id:p.steamId,team_id:p.teamId,winner:p.teamId==="1"}));
        const final=await db.prisma.gameStats.create({data:{userUid:seeded.owner.uid,replay_file:"two-market-final.aoe2record",original_filename:"two-market-final.aoe2record",replayHash:createHash("sha256").update("two-market-final").digest("hex"),is_final:true,parse_iteration:2,parse_source:"watcher_final",parse_reason:"watcher_final_submission",game_type:"Random Map",players:finalPlayers,winner:finalPlayers.filter(p=>p.winner).map(p=>p.name).join(" / "),key_events:{completed:true,postgame_available:true,result_resolution:{result_status:"resolved",result_trusted:true,result_provenance:"postgame_winner_flags",winning_player_keys:seeded.session.players.filter(p=>p.teamId==="1").map(p=>p.stablePlayerKey),winning_player_names:finalPlayers.filter(p=>p.winner).map(p=>p.name)},team_resolution:{status:"resolved",confidence:"high"}}}});
        // Settle separately to bind deterministic genuine SDK memos to actual
        // canonical claim IDs without inserting or fabricating claim records.
        await db.prisma.betMarket.update({where:{id:seeded.market.id},data:{status:"settled",winnerSide:"left",linkedGameStatsId:final.id,settledAt:new Date()}});
        await canonical.settleIsolatedLifecycleMarkets(db.prisma);
        const winnerClaim=await db.prisma.pendingWoloClaim.findFirstOrThrow({where:{sourceMarketId:seeded.market.id,normalizedPlayerName:"lifecycleowner"}});
        assert.equal(winnerClaim.id,101);assert.equal(winnerClaim.amountWolo,78);assert.equal(winnerClaim.claimKind,"bet_payout");
        await db.prisma.betMarket.update({where:{id:seeded.desyncMarket.id},data:{status:"voided",winnerSide:null,voidedAt:new Date(),settledAt:new Date()}});
        await canonical.settleIsolatedLifecycleMarkets(db.prisma);
        const desyncClaim=await db.prisma.pendingWoloClaim.findFirstOrThrow({where:{sourceMarketId:seeded.desyncMarket.id,normalizedPlayerName:"lifecycleowner"}});
        assert.equal(desyncClaim.id,102);assert.equal(desyncClaim.amountWolo,60);assert.equal(desyncClaim.claimKind,"bet_refund");
        const claims=[winnerClaim,desyncClaim];
        const sourceLegs=ticket.legs.map(leg=>{
          const claim=claims.find(c=>c.sourceMarketId===leg.marketId);assert.ok(claim);
          return {leg_id:String(leg.id),market_id:String(leg.marketId),stake_uwolo:String(BigInt(leg.amountWolo)*U),entitlements:[{entitlement_id:"entitlement-"+claim.id,claim_id:String(claim.id),claim_kind:claim.claimKind!,principal_uwolo:String(BigInt(leg.amountWolo)*U),amount_uwolo:String(BigInt(claim.amountWolo)*U)}]};
        }).sort((l,r)=>l.leg_id.localeCompare(r.leg_id));
        const bank=nativeStep(returnNames.at(-1)!);
        const allocation={version:2,allocation_id:"two-market-allocation",revision:1,operation_id:a.operationId,owner_id:seeded.owner.uid,ticket_id:String(ticket.id),funding_tx_hash:ticket.stakeTxHash!,return_cap_uwolo:"138000000",funds_budget_id:"two-market-escrow-budget",funds_available_uwolo:"138000000",bank_evidence_digest:digest(bank.vault_bank_proof).toUpperCase(),bank_height:bank.vault_bank_proof.height,bank_block_hash:bank.observation.Head.BlockHash,legs:sourceLegs,issued_at:reviewIssued,expires_at:reviewIssued+120,signature:""};
        const allocationBase=["aoe2war/satchel/return-allocation/v2","wolo-1","uwolo",escrow,vault,2,allocation.allocation_id,1,a.operationId,seeded.owner.uid,String(ticket.id),ticket.stakeTxHash,"138000000",allocation.funds_budget_id,"138000000",allocation.bank_evidence_digest,allocation.bank_height,allocation.bank_block_hash,sourceLegs.map(l=>[l.leg_id,l.market_id,l.stake_uwolo,l.entitlements.map(e=>[e.entitlement_id,e.claim_id,e.claim_kind,e.principal_uwolo,e.amount_uwolo])])];
        allocation.signature=sign(null,Buffer.from(JSON.stringify([...allocationBase,reviewIssued,reviewIssued+120])),financial.privateKey).toString("base64");
        for(const claim of claims){
          const leg=sourceLegs.find(l=>l.market_id===String(claim.sourceMarketId));assert.ok(leg);
          const entitlementId=leg.entitlements[0].entitlement_id,native=nativeStep(claim.id===101?"return_winner":"return_desync"),returned=String(BigInt(claim.amountWolo)*U);
          // Controlled payout delivery boundary: the SDK really executed this
          // transfer, but this test does not run the production escrow payout
          // producer. Credit still independently authenticates its native proof.
          await db.prisma.pendingWoloClaim.update({where:{id:claim.id},data:{status:"claimed",claimedByUserId:seeded.owner.id,payoutTxHash:native.tx_hash,claimedAt:new Date()}});
          const approval={version:2,ticket_id:String(ticket.id),market_id:leg.market_id,leg_id:leg.leg_id,entitlement_id:entitlementId,allocation,operation_id:a.operationId,claim_id:String(claim.id),owner_id:seeded.owner.uid,claim_kind:claim.claimKind!,amount_uwolo:returned,allocation_digest:digest(allocationBase),issued_at:reviewIssued,expires_at:reviewIssued+120,signature:""};
          approval.signature=sign(null,Buffer.from(JSON.stringify(["aoe2war/satchel/claim-return-approval/v2","wolo-1","uwolo",escrow,vault,2,a.operationId,String(claim.id),seeded.owner.uid,String(ticket.id),leg.market_id,leg.leg_id,entitlementId,claim.claimKind,returned,approval.allocation_digest,reviewIssued,reviewIssued+120])),financial.privateKey).toString("base64");
          await returnReview.recordReviewedSatchelClaimReturnAuthorization(db.prisma,{claimId:claim.id,ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid,vault,escrow},{approval,entitlementId});
          returnContexts.set(String(claim.id),{protocol:1,kind:"claim_return",owner_id:seeded.owner.uid,operation_id:a.operationId,sender:escrow,recipient:vault,amount_uwolo:returned,memo:native.intent.Memo,tx_hash:native.tx_hash,funded_amount_uwolo:"100000000",return_approval:approval});
          nativeReturnByClaim.set(String(claim.id),native.name);
          const durable=await returnReview.loadDurableSatchelClaimReturnExpectation(db.prisma,{claimId:claim.id,ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid,vault,escrow});
          // Correctly signed full allocation must never be verified against
          // just this market's 40/60 principal as if it were a physical ticket.
          await assert.rejects(returnProof.authenticateSatchelClaimReturn({...durable.expected,fundedAmountUwolo:leg.stake_uwolo}),/not_exact_funded_ticket_allocation/);
          // Exercise the same negative through the actual Go CLI as well.
          // Only expected funding/context binding changes; native SDK bytes,
          // Comet proof and authentic full-ticket review signatures stay exact.
          const wrongContext={...returnContexts.get(String(claim.id))!,funded_amount_uwolo:leg.stake_uwolo};
          const expectedFile=path.join(root,"wrong-leg-funding-context.json"), proofFile=path.join(root,"wrong-leg-funding-proof.json");
          writeFileSync(expectedFile,JSON.stringify(wrongContext),{mode:0o600});
          writeFileSync(proofFile,JSON.stringify(envelope(native,wrongContext)),{mode:0o600});
          assert.throws(()=>execFileSync(binary,["verify-financial-proof","--authority",authority,"--expected",expectedFile,"--proof",proofFile],{stdio:"pipe",timeout:25000}),
            (error:unknown)=>Boolean(error && typeof error === "object" && "status" in error && error.status === 2 &&
              "stderr" in error && String(error.stderr).includes("financial proof UNVERIFIABLE")));
        }
        let expectedAvailable=0n;
        for(const claim of (reversed?[desyncClaim,winnerClaim]:claims)){
          await ledger.creditVerifiedSatchelClaimReturn(db.prisma,{claimId:claim.id,ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid});
          const retries=await Promise.allSettled(Array.from({length:3},()=>ledger.creditVerifiedSatchelClaimReturn(db.prisma,{claimId:claim.id,ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid})));
          assert.ok(retries.some(r=>r.status==="fulfilled"));expectedAvailable+=BigInt(claim.amountWolo)*U;
          assert.equal((await db.prisma.satchelFundedBalance.findUniqueOrThrow({where:{ownerUserId:seeded.owner.id}})).availableUwolo,expectedAvailable);
        }
        assert.equal(expectedAvailable,138n*U);assert.equal(await db.prisma.satchelFundedClaimReturn.count(),2);
        assert.equal(await db.prisma.satchelPhysicalReceiptConsumption.count(),3);
        assert.equal(new Set((await db.prisma.satchelFundedClaimReturn.findMany()).map(r=>r.txHash)).size,2);
        const terminal=await db.prisma.betWager.findMany({orderBy:{id:"asc"},select:{id:true,payoutWolo:true,status:true,updatedAt:true}});
        await canonical.settleIsolatedLifecycleMarkets(db.prisma);
        assert.deepEqual(await db.prisma.betWager.findMany({orderBy:{id:"asc"},select:{id:true,payoutWolo:true,status:true,updatedAt:true}}),terminal);
        const withdrawalSignature=await import("../lib/warSatchelWithdrawalAuthorization.ts");
        const withdrawalReview=await import("../lib/warSatchelWithdrawalReview.ts");
        const withdrawalRuntime=await import("../lib/warSatchelWithdrawalRuntime.ts");
        const challenge={id:randomUUID(),ownerUid:seeded.owner.uid,walletAddress:ownerKey.walletAddress,
          amountUwolo:expectedAvailable.toString(),issuedAtUtc:new Date(Date.now()-1000).toISOString(),
          expiresAtUtc:new Date(Date.now()+240000).toISOString(),consumedAtUtc:null};
        await db.prisma.satchelWithdrawalChallenge.create({data:{id:challenge.id,ownerUserId:seeded.owner.id,
          ownerUid:seeded.owner.uid,walletAddress:ownerKey.walletAddress,amountUwolo:expectedAvailable,
          issuedAt:new Date(challenge.issuedAtUtc),expiresAt:new Date(challenge.expiresAtUtc)}});
        const signed=withdrawalSignature.verifySatchelWithdrawalKeplrSignature({challenge,ownerUid:seeded.owner.uid,
          ownerWallet:ownerKey.walletAddress,signature:ownerKey.signAdr36(withdrawalSignature.withdrawalChallengeText(challenge)),nowMs:Date.now()});
        const reserved=await ledger.reserveOwnerSatchelWithdrawal(db.prisma,{ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid,
          ownerKeplrWallet:ownerKey.walletAddress,amountUwolo:expectedAvailable,verifiedWithdrawalSignature:signed,bank:await ledger.readIndependentSatchelBank()});
        await assert.rejects(ledger.reserveOwnerSatchelWithdrawal(db.prisma,{ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid,
          ownerKeplrWallet:ownerKey.walletAddress,amountUwolo:expectedAvailable,verifiedWithdrawalSignature:signed,bank:await ledger.readIndependentSatchelBank()}),/consumed_or_changed|overdrawn|nonce_replayed/);
        const authorization=await db.prisma.satchelWithdrawalAuthorization.findUniqueOrThrow({where:{withdrawalId:reserved.withdrawalId}});
        const issued=Math.floor(Date.now()/1000);
        const approvalUnsigned={withdrawal_id:reserved.withdrawalId,challenge_id:challenge.id,owner_id:seeded.owner.uid,
          recipient:ownerKey.walletAddress,amount_uwolo:expectedAvailable.toString(),memo:reserved.memo,
          hold_digest:withdrawalReview.withdrawalHoldDigest(authorization.reservationDigest,signed.ownerMandate),
          reservation_digest:authorization.reservationDigest,issued_at:issued,expires_at:issued+120,signature:""};
        const approval={...approvalUnsigned,signature:sign(null,withdrawalReview.withdrawalApprovalSignBytes(approvalUnsigned,vault),financial.privateKey).toString("base64")};
        await ledger.recordReviewedSatchelWithdrawalApproval(db.prisma,{withdrawalId:reserved.withdrawalId,approval});
        const originalFixture=fixture;
        recipe.push({name:"withdrawal",sender_role:"vault",recipient_role:"owner",amount_uwolo:expectedAvailable.toString(),memo:reserved.memo});
        fixture=nativeExport(originalFixture.now);
        for(let n=0;n<originalFixture.steps.length;n++){
          assert.equal(fixture.steps[n].tx_hash,originalFixture.steps[n].tx_hash,"withdrawal UUID binding must preserve original signed prefix");
          assert.equal(fixture.steps[n].observation.BlockHash,originalFixture.steps[n].observation.BlockHash);
          assert.deepEqual(fixture.steps[n].vault_bank_proof,originalFixture.steps[n].vault_bank_proof);
        }
        const withdrawal=fixture.steps.at(-1)!;
        const operationId="satchel:withdrawal:"+reserved.withdrawalId;
        withdrawalContext={protocol:1,kind:"withdrawal",owner_id:seeded.owner.uid,operation_id:operationId,sender:vault,
          recipient:ownerKey.walletAddress,amount_uwolo:expectedAvailable.toString(),memo:reserved.memo,tx_hash:withdrawal.tx_hash,
          withdrawal_approval:approval,owner_mandate:signed.ownerMandate};
        let submissions=0,reconciliations=0;
        const withdrawalReader=(async(url,options)=>{
          const body=JSON.parse(String(options?.body));
          if(String(url).endsWith("/v1/satchel/withdrawals")){
            submissions++;assert.equal(submissions,1);assert.equal(body.operation_id,operationId);
            assert.equal(body.memo,withdrawal.intent.Memo);assert.equal(body.amount.amount,withdrawal.intent.AmountUWolo);
            assert.equal(body.from_address,vault);assert.equal(body.to_address,ownerKey.walletAddress);
            bankStep=withdrawal;
            throw Error("isolated lost ACK after actual SDK execution");
          }
          assert.ok(String(url).endsWith("/satchel/v1/reconcile"));reconciliations++;
          assert.deepEqual(body,{operation_id:operationId});
          return Response.json({operation_id:operationId,request_id:operationId,chain_id:"wolo-1",signer_role:"exclusive-war-satchel-v1",
            durable_request_fenced:true,status:"CONFIRMED",tx_hash:withdrawal.tx_hash});
        }) as typeof fetch;
        await installLifecycleFinancialAdmission(db,vault,true);
        assert.deepEqual(await withdrawalRuntime.processCertifiedSatchelWithdrawal(db.prisma,reserved.withdrawalId,withdrawalReader),{state:"financial_maintenance_hold"});
        assert.equal(submissions,0);assert.equal(await db.prisma.satchelWithdrawalAttempt.count(),0);
        await installLifecycleFinancialAdmission(db,vault);
        assert.deepEqual(await withdrawalRuntime.processCertifiedSatchelWithdrawal(db.prisma,reserved.withdrawalId,withdrawalReader),{state:"unknown_hold"});
        const confirmed=await withdrawalRuntime.processCertifiedSatchelWithdrawal(db.prisma,reserved.withdrawalId,withdrawalReader);
        assert.equal(confirmed.state,"sent");
        assert.deepEqual(await withdrawalRuntime.processCertifiedSatchelWithdrawal(db.prisma,reserved.withdrawalId,withdrawalReader),{state:"sent"});
        assert.equal(submissions,1);assert.equal(reconciliations,1);
        assert.equal(await db.prisma.satchelWithdrawalAttempt.count(),1);
        assert.equal(await db.prisma.satchelWithdrawalPhysicalConsumption.count(),1);
        delete process.env.SATCHEL_TEST_FINANCIAL_AUTHORITY;
        const finalBalance=await db.prisma.satchelFundedBalance.findUniqueOrThrow({where:{ownerUserId:seeded.owner.id}});
        assert.equal(finalBalance.availableUwolo,0n);assert.equal(finalBalance.reservedUwolo,0n);assert.equal(finalBalance.withdrawalPendingUwolo,0n);
        assert.equal(withdrawal.intent.AmountUWolo,"138000000");

        assert.equal(finalBalance.committedUwolo,100n*U);
        const journal=await db.prisma.satchelFundedJournal.aggregate({_sum:{deltaAvailableUwolo:true,deltaReservedUwolo:true,deltaCommittedUwolo:true,deltaWithdrawalPendingUwolo:true}});
        assert.equal(journal._sum.deltaAvailableUwolo,0n);assert.equal(journal._sum.deltaReservedUwolo,0n);
        assert.equal(journal._sum.deltaCommittedUwolo,100n*U);assert.equal(journal._sum.deltaWithdrawalPendingUwolo,0n);
        const genesis=fixture.bank_states[0],nativeFinal=fixture.bank_states.at(-1)!;
        assert.deepEqual(nativeFinal.balances_uwolo,{owner:"138000000",vault:"98",escrow:"2000098",opponent:"60000003"});
        assert.equal(nativeFinal.cumulative_fee_uwolo,"6");
        const sum=(v:Record<string,string>)=>Object.values(v).reduce((n,x)=>n+BigInt(x),0n);
        assert.equal(sum(genesis.balances_uwolo),sum(nativeFinal.balances_uwolo)+6n);
        assert.equal(BigInt(nativeFinal.balances_uwolo.escrow)-100n+2n,2n*U,"only the matched 80-WOLO winner pool pays the rounded 2% fee");
        const deposits=await db.prisma.satchelFundedReceipt.findMany({select:{amountUwolo:true}});
        const returns=await db.prisma.satchelFundedClaimReturn.findMany({select:{amountUwolo:true}});
        const spent=await db.prisma.satchelFundedReservation.findMany({where:{status:"committed"},select:{amountUwolo:true}});
        const withdrawn=await db.prisma.satchelFundedWithdrawal.findMany({where:{status:"sent"},select:{amountUwolo:true}});
        const total=(rows:readonly {amountUwolo:bigint}[])=>rows.reduce((n,row)=>n+row.amountUwolo,0n);
        const nativeDeposited=BigInt(nativeStep("deposit").intent.AmountUWolo),nativeSpent=BigInt(nativeStep("wager").intent.AmountUWolo);
        const nativeReturned=returnNames.reduce((n,name)=>n+BigInt(nativeStep(name).intent.AmountUWolo),0n);
        const nativeWithdrawn=BigInt(withdrawal.intent.AmountUWolo);
        assert.equal(total(deposits),nativeDeposited);assert.equal(total(returns),nativeReturned);
        assert.equal(total(spent),nativeSpent);assert.equal(total(withdrawn),nativeWithdrawn);
        assert.equal(total(deposits)+total(returns)-total(spent)-total(withdrawn),
          finalBalance.availableUwolo+finalBalance.reservedUwolo+finalBalance.withdrawalPendingUwolo);
        assert.equal(sends,1);assert.equal(await db.prisma.satchelFundedReceipt.count(),1);
        assert.equal(await db.prisma.satchelFundedReservation.count(),1);assert.equal(await db.prisma.satchelWagerBroadcast.count(),1);
      } finally {
        globalThis.fetch=originalFetch;
        for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
        Object.assign(process.env,originalEnv);
        await db.cleanup();rmSync(root,{recursive:true,force:true});
      }
    });
  }
});
