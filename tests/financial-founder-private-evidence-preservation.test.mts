import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,chmodSync,writeFileSync,appendFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preserve} from '../scripts/financial-founder-private-evidence-preservation.mjs';
const cases=[[411,2712],[417,2760],[435,2939],[423,2827],[430,2881]];
function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'private-finance-preserve-'));chmodSync(dir,0o700);
  const hashes=Array.from({length:9},(_,i)=>(i+1).toString(16).padStart(64,'0'));
  const e={warning:'KEEP PRIVATE - NEVER POST TO GITHUB',hashes,
    dbRows:Array(10).fill({syntheticSecret:'wolo1SENSITIVE_FICTIONAL'}),
    transactionEvidence:Array(9).fill({syntheticSecret:'wolo1SENSITIVE_FICTIONAL'})};
  const matrix=cases.map(([old,july])=>({oldClaim:old,julyClaim:july,liability:'UNKNOWN',
    old:{status:'CHAIN_SEND_OBSERVED_UNATTESTED',walletAtHistoricalHeight:'UNKNOWN',senderPayoutAuthority:'UNKNOWN',bankEffect:'UNKNOWN'},
    july:{status:[2712,2760].includes(july)?'SHARED_SEND_UNALLOCATED':'CHAIN_SEND_OBSERVED_UNATTESTED',
      matchedOrdinals:[0],walletAtHistoricalHeight:'UNKNOWN',senderPayoutAuthority:'UNKNOWN',bankEffect:'UNKNOWN'}}));
  const r={mode:'NONAUTHORIZING_READ_ONLY',chain:'wolo-1',caseCount:5,
    distinctTxReferences:9,financialReleaseAuthorized:false,trustedConsensusHeader:false,
    historicalWalletOwnershipCertified:false,independentBankEffectsCertified:false,
    solvency:'UNKNOWN',matrix};
  for(const [name,contents] of [['private-evidence.json',e],['restricted-report.json',r]])
    writeFileSync(join(dir,name),JSON.stringify(contents),{mode:0o600});
  return {dir,r};
}
test('private original data sealed and verified without granting authority',()=>{
  const f=fixture();try{
    assert.equal(preserve(f.dir,'seal').financialReleaseAuthorized,false);
    assert.equal(preserve(f.dir,'verify').solvency,'UNKNOWN');
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('byte-level private evidence tampering fails before any positive verdict',()=>{
  const f=fixture();try{
    preserve(f.dir,'seal');appendFileSync(join(f.dir,'private-evidence.json'),' ');
    assert.throws(()=>preserve(f.dir,'verify'),/EVIDENCE_DIGEST_MISMATCH/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('report mutation to authorize real money is rejected',()=>{
  const f=fixture();try{
    f.r.financialReleaseAuthorized=true;
    writeFileSync(join(f.dir,'restricted-report.json'),JSON.stringify(f.r),{mode:0o600});
    assert.throws(()=>preserve(f.dir,'seal'),/REPORT_AUTHORITY_OR_SHAPE/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('shared July ordinal cannot be treated as independently allocated',()=>{
  const f=fixture();try{
    f.r.matrix[1].july.status='CHAIN_SEND_OBSERVED_UNATTESTED';
    writeFileSync(join(f.dir,'restricted-report.json'),JSON.stringify(f.r),{mode:0o600});
    assert.throws(()=>preserve(f.dir,'seal'),/JULY_SHARED_SEND_NOT_HELD/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('symlinked run directory alias refuses evidence access',()=>{
  const f=fixture();const alias=f.dir+'-alias';try{
    symlinkSync(f.dir,alias);
    assert.throws(()=>preserve(alias,'seal'),/SYMLINK_COMPONENT/);
  }finally{rmSync(alias,{force:true});rmSync(f.dir,{recursive:true,force:true});}
});
test('world-readable private evidence is refused',()=>{
  const f=fixture();try{
    chmodSync(join(f.dir,'restricted-report.json'),0o644);
    assert.throws(()=>preserve(f.dir,'seal'),/PRIVATE_REGULAR_FILE_REQUIRED/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('cannot silently skip entrypoint or print synthetic private text',()=>{
  const f=fixture();try{
    const script=fileURLToPath(new URL('../scripts/financial-founder-private-evidence-preservation.mjs',import.meta.url));
    const child=spawnSync(process.execPath,[script,'seal',f.dir],{encoding:'utf8',timeout:10000});
    assert.equal(child.status,3,child.stderr);
    assert.match(child.stdout,/NONAUTHORIZING/);
    assert.doesNotMatch(child.stdout+child.stderr,/SENSITIVE_FICTIONAL|[0-9a-f]{64}/i);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
