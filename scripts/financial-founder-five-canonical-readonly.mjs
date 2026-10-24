#!/usr/bin/env node
/**
 * Read-only historical WoloChain founder payment evidence. Private input from
 * financial-founder-five-private-feed-readonly.sql on stdin, NEVER in args/logs.
 * Reuse repository's envelope and MsgSend ordinal parser, not another decoder.
 * Does NOT attest consensus signatures, wallet ownership, signer authority or
 * historical bank-state effects; no financial payment/retry authority.
 */
import { createHash } from 'node:crypto';
import { readFileSync, openSync, writeFileSync, closeSync } from 'node:fs';
import { inspectWoloPayoutTxEnvelope } from '../lib/woloCanonicalPayoutEnvelope.ts';
import { extractCanonicalWoloMsgSends } from '../lib/woloCanonicalBankSends.ts';

const cases=[[411,2712,1000],[417,2760,1000],[435,2939,1000],[423,2827,100],[430,2881,1]];
const HASH=/^[a-f0-9]{64}$/i, ADDRESS=/^wolo1[0-9a-z]{20,90}$/;
const RPC='https://rpc-mainnet.aoe2war.com';
const REST='https://rest-mainnet.aoe2war.com';
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const requireTruth=(x,reason)=>{if(!x)throw Error('BLOCKED_'+reason)};
const privateArg=process.argv.find(x=>x.startsWith('--private-evidence='));
requireTruth(process.argv.slice(2).every(x=>x.startsWith('--private-evidence=')),'INVALID_ARGS');

async function get(url){
  const res=await fetch(url,{method:'GET',redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(7500),headers:{accept:'application/json'}});
  requireTruth(res.status===200,'UPSTREAM_HTTP_'+res.status);
  const max=2*1024*1024, parts=[];let size=0;
  for await (const data of res.body){size+=data.byteLength;requireTruth(size<=max,'RESPONSE_OVERSIZE');parts.push(Buffer.from(data));}
  const bytes=Buffer.concat(parts);
  return {json:JSON.parse(bytes.toString('utf8')),sha256:sha(bytes)};
}
function validatedRows(feed){
  const lines=feed.trim().split(/\r?\n/).filter(Boolean);
  requireTruth(lines.length===10,'ROW_COUNT');
  const rows=lines.map(JSON.parse);
  for(const [oldId,julyId,value] of cases){
    const old=rows.find(r=>r.claim_id===oldId), july=rows.find(r=>r.claim_id===julyId);
    requireTruth(!!old && !!july && old.a_id===oldId && old.b_id===julyId &&
      july.a_id===oldId && july.b_id===julyId &&
      old.role==='old' && july.role==='july','CASE_IDS');
    requireTruth(old.claim_kind==='founders_bonus' && july.claim_kind==='founders_bonus' &&
      old.status==='claimed' && july.status==='claimed' &&
      old.parent_id!=null && old.parent_id===july.parent_id &&
      old.user_id!=null && old.user_id===july.user_id &&
      old.player_key===july.player_key &&
      old.amount_wolo===value && july.amount_wolo===value &&
      old.expected_amount===value && july.expected_amount===value,'CLAIM_IDENTITY');
    for(const r of [old,july]){
      requireTruth(HASH.test(r.tx_hash) && r.event_count===1 &&
        Array.isArray(r.events) && r.events.length===1,'INDEX_OR_HASH');
      const e=r.events[0];
      requireTruth(ADDRESS.test(e.sender) && ADDRESS.test(e.recipient) &&
        e.amountUwolo===String(BigInt(value)*1000000n) &&
        Number.isInteger(e.transferIndex) && e.transferIndex>=0 &&
        /^[1-9][0-9]*$/.test(e.height),'INDEX_EVENT_DRIFT');
    }
    requireTruth(old.tx_hash.toUpperCase()!==july.tx_hash.toUpperCase(),'EXPECTED_DIFFERENT_HASH');
  }
  requireTruth(new Set(rows.map(r=>r.claim_id)).size===10,'DUPLICATE_CLAIM_ROWS');
  const r2712=rows.find(r=>r.claim_id===2712), r2760=rows.find(r=>r.claim_id===2760);
  requireTruth(r2712.tx_hash.toUpperCase()===r2760.tx_hash.toUpperCase() &&
    r2712.parent_id!==r2760.parent_id,'SHARED_HASH_DRIFT');
  requireTruth(new Set(rows.map(r=>r.tx_hash.toUpperCase())).size===9,'EXPECTED_NINE_HASHES');
  return rows;
}
function inBlock(data,hash,height){
  const b=data?.result?.block;
  const h=String(b?.header?.height??'');
  const id=data?.result?.block_id?.hash;
  const txs=b?.data?.txs;
  if(h!==height || !HASH.test(id??'') || !Array.isArray(txs))return null;
  const matched=txs.filter(s=>sha(Buffer.from(s,'base64'))===hash);
  return matched.length===1?id.toUpperCase():null;
}
async function chainEvidence(hash){
  const out={status:'UNVERIFIED',height:null,canonical:false,blockMembership:false,
    rpcTxMatch:false,commitObserved:false,trustedHeader:false,bankStateCertified:false,
    sends:[],evidenceDigest:null,error:null};
  const raw={};
  try{
    const rest=await get(REST+'/cosmos/tx/v1beta1/txs/'+hash);raw.rest=rest;
    const envelope=inspectWoloPayoutTxEnvelope(rest.json,hash);
    if(!envelope.ok){out.error=envelope.reason;return {out,raw};}
    const sends=extractCanonicalWoloMsgSends(rest.json,'uwolo');
    if(sends===null){out.error='INVALID_MSG_SEND_ORDINALS';return {out,raw};}
    out.canonical=true;out.height=envelope.committedHeight;out.sends=sends;
    const h=envelope.committedHeight;
    const [block,commit,rpcTx]=await Promise.all([
      get(RPC+'/block?height='+h),get(RPC+'/commit?height='+h),
      get(RPC+'/tx?hash=0x'+hash+'&prove=true')]);
    Object.assign(raw,{block,commit,rpcTx});
    const blockId=inBlock(block.json,hash,h);
    out.blockMembership=!!blockId;
    const rx=rpcTx.json?.result;
    out.rpcTxMatch=rx?.hash?.toUpperCase()===hash &&
      String(rx?.height)===h && Number(rx?.tx_result?.code??0)===0 &&
      typeof rx?.tx==='string' && sha(Buffer.from(rx.tx,'base64'))===hash;
    const sh=commit.json?.result?.signed_header;
    out.commitObserved=!!blockId &&
      sh?.commit?.block_id?.hash?.toUpperCase()===blockId &&
      String(sh?.commit?.height)===h;
    out.evidenceDigest=sha(Buffer.from(JSON.stringify(
      [rest.sha256,block.sha256,commit.sha256,rpcTx.sha256])));
    out.status=out.blockMembership && out.rpcTxMatch && out.commitObserved
      ? 'CHAIN_SEND_OBSERVED_UNATTESTED' : 'UNVERIFIED';
    if(out.status==='UNVERIFIED')out.error='BLOCK_OR_RPC_INCLUSION_INCONSISTENT';
  }catch(e){out.error=String(e?.message||e).slice(0,100);}
  return {out,raw};
}
export async function analyze(feed,inspect=chainEvidence){
  const rows=validatedRows(feed);
  if(inspect===chainEvidence){
    const [rpc,rest]=await Promise.all([
      get(RPC+'/status'),get(REST+'/cosmos/base/tendermint/v1beta1/node_info')]);
    requireTruth(rpc.json?.result?.node_info?.network==='wolo-1' &&
      rpc.json?.result?.sync_info?.catching_up===false &&
      rest.json?.default_node_info?.network==='wolo-1','CHAIN_ID_OR_NODE_SYNC');
  }
  const hashes=[...new Set(rows.map(r=>r.tx_hash.toUpperCase()))];
  const evidence=new Map();
  for(let i=0;i<hashes.length;i+=3){
    const group=hashes.slice(i,i+3);
    const fetched=await Promise.all(group.map(h=>inspect(h)));
    group.forEach((h,j)=>evidence.set(h,fetched[j]));
  }
  const matrix=[];
  for(const [oldId,julyId,amount] of cases){
    const record={oldClaim:oldId,julyClaim:julyId,amountWolo:amount,status:'UNVERIFIED',
      liability:'UNKNOWN',old:{},july:{}};
    for(const [label,id] of [['old',oldId],['july',julyId]]){
      const r=rows.find(x=>x.claim_id===id), chain=evidence.get(r.tx_hash.toUpperCase()).out;
      const x=r.events[0];
      const sends=chain.sends.filter(s=>s.fromAddress===x.sender &&
        s.toAddress===x.recipient && s.amountUwolo===x.amountUwolo);
      record[label]={status:chain.status,envelopeOk:chain.canonical,
        blockMembership:chain.blockMembership,rpcTxBytesMatch:chain.rpcTxMatch,
        commitReferenceObserved:chain.commitObserved,
        blockHeight:chain.height,matchedOrdinals:sends.map(s=>s.index),
        indexedSenderRecipientAmountFound:sends.length>0,
        walletAtHistoricalHeight:'UNKNOWN',senderPayoutAuthority:'UNKNOWN',
        bankEffect:'UNKNOWN',evidenceDigest:chain.evidenceDigest,error:chain.error};
    }
    matrix.push(record);
  }
  // Global multiset: shared transaction and MsgSend ordinal never counted twice.
  const grouped=new Map();
  for(const record of matrix)for(const label of ['old','july']){
    const id=label==='old'?record.oldClaim:record.julyClaim;
    const r=rows.find(x=>x.claim_id===id),x=r.events[0];
    const key=JSON.stringify([r.tx_hash.toUpperCase(),x.sender,x.recipient,x.amountUwolo]);
    const set=grouped.get(key)||[];set.push({record,label});grouped.set(key,set);
  }
  for(const group of grouped.values())if(group.length>1){
    const observed=group[0].record[group[0].label].matchedOrdinals;
    if(observed.length<group.length){
      for(const {record,label} of group){
        record[label].status='SHARED_SEND_UNALLOCATED';
        record.status='SHARED_SEND_UNALLOCATED';
      }
    }else{
      group.forEach(({record,label},i)=>{
        record[label].matchedOrdinals=[observed[i]];
        record[label].status='MULTI_SEND_OBSERVED_UNATTESTED';
      });
    }
  }
  return {
    publicReport:{mode:'NONAUTHORIZING_READ_ONLY',chain:'wolo-1',
      observedAt:new Date().toISOString(),caseCount:5,distinctTxReferences:hashes.length,
      trustedConsensusHeader:false,historicalWalletOwnershipCertified:false,
      independentBankEffectsCertified:false,solvency:'UNKNOWN',
      financialReleaseAuthorized:false,matrix},
    privateEvidence:{warning:'KEEP PRIVATE - NEVER POST TO GITHUB',
      hashes,dbRows:rows,transactionEvidence:[...evidence.entries()]},
  };
}
if(import.meta.url==='file://'+process.argv[1]){
  try{
    const {publicReport,privateEvidence}=await analyze(readFileSync(0,'utf8'));
    if(privateArg){
      const p=privateArg.slice('--private-evidence='.length);
      requireTruth(p.startsWith('/'),'ABSOLUTE_PRIVATE_PATH_REQUIRED');
      const fd=openSync(p,'wx',0o600);
      try{writeFileSync(fd,JSON.stringify(privateEvidence,null,2));}finally{closeSync(fd);}
    }
    console.log(JSON.stringify(publicReport,null,2));
    process.exitCode=3; // success of observation is intentionally NONAUTHORIZING
  }catch(e){
    console.error('BLOCKED: '+String(e?.message||e).slice(0,110));
    process.exitCode=2;
  }
}
