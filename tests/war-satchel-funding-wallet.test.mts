import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Module,{createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function load(relative:string,extra=''):Record<string,unknown>{
 const filename=path.join(ROOT,relative);
 const text=readFileSync(filename,'utf8')+extra;
 const code=ts.transpileModule(text,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 const original=createRequire(filename);
 m.require=(name:string)=>name==='@/lib/warSatchelFundingWallet'?load('lib/warSatchelFundingWallet.ts'):original(name);
 m._compile(code,filename);return m.exports;
}
const wallet='wolo1'+'q'.repeat(38),vault='wolo1'+'p'.repeat(38);
const id='12345678-1234-4123-8123-123456789abc';
function prepared(){return{id,expiresAtUtc:new Date(Date.now()+60000).toISOString()};}
function quote(p=prepared()){return{enabled:true,chainId:'wolo-1',denom:'uwolo',ownerWalletAddress:wallet,recipientAddress:vault,amountUwolo:'10000000',memo:'aoe2war/satchel/v1/owner-1/abcdefghijklmnop',intentId:p.id,expiresAtUtc:p.expiresAtUtc};}
const ui=load('components/profile/WarSatchelFundingAction.tsx','\nexport {quoteValid};\n');
const valid=ui.quoteValid as (data:unknown,wallet:string,amount:number,prepared:{id:string;expiresAtUtc:string})=>boolean;
test('actual funding component refuses a quote substituted for a different prepared intent',()=>{
 const p=prepared();assert.equal(valid(quote(p),wallet,10,p),true);
 assert.equal(valid({...quote(p),intentId:'12345678-1234-4123-8123-123456789abd'},wallet,10,p),false);
 assert.equal(valid({...quote(p),expiresAtUtc:new Date(Date.now()+120000).toISOString()},wallet,10,p),false);
});

import {freshSatchelFundingSigner,isCurrentSatchelFundingQuote} from '../lib/warSatchelFundingWallet.ts';
import type {OfflineDirectSigner} from '@cosmjs/proto-signing';
import {SigningStargateClient} from '@cosmjs/stargate';
const account={address:wallet,algo:'secp256k1' as const,pubkey:Uint8Array.from([2,...new Array(32).fill(1)])};
const signature={pub_key:{type:'tendermint/PubKeySecp256k1',value:Buffer.from(account.pubkey).toString('base64')},signature:Buffer.alloc(64).toString('base64')};
const directDoc=()=>({bodyBytes:Uint8Array.from([1,2]),authInfoBytes:Uint8Array.from([3,4]),chainId:'wolo-1',accountNumber:BigInt(1)});

test('only exact current owner/amount/memo/intent quotes reach a signing client',()=>{
 const p=prepared(),good=quote(p);
 for(const patch of [{chainId:'wrong'},{denom:'wolo'},{ownerWalletAddress:vault},{recipientAddress:wallet},
  {amountUwolo:'10'},{memo:'aoe2war/satchel/v1/'},{memo:'aoe2war/satchel/v1/other/missingNonce'},
  {intentId:'not-a-uuid'},{expiresAtUtc:'not-a-date'}]){
  assert.equal(isCurrentSatchelFundingQuote({...good,...patch},wallet,10,p),false,JSON.stringify(patch));
 }
 assert.equal(isCurrentSatchelFundingQuote(good,wallet,NaN,p),false);
});

test('real Cosmos SDK cannot broadcast when Keplr approval outlives the quote',async()=>{
 let clock=Date.now(),broadcasts=0,signs=0;
 const expiry=new Date(clock+1000).toISOString();
 const signer:OfflineDirectSigner={getAccounts:async()=>[account],signDirect:async(_address,doc)=>{
  signs++;clock+=1001;return{signed:doc,signature};
 }};
 const client=await SigningStargateClient.offline(freshSatchelFundingSigner(signer,wallet,expiry,()=>clock));
 // Disposable transport only: real SDK constructs/signs its MsgSend, then its
 // broadcast hook must remain unreachable. No server or wallet is contacted.
 client.getChainId=async()=> 'wolo-1';
 client.getSequence=async()=>({accountNumber:1,sequence:0});
 client.broadcastTx=async()=>{broadcasts++;throw Error('UNSAFE_BROADCAST_REACHED');};
 await assert.rejects(client.sendTokens(wallet,vault,[{denom:'uwolo',amount:'10000000'}],
  {amount:[{denom:'uwolo',amount:'5000'}],gas:'200000'},quote().memo),/No broadcast authorized/);
 assert.equal(signs,1);assert.equal(broadcasts,0);client.disconnect();
});

test('connection delay, changed wallet and in-place signed body mutation all refuse',async()=>{
 const now=Date.now();
 const base:OfflineDirectSigner={getAccounts:async()=>[account],signDirect:async(_a,doc)=>({signed:doc,signature})};
 const expired=freshSatchelFundingSigner(base,wallet,new Date(now+1000).toISOString(),()=>now+1001);
 await assert.rejects(expired.getAccounts(),/No broadcast authorized/);
 let changed=false;
 const moved:OfflineDirectSigner={getAccounts:async()=>[{...account,address:changed?vault:wallet}],signDirect:async(_a,doc)=>{changed=true;return{signed:doc,signature};}};
 const guarded=freshSatchelFundingSigner(moved,wallet,new Date(now+1000).toISOString(),()=>now);
 assert.ok('signDirect' in guarded);
 await assert.rejects(guarded.signDirect(wallet,directDoc()),/No broadcast authorized/);
 const mutation:OfflineDirectSigner={getAccounts:base.getAccounts,signDirect:async(_a,doc)=>{doc.bodyBytes[0]=99;return{signed:doc,signature};}};
 const protectedSigner=freshSatchelFundingSigner(mutation,wallet,new Date(now+1000).toISOString(),()=>now);
 assert.ok('signDirect' in protectedSigner);
 await assert.rejects(protectedSigner.signDirect(wallet,directDoc()),/No broadcast authorized/);
});

test('ordinary direct and Amino approvals pass once; changed or late Amino approvals cannot pass',async()=>{
 const now=Date.now(),expiry=new Date(now+1000).toISOString();
 const direct:OfflineDirectSigner={getAccounts:async()=>[account],signDirect:async(_a,doc)=>({signed:doc,signature})};
 const guarded=freshSatchelFundingSigner(direct,wallet,expiry,()=>now);assert.ok('signDirect' in guarded);
 assert.equal((await guarded.signDirect(wallet,directDoc())).signature,signature);
 const doc={chain_id:'wolo-1',account_number:'1',sequence:'0',memo:quote().memo,
  fee:{amount:[{denom:'uwolo',amount:'5000'}],gas:'200000'},msgs:[{type:'cosmos-sdk/MsgSend',value:{to_address:vault}}]};
 let clock=now;
 const amino={getAccounts:async()=>[account],signAmino:async(_a:string,d:typeof doc)=>({signed:d,signature})};
 const a=freshSatchelFundingSigner(amino,wallet,expiry,()=>clock);assert.ok('signAmino' in a);
 assert.equal((await a.signAmino(wallet,doc)).signature,signature);
 const changed={...amino,signAmino:async(_a:string,d:typeof doc)=>({signed:{...d,memo:'changed'},signature})};
 const c=freshSatchelFundingSigner(changed,wallet,expiry,()=>clock);assert.ok('signAmino' in c);
 await assert.rejects(c.signAmino(wallet,doc),/No broadcast authorized/);
 const late={...amino,signAmino:async(_a:string,d:typeof doc)=>{clock+=1001;return{signed:d,signature};}};
 const l=freshSatchelFundingSigner(late,wallet,expiry,()=>clock);assert.ok('signAmino' in l);
 await assert.rejects(l.signAmino(wallet,doc),/No broadcast authorized/);
});
