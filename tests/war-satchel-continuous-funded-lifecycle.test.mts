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
import {startLifecycleDatabase,installLifecycleFinancialAdmission,seedLifecycleOwnerAndMarkets,seedLifecycleSession,lifecycleOwnerKey} from "./fixtures/satchel-lifecycle-db.mts";
import type {Prisma} from "../lib/generated/prisma/index.js";
import {controlledOriginalLiveRow} from "./fixtures/live-watcher-market-admission.mts";
import {loadLiveSessionSnapshot} from "../lib/liveSessionSnapshot.ts";

import {fundedWatcherOriginSignBytes,type SignedFundedWatcherOrigin} from "../lib/warSatchelFundedWatcherOrigin.ts";

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

test("100-WOLO funded application lifecycle across twelve canonical Watcher tickets",{
  skip:process.env.RUN_SATCHEL_FULL_LIFECYCLE_TESTS!=="1",timeout:120000,
},async t=>{
  assert.equal(process.env.RUN_SATCHEL_REAL_CREDIT_TESTS,"1");
  const source=process.env.SATCHEL_LIFECYCLE_WOLO_SOURCE!,binary=process.env.SATCHEL_TEST_BINARY!;
  assert.ok(path.isAbsolute(source)&&path.isAbsolute(binary));
  const root=realpathSync(mkdtempSync("/tmp/aoe2-satchel-full-lifecycle-"));
  const db=await startLifecycleDatabase();
  const originalFetch=globalThis.fetch;
  const reviewer=generateKeyPairSync("ed25519"),financial=generateKeyPairSync("ed25519");
  const pub=(key:typeof reviewer)=>key.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex");
  const vault=lifecycleOwnerKey(fixtureKey("vault")).walletAddress,escrow=lifecycleOwnerKey(fixtureKey("escrow")).walletAddress;
  const ownerKey=lifecycleOwnerKey(fixtureKey("owner")),opponentKey=lifecycleOwnerKey(fixtureKey("opponent"));
  const authority=path.join(root,"financial-authority.json"),wagerAuthority=path.join(root,"wager-proof-authority.json"),wagerKeyFile=path.join(root,"wager-reviewer.json");
  let fixture:NativeFixture,bankStep:NativeStep,withdrawalContext:Record<string,unknown>;
  const reservationReviews=new Map<string,SatchelWagerReservation>(),returnContexts=new Map<string,Record<string,unknown>>();
  const senderCalls=new Map<string,number>();
  const recipe:RecipeStep[]=[{name:"deposit",sender_role:"owner",recipient_role:"vault",amount_uwolo:"100000000",memo:"aoe2war/satchel/v1/lifecycle-owner/abcdefghijklmnop"}];
  // Legacy manual counterparty wagers have a stake intent, not a stake ticket.
  const ownerTicketId=(n:number)=>n;
  for(let n=1;n<=12;n++){
    recipe.push({name:"wager_"+n,sender_role:"vault",recipient_role:"escrow",amount_uwolo:"25000000",memo:"AoE2HDBets bet ticket v1 · ticket "+ownerTicketId(n)});
    if(n>=9)recipe.push({name:"opponent_"+n,sender_role:"opponent",recipient_role:"escrow",amount_uwolo:"25000000",memo:"AoE2HDBets bet stake · market "+n});
    if(n<=10)recipe.push({name:"return_"+n,sender_role:"escrow",recipient_role:"vault",amount_uwolo:n<=8?"25000000":"49000000",memo:"aoe2war/satchel/claim-return/v1/"+(100+n)});
    else recipe.push({name:"opponent_payout_"+n,sender_role:"escrow",recipient_role:"opponent",amount_uwolo:"49000000",memo:"isolated-opponent-payout-"+n});
  }
  function nativeExport(now?:string){
    const file=path.join(root,"recipe.json");writeFileSync(file,JSON.stringify({version:1,scenario:"application_lifecycle",...(now?{now}:{}),steps:recipe}),{mode:0o600});
    const env:NodeJS.ProcessEnv={...process.env,CGO_ENABLED:"0",SATCHEL_LIFECYCLE_RECIPE:file,SATCHEL_LIFECYCLE_FIXTURE_DIR:root,GOTOOLCHAIN:"local",GOENV:"off",GOWORK:"off",GOFLAGS:""};
    for(const k of Object.keys(env))if(k==="DATABASE_URL"||k==="DIRECT_URL"||k.startsWith("PG"))delete env[k];
    execFileSync("go",["test","-tags=go1.27","./internal/satchel","-run","^TestAuthenticatedContinuousSDKLifecycle$","-count=1"],{cwd:source,env,stdio:"pipe",timeout:60000});
    const value:NativeFixture=JSON.parse(readFileSync(path.join(root,"application_lifecycle/isolated-sdk-lifecycle.json"),"utf8"));
    assert.equal(value.fixture_only,true);assert.equal(value.mainnet_authority,false);return value;
  }
  function envelope(step:NativeStep,context:unknown,deposit=false){
    const o=step.observation;return {protocol:1,chain_id:"wolo-1",denom:"uwolo",context,context_digest:digest(context),tx_hash:step.tx_hash,
      receipt_id:`wolo-1:${step.tx_hash}:${deposit?0:1}`,transfer_index:deposit?0:1,message_index:0,height:o.Height,block_hash:o.BlockHash,
      consensus_authenticated:true,credit_authorized:false,proof:deposit?step.deposit_proof:step.proof};
  }
  try{
    Object.assign(process.env,{BET_AUTOMATION_MODE:"shadow",WOLO_CHAIN_ID:"wolo-1",WOLO_BET_ESCROW_ADDRESS:escrow,WOLO_BET_PAYOUT_ADDRESS:ownerKey.walletAddress,
      WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS:vault,WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED:"true",WAR_SATCHEL_FUNDED_LEDGER_ENABLED:"true",
      WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED:"true",WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED:"true",WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED:"true",
      WAR_SATCHEL_LIVE_EXECUTOR_ENABLED:"true",WAR_SATCHEL_AUTO_CONSENT_ENABLED:"true",WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED:"true",
      WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED:"true",WAR_SATCHEL_CLAIM_RETURN_CREDIT_ENABLED:"true",WAR_SATCHEL_RETURN_REVIEW_IMPORT_ENABLED:"true",
      WAR_SATCHEL_PROOF_VERIFIER_ENABLED:"true",WAR_SATCHEL_SIGNER_AUTH_TOKEN:"isolated_test_"+"t".repeat(64),
      WAR_SATCHEL_VERIFIER_BINARY:binary,WAR_SATCHEL_VERIFIER_SHA256:process.env.SATCHEL_TEST_BINARY_SHA256,
      WAR_SATCHEL_VERIFIER_AUTHORITY_FILE:authority,WAR_SATCHEL_WAGER_PROOF_VERIFIER_AUTHORITY_FILE:wagerAuthority,
      WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE:wagerKeyFile,WAR_SATCHEL_RETURN_APPROVAL_PUBLIC_KEY_HEX:pub(financial),
      WAR_SATCHEL_SIGNER_CLIENT_ENABLED:"true",WAR_SATCHEL_WITHDRAWAL_EXECUTOR_READY:"true"});
    const seeded=await seedLifecycleOwnerAndMarkets(db,{ownerPrivateKeyHex:fixtureKey("owner"),ownerUid:"lifecycle-owner",stakeWolo:25,gamesRemaining:12,team:false,sessionKey:"watcher:lifecycle:1"});
    const sessions=[seeded];for(let n=2;n<=12;n++)sessions.push({...seeded,...await seedLifecycleSession(db,{ownerUid:seeded.owner.uid,ownerSteamId:seeded.owner.steamId!,now:seeded.now,team:n%2===0,sessionKey:"watcher:lifecycle:"+n})});
    await db.sql.query("ALTER SEQUENCE pending_wolo_claims_id_seq RESTART WITH 101");
    fixture=nativeExport();bankStep=fixture.steps[0];
    assert.equal(fixture.roles.owner,ownerKey.walletAddress);assert.equal(fixture.roles.vault,vault);assert.equal(fixture.roles.escrow,escrow);
    writeFileSync(authority,JSON.stringify({trust_anchor:fixture.anchor,vault,betting_escrow:escrow,approval_public_key_hex:pub(financial)}),{mode:0o600});
    writeFileSync(wagerAuthority,JSON.stringify({trust_anchor:fixture.anchor,vault,betting_escrow:escrow,approval_public_key_hex:pub(financial),wager_approval_public_key_hex:pub(reviewer)}),{mode:0o600});
    writeFileSync(wagerKeyFile,JSON.stringify({wager_approval_public_key_hex:pub(reviewer)}),{mode:0o600});
    // Stitch the FIRST ticket (not a disconnected side test) to actual signed
    // canonical Watcher admission. Original LIVE metadata stays preview-only.
    // woloChain.ts snapshots escrow configuration at module evaluation.
    // Load bets only AFTER the isolated Wolo env/attested addresses are set.
    // A static import would cache a disabled escrow configuration globally.
    const {admitCommittedLiveWatcherMarkets,admitReviewedFundedWatcherBooks}
      =await import("../lib/bets.ts");
    const liveEvidence=controlledOriginalLiveRow({name:"sdk-continuous-connected"});
    const connectedPlayers=liveEvidence.players.map(p=>({
      ...p,name:p.steamId===seeded.owner.steamId?"LifecycleOwner":
        p.steamId==="76561198000000002"?"LifecycleOpponent":p.name,
    }));
    const watcherGame=await db.prisma.gameStats.create({data:{
      userUid:seeded.owner.uid,replay_file:"sdk-connected.aoe2record",
      original_filename:"sdk-connected.aoe2record",replayHash:liveEvidence.replayHash,
      is_final:false,parse_source:liveEvidence.parse_source,
      parse_iteration:liveEvidence.parse_iteration,parse_reason:"watcher_live_snapshot",
      game_version:liveEvidence.game_version,game_type:liveEvidence.game_type,
      createdAt:liveEvidence.createdAt,timestamp:liveEvidence.createdAt,
      played_on:liveEvidence.played_on,game_duration:30,winner:null,
      players:connectedPlayers as Prisma.InputJsonValue,
      key_events:liveEvidence.key_events as Prisma.InputJsonValue,
    }});
    const previewAdmission=await admitCommittedLiveWatcherMarkets(db.prisma,[watcherGame.id]);
    assert.equal(previewAdmission.createdCount,2);
    const previewBooks=await db.prisma.betMarket.findMany({
      where:{bookPhase:"preview_only",linkedSessionKey:"platform:controlled-hd-sdk-continuous-connected"},
      select:{id:true,slug:true,bookPhase:true,status:true},
    });
    assert.equal(previewBooks.length,2);
    const currentSnapshot=await loadLiveSessionSnapshot(db.prisma);
    const connectedSession=currentSnapshot.activeSessions.find(
      v=>v.sessionKey==="platform:controlled-hd-sdk-continuous-connected");
    assert.ok(connectedSession?.teamResolution.propositionHash&&
      connectedSession.teamResolution.rosterHash,"canonical signed Watcher source required");
    const nowSec=Math.floor(Date.now()/1000);
    const originUnsigned:SignedFundedWatcherOrigin={
      version:1,chain_id:"wolo-1",session_key:connectedSession.sessionKey,
      proposition_hash:connectedSession.teamResolution.propositionHash,
      roster_hash:connectedSession.teamResolution.rosterHash,
      source_game_stats_id:watcherGame.id,nonce:"isolated-sdk-origin-reviewer-0001",
      issued_at:nowSec-2,expires_at:nowSec+45,signature:"",
    };
    const signedOrigin={...originUnsigned,
      signature:sign(null,fundedWatcherOriginSignBytes(originUnsigned),reviewer.privateKey).toString("base64")};
    await assert.rejects(admitReviewedFundedWatcherBooks(db.prisma,{
      sourceGameStatsId:watcherGame.id,
      signedOrigin:{...signedOrigin,nonce:"invalid-reviewer-replay-00002"},
    }),/FUNDED_WATCHER_ORIGIN_REFUSED:independent_signature/);
    assert.equal(await db.prisma.betMarket.count({where:{bookPhase:"preview_only"}}),2);
    assert.equal(await db.prisma.satchelFundedReceipt.count(),0);
    const admitted=await admitReviewedFundedWatcherBooks(db.prisma,{
      sourceGameStatsId:watcherGame.id,signedOrigin,
    });
    assert.equal(admitted.created,true);
    const idempotent=await admitReviewedFundedWatcherBooks(db.prisma,{
      sourceGameStatsId:watcherGame.id,signedOrigin,
    });
    assert.equal(idempotent.created,false);
    assert.equal(idempotent.winnerMarketId,admitted.winnerMarketId);
    assert.equal(idempotent.desyncMarketId,admitted.desyncMarketId);
    assert.ok(previewBooks.every(row=>row.id!==admitted.winnerMarketId&&
      row.id!==admitted.desyncMarketId),"no preview financial identity can be reused");
    const fundedMarket=await db.prisma.betMarket.findUniqueOrThrow({
      where:{id:admitted.winnerMarketId},
    });
    assert.equal(fundedMarket.bookPhase,"funded");
    assert.equal(fundedMarket.seedLeftWolo,0);
    assert.equal(fundedMarket.seedRightWolo,0);
    // Feed precisely the independently issued market to the real auto-bet,
    // reservation, reviewed signer, finality, settlement and journal loop.
    sessions[0]={...seeded,session:connectedSession,market:fundedMarket};
    assert.equal(await db.prisma.betWager.count({where:{
      marketId:{in:previewBooks.map(row=>row.id)},
    }}),0);

    const ledger=await import("../lib/warSatchelFundedLedger.ts"),deposit=await import("../lib/warSatchelAuthenticatedDeposit.ts"),shadow=await import("../lib/betAutomationShadowWorker.ts"),executor=await import("../lib/warSatchelAutoBetExecutor.ts");
    const wager=await import("../lib/warSatchelWagerAuthorization.ts"),review=await import("../lib/warSatchelWagerReservation.ts");
    const canonical=await import("../lib/bets.ts") as unknown as {settleIsolatedLifecycleMarkets(prisma:typeof db.prisma):Promise<void>};
    const returnReview=await import("../lib/warSatchelClaimReturnAuthorization.ts");
    const intents=await import("../lib/betStakeIntents.ts"),manual=await import("../lib/betWagering.ts");
    const opponent=await db.prisma.user.create({data:{uid:"lifecycle-opponent",walletAddress:opponentKey.walletAddress,inGameName:"LifecycleOpponent",steamId:"76561198000000002",verified:true,verificationLevel:2}});
    globalThis.fetch=(async(url,options)=>{
      const target=String(url),body=options?.body?JSON.parse(String(options.body)):{};
      if(target.endsWith("/satchel/v1/proofs/bank")){
        assert.deepEqual(body,{protocol:1},"caller cannot choose bank height, balance or vault");
        return Response.json(bankStep.vault_bank_proof);
      }
      if(target.endsWith("/satchel/v1/proofs/deposit")){
        const i=fixture.steps[0].deposit_intent!;const c={protocol:1,kind:"deposit",owner_id:i.OwnerID,sender:i.Sender,recipient:i.Vault,amount_uwolo:i.AmountUWolo,memo:i.Memo,tx_hash:fixture.steps[0].tx_hash,created_at:new Date(i.CreatedAt).toISOString(),expires_at:new Date(i.ExpiresAt).toISOString()};return Response.json(envelope(fixture.steps[0],c,true));
      }
      if(target.endsWith("/satchel/v1/proofs/operation")){
        if(String(body.operation_id).startsWith("satchel:withdrawal:"))return Response.json(envelope(fixture.steps.at(-1)!,withdrawalContext));
        const n=Number(String(body.operation_id).split(":").at(-1)),step=fixture.steps.find(s=>s.name==="wager_"+n)!;
        const row=await db.prisma.satchelWagerAuthorization.findUniqueOrThrow({where:{operationId:body.operation_id}});
        return Response.json(envelope(step,wager.wagerFinancialContext(wager.buildSatchelWagerAuthorization(row.snapshotJson as unknown as SatchelWagerSnapshot),reservationReviews.get(body.operation_id)!,step.tx_hash)));
      }
      if(target.endsWith("/satchel/v1/proofs/return")){
        const n=Number(body.claim_id)-100,step=fixture.steps.find(s=>s.name==="return_"+n)!;bankStep=step;return Response.json(envelope(step,returnContexts.get(String(body.claim_id))));
      }
      const transaction=/\/cosmos\/tx\/v1beta1\/txs\/([A-F0-9]{64})$/.exec(target);
      if(transaction){
        const step=fixture.steps.find(s=>s.tx_hash===transaction[1]);assert.ok(step,"only genuine SDK hashes can be queried");
        const rest=step.proof.responses.find(r=>r.source==="rest");assert.ok(rest);return Response.json(rest.body);
      }
      throw Error("unexpected isolated financial network access: "+target);
    }) as typeof fetch;
    const i=fixture.steps[0].deposit_intent!,tx=fixture.steps[0].tx_hash,intentId=randomUUID();
    await db.prisma.warSatchelDepositIntent.create({data:{id:intentId,userId:seeded.owner.id,senderAddress:i.Sender,vaultAddress:vault,amountUwolo:100n*U,memo:i.Memo,nonce:"abcdefghijklmnop",createdAt:new Date(i.CreatedAt),expiresAt:new Date(i.ExpiresAt)}});
    const candidate=await db.prisma.warSatchelProofCandidate.create({data:{intentId,userId:seeded.owner.id,chainId:"wolo-1",txHash:tx,transferIndex:0,senderAddress:i.Sender,vaultAddress:vault,amountUwolo:100n*U,txHeight:BigInt(fixture.steps[0].observation.Height),verifiedAt:new Date()}});
    const authenticated=await deposit.authenticateOwnerDeposit({intentId,ownerUid:seeded.owner.uid,sender:i.Sender,vault,amountUwolo:"100000000",memo:i.Memo,createdAtUtc:new Date(i.CreatedAt).toISOString(),expiresAtUtc:new Date(i.ExpiresAt).toISOString(),txHash:tx});
    const creditInput={ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid,proofCandidateId:candidate.id,expectedTxHash:tx,authenticatedDeposit:authenticated,bank:await ledger.readIndependentSatchelBank()};
    await ledger.creditRecordedSatchelProof(db.prisma,creditInput);
    await t.test("real deposit has exactly one durable credit under concurrent replay",async()=>{
      await Promise.allSettled(Array.from({length:4},()=>ledger.creditRecordedSatchelProof(db.prisma,creditInput)));
      assert.equal(await db.prisma.satchelFundedReceipt.count(),1);assert.equal(await db.prisma.satchelFundedJournal.count(),1);
    });
    // Continued below: every actual execution must pass the original ADR36,
    // current ticket-leg snapshot, immutable approval and physical proof.
    const signer={attestedVaultAddress:vault,custodyRole:"exclusive-war-satchel-v1" as const,async submitOneShot(input:Parameters<IsolatedSatchelSigner["submitOneShot"]>[0]){
      const count=(senderCalls.get(input.requestId)||0)+1;senderCalls.set(input.requestId,count);assert.equal(count,1);
      const n=Number(input.requestId.split(":").at(-1)),step=fixture.steps.find(s=>s.name==="wager_"+n)!;
      assert.equal(input.ownerUid,seeded.owner.uid);
      assert.equal(input.chainId,"wolo-1");assert.equal(input.denom,"uwolo");
      assert.equal(input.senderAddress,step.intent.Sender);
      assert.equal(input.recipientAddress,step.intent.Recipient);
      assert.deepEqual(input.reservation,reservationReviews.get(input.requestId));
      assert.equal(input.memo,step.intent.Memo);assert.equal(input.amountUwolo,step.intent.AmountUWolo);bankStep=step;
      return {kind:"broadcast_accepted" as const,txHash:step.tx_hash};
    }};
    let expectedAvailable=100n*U;
    for(const [index,s] of sessions.entries()){
      const n=index+1;
      const result=await shadow.runBetAutoShadowWorker(db.prisma,{activeSessions:[s.session],env:{BET_AUTOMATION_MODE:"shadow"}});
      assert.equal(result.createdCount,1);
      const execution=await db.prisma.betAutoExecution.findFirstOrThrow({where:{winnerMarketId:s.market.id}});
      const first=await Promise.allSettled(Array.from({length:n===1?4:1},()=>executor.executeFundedMechaTicketBatch(db.prisma,signer,[execution.id])));
      assert.ok(first.some(r=>r.status==="fulfilled"),"a durable reservation must survive contention; rejected="+first.filter(r=>r.status==="rejected").map(r=>String(r.reason?.stack||r.reason)).join(" | ").slice(0,4500));
      assert.equal((await db.prisma.betAutoExecution.findUniqueOrThrow({where:{id:execution.id}})).status,"funded_reserved");
      assert.equal(await db.prisma.satchelFundedReservation.count({where:{executionId:execution.id}}),1);
      assert.equal(await db.prisma.satchelFundedJournal.count({where:{executionId:execution.id,eventKind:"wager_reserve"}}),1);
      assert.equal(senderCalls.get("satchel:ticket:"+execution.id),undefined,"unreviewed reservation cannot submit");
      const row=await db.prisma.satchelWagerAuthorization.findUniqueOrThrow({where:{operationId:"satchel:ticket:"+execution.id}}),a=wager.buildSatchelWagerAuthorization(row.snapshotJson as unknown as SatchelWagerSnapshot);
      const issued=Math.floor(Date.now()/1000)-1,unsigned={version:1 as const,operation_id:a.operationId,owner_id:seeded.owner.uid,vault,recipient:escrow,amount_uwolo:a.snapshot.amountUwolo,memo:a.snapshot.memo,reservation_digest:a.reservationDigest,ledger_revision:a.ledgerRevision,consent_digest:a.consentDigest,fee_uwolo:"1",issued_at:issued,expires_at:issued+120,signature:""};
      const approval={...unsigned,signature:sign(null,review.wagerReservationSignBytes(unsigned),reviewer.privateKey).toString("base64")};reservationReviews.set(a.operationId,approval);
      if(n===1){
        await t.test("forged independent review cannot authorize a send",async()=>{
          await assert.rejects(ledger.attachIndependentSatchelWagerReview(db.prisma,{operationId:a.operationId,ownerUserId:seeded.owner.id,
            approval:{...approval,recipient:ownerKey.walletAddress}}),/SATCHEL_WAGER_RESERVATION_REFUSED/);
          assert.equal(await db.prisma.satchelWagerApproval.count(),0);
        });
      }
      await ledger.attachIndependentSatchelWagerReview(db.prisma,{operationId:a.operationId,ownerUserId:seeded.owner.id,approval});
      if(n===1){
        await t.test("equal-value canonical leg substitution is refused before the durable send fence",async()=>{
          const leg=a.snapshot.legs[0];
          await db.prisma.betStakeLeg.update({where:{id:leg.id},data:{side:leg.side==="left"?"right":"left"}});
          try{
            await assert.rejects(ledger.markSatchelSubmissionAttempt(db.prisma,{executionId:execution.id,ownerUserId:seeded.owner.id,
              ticketRequestId:a.operationId,reservation:approval}),/reviewed_ticket_legs_changed_before_attempt/);
            assert.equal(await db.prisma.satchelWagerBroadcast.count(),0);
            assert.equal(senderCalls.get(a.operationId),undefined);
          }finally{await db.prisma.betStakeLeg.update({where:{id:leg.id},data:{side:leg.side}});}
        });
        await t.test("a paused owner plan cannot start an already reviewed wager",async()=>{
          await db.prisma.betAutoPreset.update({where:{id:seeded.preset.id},data:{enabled:false}});
          try{
            await assert.rejects(ledger.markSatchelSubmissionAttempt(db.prisma,{executionId:execution.id,ownerUserId:seeded.owner.id,
              ticketRequestId:a.operationId,reservation:approval}),/execution_changed_before_first_broadcast/);
            assert.equal(await db.prisma.satchelWagerBroadcast.count(),0);
          }finally{await db.prisma.betAutoPreset.update({where:{id:seeded.preset.id},data:{enabled:true}});}
        });
      }
      await executor.executeFundedMechaTicketBatch(db.prisma,signer,[execution.id]);
      const committed=await db.prisma.betAutoExecution.findUniqueOrThrow({where:{id:execution.id}});
      assert.equal(committed.status,"accepted",JSON.stringify(committed));
      expectedAvailable-=25n*U;
      const ticket=await db.prisma.betStakeTicket.findUniqueOrThrow({where:{id:committed.ticketId!},include:{legs:true}});
      assert.equal(ticket.id,ownerTicketId(n));assert.equal(ticket.status,"recorded");assert.equal(senderCalls.get(a.operationId),1);
      await executor.executeFundedMechaTicketBatch(db.prisma,signer,[execution.id]);assert.equal(senderCalls.get(a.operationId),1,"accepted operation must never resubmit");
      if(n>=9){
        const native=fixture.steps.find(step=>step.name==="opponent_"+n)!;
        const intent=await intents.createBetStakeIntent(db.prisma,{marketId:s.market.id,userId:opponent.id,side:"right",amountWolo:25,propositionHash:s.market.propositionHash,walletAddress:opponent.walletAddress,walletProvider:"keplr"});
        await intents.updateBetStakeIntentBroadcast(db.prisma,{intentId:intent.id,stakeTxHash:native.tx_hash,walletAddress:opponent.walletAddress});
        await manual.placePooledBetWager(db.prisma,{viewer:opponent,marketId:s.market.id,side:"right",amountWolo:25,walletAddress:opponent.walletAddress,stakeTxHash:native.tx_hash,stakeIntentId:intent.id});
      }
      const winningSide=n>=11?"right":"left";
      const finalPlayers=s.session.players.map(p=>({name:p.name,steam_id:p.steamId,team_id:p.teamId,winner:(p.teamId==="2")===(winningSide==="right")}));
      const final=await db.prisma.gameStats.create({data:{userUid:seeded.owner.uid,replay_file:"isolated-final-"+n+".aoe2record",original_filename:"isolated-final-"+n+".aoe2record",replayHash:createHash("sha256").update("isolated-final-"+n).digest("hex"),is_final:true,parse_iteration:2,parse_source:"watcher_final",parse_reason:"watcher_final_submission",game_type:"Random Map",players:finalPlayers,winner:finalPlayers.filter(p=>p.winner).map(p=>p.name).join(" / "),key_events:{completed:true,postgame_available:true,result_resolution:{result_status:"resolved",result_trusted:true,result_provenance:"postgame_winner_flags",winning_player_keys:s.session.players.filter(p=>(p.teamId==="2")===(winningSide==="right")).map(p=>p.stablePlayerKey),winning_player_names:finalPlayers.filter(p=>p.winner).map(p=>p.name)},team_resolution:{status:"resolved",confidence:"high"}}}});
      await db.prisma.betMarket.update({where:{id:s.market.id},data:{status:"settled",winnerSide:winningSide,linkedGameStatsId:final.id,settledAt:new Date()}});
      await canonical.settleIsolatedLifecycleMarkets(db.prisma);
      const settled=await db.prisma.betWager.findFirstOrThrow({where:{marketId:s.market.id,userId:seeded.owner.id}});
      assert.equal(settled.payoutWolo,n<=8?25:n<=10?49:0,"actual canonical matched-only2% math");
      assert.equal(settled.status,n<=10?"won":"lost");
      const claim=await db.prisma.pendingWoloClaim.findFirst({where:{sourceMarketId:s.market.id,normalizedPlayerName:"lifecycleowner"}});
      if(n<=10){
        assert.ok(claim);assert.equal(claim.id,100+n);assert.equal(claim.amountWolo,n<=8?25:49);
        const native=fixture.steps.find(step=>step.name==="return_"+n)!;
        await db.prisma.pendingWoloClaim.update({where:{id:claim.id},data:{status:"claimed",claimedByUserId:seeded.owner.id,payoutTxHash:native.tx_hash,claimedAt:new Date()}});
        const leg=ticket.legs[0],entitlementId="entitlement-"+claim.id,issued=Math.floor(Date.now()/1000)-1,returned=String(BigInt(claim.amountWolo)*U);
        const allocation={version:2,allocation_id:"allocation-"+n,revision:1,operation_id:a.operationId,owner_id:seeded.owner.uid,ticket_id:String(ticket.id),funding_tx_hash:ticket.stakeTxHash,
          return_cap_uwolo:returned,funds_budget_id:"fixture-escrow-budget-"+n,funds_available_uwolo:returned,
          bank_evidence_digest:digest(native.vault_bank_proof).toUpperCase(),bank_height:native.vault_bank_proof.height,bank_block_hash:native.observation.Head.BlockHash,
          legs:[{leg_id:String(leg.id),market_id:String(s.market.id),stake_uwolo:"25000000",entitlements:[{entitlement_id:entitlementId,claim_id:String(claim.id),claim_kind:"bet_payout",principal_uwolo:"25000000",amount_uwolo:returned}]}],issued_at:issued,expires_at:issued+120,signature:""};
        const base=["aoe2war/satchel/return-allocation/v2","wolo-1","uwolo",escrow,vault,2,allocation.allocation_id,1,a.operationId,seeded.owner.uid,String(ticket.id),ticket.stakeTxHash,returned,allocation.funds_budget_id,returned,allocation.bank_evidence_digest,allocation.bank_height,allocation.bank_block_hash,[[String(leg.id),String(s.market.id),"25000000",[[entitlementId,String(claim.id),"bet_payout","25000000",returned]]]]];
        allocation.signature=sign(null,Buffer.from(JSON.stringify([...base,issued,issued+120])),financial.privateKey).toString("base64");
        const approval={version:2,ticket_id:String(ticket.id),market_id:String(s.market.id),leg_id:String(leg.id),entitlement_id:entitlementId,allocation,operation_id:a.operationId,claim_id:String(claim.id),owner_id:seeded.owner.uid,claim_kind:"bet_payout",amount_uwolo:returned,allocation_digest:digest(base),issued_at:issued,expires_at:issued+120,signature:""};
        approval.signature=sign(null,Buffer.from(JSON.stringify(["aoe2war/satchel/claim-return-approval/v2","wolo-1","uwolo",escrow,vault,2,a.operationId,String(claim.id),seeded.owner.uid,String(ticket.id),String(s.market.id),String(leg.id),entitlementId,"bet_payout",returned,approval.allocation_digest,issued,issued+120])),financial.privateKey).toString("base64");
        await returnReview.recordReviewedSatchelClaimReturnAuthorization(db.prisma,{claimId:claim.id,ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid,vault,escrow},{approval,entitlementId});
        returnContexts.set(String(claim.id),{protocol:1,kind:"claim_return",owner_id:seeded.owner.uid,operation_id:a.operationId,sender:escrow,recipient:vault,amount_uwolo:returned,memo:native.intent.Memo,tx_hash:native.tx_hash,funded_amount_uwolo:"25000000",return_approval:approval});
        await ledger.creditVerifiedSatchelClaimReturn(db.prisma,{claimId:claim.id,ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid});
        await ledger.creditVerifiedSatchelClaimReturn(db.prisma,{claimId:claim.id,ownerUserId:seeded.owner.id,ownerUid:seeded.owner.uid});
        expectedAvailable+=BigInt(claim.amountWolo)*U;
      }else assert.equal(claim,null,"losing matched stake cannot mint an owner return");
      const balance=await db.prisma.satchelFundedBalance.findUniqueOrThrow({where:{ownerUserId:seeded.owner.id}});
      assert.equal(balance.availableUwolo,expectedAvailable);assert.equal(balance.reservedUwolo,0n);assert.equal(balance.committedUwolo,BigInt(n*25)*U);
    }
    assert.equal(expectedAvailable,98n*U);
    assert.equal(await db.prisma.satchelFundedClaimReturn.count(),10);
    assert.equal(await db.prisma.betWager.count({where:{
      marketId:{in:previewBooks.map(row=>row.id)},
    }}),0,"original LIVE preview never acquires any funded or manual wager");
    assert.equal(await db.prisma.pendingWoloClaim.count({where:{
      sourceMarketId:{in:previewBooks.map(row=>row.id)},
    }}),0,"original LIVE preview cannot inherit settlement entitlements");
    assert.deepEqual(await db.prisma.betMarket.findMany({
      where:{id:{in:previewBooks.map(row=>row.id)}},
      select:{id:true,slug:true,bookPhase:true,status:true},
    }),previewBooks,"all original LIVE identities and statuses remain unchanged after native SDK settlement");
    const settledBefore=await db.prisma.betWager.findMany({orderBy:{id:"asc"},select:{id:true,payoutWolo:true,status:true,updatedAt:true}});
    await canonical.settleIsolatedLifecycleMarkets(db.prisma);
    assert.deepEqual(await db.prisma.betWager.findMany({orderBy:{id:"asc"},select:{id:true,payoutWolo:true,status:true,updatedAt:true}}),settledBefore,"terminalized wagers cannot settle or charge a fee twice");

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
    assert.equal(withdrawal.intent.AmountUWolo,"98000000");
    await t.test("durable custody postings and actual SDK principal, matched fees and gas conserve",async()=>{
      const journal=await db.prisma.satchelFundedJournal.aggregate({_sum:{deltaAvailableUwolo:true,deltaReservedUwolo:true,
        deltaCommittedUwolo:true,deltaWithdrawalPendingUwolo:true}});
      assert.equal(journal._sum.deltaAvailableUwolo,finalBalance.availableUwolo);
      assert.equal(journal._sum.deltaReservedUwolo,finalBalance.reservedUwolo);
      assert.equal(journal._sum.deltaCommittedUwolo,300n*U);
      assert.equal(journal._sum.deltaWithdrawalPendingUwolo,0n);
      const genesis=fixture.bank_states[0],final=fixture.bank_states.at(-1);assert.ok(final);
      assert.deepEqual(final.balances_uwolo,{owner:"98000000",vault:"87",escrow:"4000088",opponent:"98000000"});
      assert.equal(final.cumulative_fee_uwolo,"30");
      const sum=(values:Record<string,string>)=>Object.values(values).reduce((a,b)=>a+BigInt(b),0n);
      assert.equal(sum(genesis.balances_uwolo),sum(final.balances_uwolo)+30n);
      // Escrow's 100uwolo operating seed pays twelve actual return/payout fees;
      // its remaining principal is exactly 4 matched-only 1WOLO fees.
      assert.equal(BigInt(final.balances_uwolo.escrow)-100n+12n,4n*U);
      assert.equal(100n*U+298n*U-300n*U-98n*U,0n);
      assert.equal(await db.prisma.satchelPhysicalReceiptConsumption.count(),11);
      assert.equal(await db.prisma.satchelWagerBroadcast.count(),12);
      const tickets=await db.prisma.betStakeTicket.findMany({where:{source:"auto",status:"recorded"},select:{stakeTxHash:true}});
      assert.equal(tickets.length,12);assert.equal(new Set(tickets.map(t=>t.stakeTxHash)).size,12);
    });
  }finally{globalThis.fetch=originalFetch;await db.cleanup();rmSync(root,{recursive:true,force:true});}
});
