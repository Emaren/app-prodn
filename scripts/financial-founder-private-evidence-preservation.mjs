#!/usr/bin/env node
/**
 * Evidence preservation only: creates/verifies a PRIVATE manifest for an already
 * completed, NONAUTHORIZING founder run. No RPC, DB, wallet, signer or retries.
 * Digest equality proves local file consistency, NOT external witnessing,
 * contemporaneous provenance, historical payment or financial authorization.
 */
import { createHash } from 'node:crypto';
import {
  lstatSync, realpathSync, readFileSync, openSync, writeSync, fsyncSync,
  closeSync, constants as C,
} from 'node:fs';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PIN='19128d9dbc952b6a0fdffede2469fb026b902532';
const TARGETS=['private-evidence.json','restricted-report.json'];
const OUTPUT='preservation-manifest.private.json';
const IDS=[[411,2712],[417,2760],[435,2939],[423,2827],[430,2881]];
const allowedCases=new Set(IDS.map(([old,july])=>`${old}/${july}`));
const fail=code=>{throw Error('BLOCKED_'+code)};
const digest=data=>createHash('sha256').update(data).digest('hex');
const own=(s)=>process.getuid?.()===undefined||s.uid===process.getuid();
const trustedAncestor=(s)=>own(s)||s.uid===0;

function checkPathParts(value,expectDirectory){
  if(!isAbsolute(value)||resolve(value)!==value)fail('ABSOLUTE_NORMALIZED_PATH_REQUIRED');
  // Reject a symlink at ANY component, including ancestor directory aliases.
  let cur=parse(value).root;
  for(const part of value.slice(cur.length).split('/').filter(Boolean)){
    cur=join(cur,part);
    const s=lstatSync(cur);
    if(s.isSymbolicLink())fail('SYMLINK_COMPONENT');
    if(cur!==value&&!trustedAncestor(s))fail('FOREIGN_ANCESTOR_OWNER');
    if(cur===value&&!own(s))fail('FOREIGN_OWNER');
    if(cur!==value&&!s.isDirectory())fail('NON_DIRECTORY_ANCESTOR');
  }
  const s=lstatSync(value);
  if(expectDirectory){
    if(!s.isDirectory()||(s.mode&0o077)!==0)fail('PRIVATE_DIRECTORY_REQUIRED');
  }else if(!s.isFile()||(s.mode&0o077)!==0||s.nlink!==1){
    fail('PRIVATE_REGULAR_FILE_REQUIRED');
  }
  return s;
}
function readPrivate(dir,name){
  const p=join(dir,name),s=checkPathParts(p,false);
  if(s.size<2||s.size>128*1024*1024)fail('INVALID_EVIDENCE_SIZE');
  const data=readFileSync(p,{flag:C.O_RDONLY|(C.O_NOFOLLOW||0)});
  if(data.length!==s.size)fail('FILE_CHANGED_DURING_READ');
  return {size:data.length,sha256:digest(data),value:JSON.parse(data.toString('utf8'))};
}
function validate(privateEvidence,report){
  if(privateEvidence?.warning!=='KEEP PRIVATE - NEVER POST TO GITHUB'||
     !Array.isArray(privateEvidence.hashes)||privateEvidence.hashes.length!==9||
     new Set(privateEvidence.hashes.map(x=>String(x).toUpperCase())).size!==9||
     !privateEvidence.hashes.every(x=>typeof x==='string'&&/^[0-9a-f]{64}$/i.test(x))||
     !Array.isArray(privateEvidence.dbRows)||privateEvidence.dbRows.length!==10||
     !Array.isArray(privateEvidence.transactionEvidence)||privateEvidence.transactionEvidence.length!==9)
    fail('PRIVATE_EVIDENCE_SHAPE');
  if(report?.mode!=='NONAUTHORIZING_READ_ONLY'||report?.chain!=='wolo-1'||
     report?.caseCount!==5||report?.distinctTxReferences!==9||
     report?.financialReleaseAuthorized!==false||report?.trustedConsensusHeader!==false||
     report?.historicalWalletOwnershipCertified!==false||
     report?.independentBankEffectsCertified!==false||report?.solvency!=='UNKNOWN'||
     !Array.isArray(report.matrix)||report.matrix.length!==5)
    fail('REPORT_AUTHORITY_OR_SHAPE');
  const seen=new Set();
  for(const row of report.matrix){
    const id=`${row.oldClaim}/${row.julyClaim}`;
    if(!allowedCases.has(id)||seen.has(id)||row.liability!=='UNKNOWN')fail('CLAIM_MATRIX_DRIFT');
    seen.add(id);
    for(const name of ['old','july']){
      const leg=row[name];
      if(!leg||leg.walletAtHistoricalHeight!=='UNKNOWN'||
         leg.senderPayoutAuthority!=='UNKNOWN'||leg.bankEffect!=='UNKNOWN'||
         !['UNVERIFIED','CHAIN_SEND_OBSERVED_UNATTESTED','SHARED_SEND_UNALLOCATED','MULTI_SEND_OBSERVED_UNATTESTED'].includes(leg.status))
        fail('LEG_AUTHORITY_DRIFT');
    }
    if([2712,2760].includes(row.julyClaim)&&(
      row.july.status!=='SHARED_SEND_UNALLOCATED'||
      !Array.isArray(row.july.matchedOrdinals)||row.july.matchedOrdinals.length!==1||
      row.july.matchedOrdinals[0]!==0))fail('JULY_SHARED_SEND_NOT_HELD');
  }
  if(seen.size!==5)fail('MISSING_CASES');
}
export function preserve(dir,mode){
  if(!['seal','verify'].includes(mode))fail('INVALID_MODE');
  checkPathParts(dir,true);
  const files={};
  for(const name of TARGETS){
    const info=readPrivate(dir,name);
    files[name]={bytes:info.size,sha256:info.sha256};
    files[name].value=info.value;  // never store content in the manifest
  }
  validate(files['private-evidence.json'].value,files['restricted-report.json'].value);
  const clean=Object.fromEntries(TARGETS.map(name=>[name,{
    bytes:files[name].bytes,sha256:files[name].sha256,
  }]));
  const contents={schema:'aoe2war-private-founder-preservation-v1',
    sourceCommit:PIN,authority:'NONAUTHORIZING_EVIDENCE_PRESERVATION_ONLY',
    financialReleaseAuthorized:false,independentConsensusVerified:false,
    bankEffectsCertified:false,solvency:'UNKNOWN',files:clean};
  const path=join(dir,OUTPUT);
  if(mode==='seal'){
    // Fail rather than replace a preexisting manifest. Operator controls independent timestamp/signature later.
    const fd=openSync(path,C.O_WRONLY|C.O_CREAT|C.O_EXCL|(C.O_NOFOLLOW||0),0o600);
    try{
      writeSync(fd,JSON.stringify(contents,null,2)+'\n');fsyncSync(fd);
    }finally{closeSync(fd);}
  }else{
    const manifest=readPrivate(dir,OUTPUT).value;
    if(JSON.stringify(manifest)!==JSON.stringify(contents))fail('EVIDENCE_DIGEST_MISMATCH');
  }
  return Object.freeze({status:'PRIVATE_EVIDENCE_CONSISTENT_NONAUTHORIZING',
    independentConsensusVerified:false,bankEffectsCertified:false,
    financialReleaseAuthorized:false,solvency:'UNKNOWN'});
}
function direct(){
  if(!process.argv[1])return false;
  try{return realpathSync(fileURLToPath(import.meta.url))===realpathSync(process.argv[1]);}
  catch{return false;}
}
if(direct()){
  try{
    if(process.argv.length!==4)fail('USE_SEAL_OR_VERIFY_AND_PRIVATE_DIR');
    const result=preserve(process.argv[3],process.argv[2]);
    console.log('STEP: PRIVATE_FINANCIAL_EVIDENCE_'+process.argv[2].toUpperCase());
    console.log('RESULT='+result.status);
    console.log('CONSENSUS_VERIFIED=false BANK_EFFECTS_CERTIFIED=false SOLVENCY=UNKNOWN');
    console.log('FINANCIAL_AUTHORIZED=false');
    process.exitCode=3; // Successful NONAUTHORIZING operation
  }catch(e){
    console.error('STEP: PRIVATE_FINANCIAL_EVIDENCE_PRESERVATION');
    console.error('RESULT=BLOCKED ERROR='+String(e.message||e).replace(/[^A-Z_]/g,'').slice(0,100));
    process.exitCode=2;
  }
}
