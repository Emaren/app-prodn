/** Client-only send fences. These never confer custody or credit authority. */
import type {OfflineSigner} from '@cosmjs/proto-signing';
export type SatchelFundingQuote=Readonly<{
 enabled:true;chainId:'wolo-1';denom:'uwolo';ownerWalletAddress:string;
 recipientAddress:string;amountUwolo:string;memo:string;intentId:string;expiresAtUtc:string;
}>;
export type PreparedFundingIntent=Readonly<{id:string;expiresAtUtc:string}>;
const ADDRESS=/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function isCurrentSatchelFundingQuote(data:unknown,wallet:string,amountWolo:number,
 prepared:PreparedFundingIntent,nowMs=Date.now()):data is SatchelFundingQuote{
 if(!data||typeof data!=='object'||Array.isArray(data)||!Number.isSafeInteger(amountWolo)||amountWolo<1||
    !prepared||!UUID.test(prepared.id)||!Number.isSafeInteger(nowMs))return false;
 const q=data as Record<string,unknown>;
 return q.enabled===true&&q.chainId==='wolo-1'&&q.denom==='uwolo'&&ADDRESS.test(wallet)&&
  q.ownerWalletAddress===wallet&&typeof q.recipientAddress==='string'&&ADDRESS.test(q.recipientAddress)&&
  q.recipientAddress!==wallet&&q.amountUwolo===(BigInt(amountWolo)*BigInt(1000000)).toString()&&
  typeof q.memo==='string'&&/^aoe2war\/satchel\/v1\/[A-Za-z0-9_.:-]{1,128}\/[A-Za-z0-9_-]{16,64}$/.test(q.memo)&&
  q.memo.length<=240&&q.intentId===prepared.id&&q.expiresAtUtc===prepared.expiresAtUtc&&
  Number.isFinite(Date.parse(prepared.expiresAtUtc))&&Date.parse(prepared.expiresAtUtc)>nowMs&&
  Date.parse(prepared.expiresAtUtc)<=nowMs+30*60_000;
}
function refuse():never{throw Error('Keplr deposit expired, changed account or changed signed transaction. No broadcast authorized.');}
function sameBytes(a:unknown,b:Uint8Array):boolean{
 return a instanceof Uint8Array&&a.length===b.length&&b.every((v,i)=>a[i]===v);
}
function canonicalAmino(value:unknown,depth=0):string{
 if(depth>12)refuse();
 if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(typeof value==='string'){if(value.length>65536)refuse();return JSON.stringify(value);}
 if(Array.isArray(value)){if(value.length>64)refuse();return '['+value.map(v=>canonicalAmino(v,depth+1)).join(',')+']';}
 if(value&&typeof value==='object'){
  const fields=Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b));
  if(fields.length>64)refuse();
  return '{'+fields.map(([k,v])=>JSON.stringify(k)+':'+canonicalAmino(v,depth+1)).join(',')+'}';
 }
 return refuse();
}
/** SDK sendTokens signs THEN broadcasts. Reject an expired or altered wallet
 * response before returning a signature to that broadcast path. In particular
 * neither RPC connection I/O nor a slow Keplr popup can extend the quote.
 * No signature/broadcast retry is implemented; the UI retains uncertainty.
 */
export function freshSatchelFundingSigner(signer:OfflineSigner,wallet:string,
 expiresAtUtc:string,now:()=>number=Date.now):OfflineSigner{
 const expiry=Date.parse(expiresAtUtc);
 const fresh=()=>{const t=now();if(!Number.isSafeInteger(t)||!Number.isFinite(expiry)||t>=expiry)refuse();};
 const getAccounts=async()=>{
  fresh();const accounts=await signer.getAccounts();fresh();
  if(accounts.length!==1||accounts[0].address!==wallet)refuse();
  return accounts;
 };
 if('signDirect' in signer){
  return {getAccounts,signDirect:async(address,doc)=>{
   fresh();if(address!==wallet||doc.chainId!=='wolo-1'||doc.bodyBytes.length>65536||doc.authInfoBytes.length>65536)refuse();
   // Copy BEFORE crossing the extension boundary; it may mutate input in place.
   const body=Uint8Array.from(doc.bodyBytes),auth=Uint8Array.from(doc.authInfoBytes),account=doc.accountNumber;
   const response=await signer.signDirect(address,doc);fresh();await getAccounts();fresh();
   if(!response||response.signed.chainId!=='wolo-1'||response.signed.accountNumber!==account||
      !sameBytes(response.signed.bodyBytes,body)||!sameBytes(response.signed.authInfoBytes,auth))refuse();
   return response;
  }};
 }
 return {getAccounts,signAmino:async(address,doc)=>{
  fresh();if(address!==wallet||doc.chain_id!=='wolo-1')refuse();
  const original=canonicalAmino(doc);if(original.length>65536)refuse();
  const response=await signer.signAmino(address,doc);fresh();await getAccounts();fresh();
  if(!response||canonicalAmino(response.signed)!==original)refuse();
  return response;
 }};
}
