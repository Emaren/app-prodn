import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../scripts/financial-founder-five-canonical-readonly.mjs';

const C=[[411,2712,1000],[417,2760,1000],[435,2939,1000],
  [423,2827,100],[430,2881,1]];
const TO='wolo1'+'a'.repeat(38),FROM='wolo1'+'b'.repeat(38);
function source(){
  let n=0;
  const input=[];
  for(const [old,july,amount] of C){
    n++;
    const parent=n;
    const oldHash=String(n).padStart(64,'0');
    const julyHash=july===2760?String(1001).padStart(64,'0'):
      String(1000+n).padStart(64,'0');
    for(const [role,id,hash] of [['old',old,oldHash],['july',july,julyHash]]){
      input.push(JSON.stringify({
        a_id:old,b_id:july,expected_amount:amount,role,claim_id:id,
        status:'claimed',claim_kind:'founders_bonus',parent_id:parent,
        player_key:'synthetic-'+n,user_id:n,amount_wolo:amount,
        tx_hash:hash,created_at:'2026-07-04T10:00:00',
        event_count:1,
        events:[{transferIndex:0,height:'1234',timestamp:'2026-07-04T10:00:01',
          sender:FROM,recipient:TO,amountUwolo:String(amount*1000000)}]
      }));
    }
  }
  return input.join('\n')+'\n';
}
function chain(hash,sharedHasTwo=false){
  const index=parseInt(hash,10);
  const isShared=index===1001;
  const amount=isShared?1000:index<=5?[1000,1000,1000,100,1][index-1]:
    [1000,1000,1000,100,1][index-1001];
  const send={index:0,fromAddress:FROM,toAddress:TO,amountUwolo:String(amount*1000000)};
  const sends=isShared&&sharedHasTwo?[send,{...send,index:1}]:[send];
  return {out:{status:'CHAIN_SEND_OBSERVED_UNATTESTED',canonical:true,
    blockMembership:true,rpcTxMatch:true,commitObserved:true,height:'1234',
    sends,evidenceDigest:'synthetic-only',error:null},raw:{}};
}
test('10 private rows resolve to 9 unique transaction references, never published',async()=>{
  const result=await analyze(source(),async hash=>chain(hash));
  assert.equal(result.publicReport.caseCount,5);
  assert.equal(result.publicReport.distinctTxReferences,9);
  assert.equal(result.publicReport.solvency,'UNKNOWN');
  assert.equal(result.publicReport.financialReleaseAuthorized,false);
  assert.equal(result.publicReport.matrix.length,5);
  assert.equal(result.publicReport.matrix[0].july.status,'SHARED_SEND_UNALLOCATED');
  assert.equal(result.publicReport.matrix[1].july.status,'SHARED_SEND_UNALLOCATED');
  const rendered=JSON.stringify(result.publicReport);
  assert.ok(!rendered.includes(TO));
  assert.ok(!rendered.includes(FROM));
  assert.ok(!rendered.includes('synthetic-player-'));
  assert.ok(!rendered.includes(String(1001).padStart(64,'0')));
});
test('two independent MsgSend ordinals cannot be confused with one',async()=>{
  const result=await analyze(source(),async hash=>chain(hash,true));
  const first=result.publicReport.matrix[0].july;
  const second=result.publicReport.matrix[1].july;
  assert.equal(first.status,'MULTI_SEND_OBSERVED_UNATTESTED');
  assert.equal(second.status,'MULTI_SEND_OBSERVED_UNATTESTED');
  assert.notDeepEqual(first.matchedOrdinals,second.matchedOrdinals);
  assert.equal(result.publicReport.trustedConsensusHeader,false);
});
test('drift in private input fails closed',async()=>{
  const truncated=source().split('\n').slice(0,9).join('\n');
  await assert.rejects(analyze(truncated,async hash=>chain(hash)),/BLOCKED_/);
});

test('macOS-style symlinked CLI path must execute and reject malformed private input, not silently return zero',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'aoe2war-cli-path-'));
  const alias=join(tmp,'macos-var-symlink.mjs');
  try {
    symlinkSync(fileURLToPath(new URL('../scripts/financial-founder-five-canonical-readonly.mjs',import.meta.url)),alias);
    const child=spawnSync(process.execPath,['--experimental-strip-types',alias],{
      input:'[]\n',encoding:'utf8',timeout:10000,
    });
    assert.equal(child.status,2,`unexpected silent/skip exit: ${child.status} ${child.stderr}`);
    assert.match(child.stderr,/BLOCKED: BLOCKED_ROW_COUNT/);
    assert.equal(child.stdout,'');
  }finally{
    rmSync(tmp,{force:true,recursive:true});
  }
});

test('direct CLI rejects malformed NDJSON bytes without reaching a chain endpoint or emitting success',()=>{
  const script=fileURLToPath(new URL('../scripts/financial-founder-five-canonical-readonly.mjs',import.meta.url));
  const child=spawnSync(process.execPath,['--experimental-strip-types',script],{
    input:('{'+'"not":'+'\n').repeat(10),encoding:'utf8',timeout:10000,
  });
  assert.equal(child.status,2,`malformed stream should never silently succeed: ${child.status}`);
  assert.match(child.stderr,/BLOCKED: (Unexpected|Expected|Unterminated|Bad)/);
  assert.equal(child.stdout,'');
});
test('symlinked CLI rejects truncated valid NDJSON with no output, never exit zero',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'aoe2war-private-path-'));
  const alias=join(tmp,'private-var-alias.mjs');
  try {
    symlinkSync(fileURLToPath(new URL('../scripts/financial-founder-five-canonical-readonly.mjs',import.meta.url)),alias);
    const child=spawnSync(process.execPath,['--experimental-strip-types',alias],{
      input:'{"claim_id":411}\n',encoding:'utf8',timeout:10000,
    });
    assert.equal(child.status,2);
    assert.match(child.stderr,/BLOCKED: BLOCKED_ROW_COUNT/);
    assert.equal(child.stdout,'');
  }finally{rmSync(tmp,{force:true,recursive:true});}
});
