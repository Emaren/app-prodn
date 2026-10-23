/**
 * Verify custody-funded bet payouts or complete unmatched refunds received
 * from the independent Wolo betting ESCROW into the dedicated War Satchel
 * vault. Unlike a user deposit, this is claimed-market return of assets.
 * This source only validates public chain evidence; it signs nothing.
 */
const HASH=/^[A-F0-9]{64}$/;
const ADDRESS=/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const INTEGER=/^[1-9][0-9]{0,18}$/;
const MAX=BigInt("9223372036854775807");
const LIMIT=65536;
function halt(s:string):never{throw Error("SATCHEL_CLAIM_RETURN_PROOF_REFUSED:"+s)}
function o(x:unknown):Record<string,unknown>{
  if(!x||typeof x!=="object"||Array.isArray(x))halt("invalid_canonical_json");
  return x as Record<string,unknown>;
}
function positive(x:unknown):bigint{
  if(typeof x!=="string"||!INTEGER.test(x))halt("bad_uwolo_or_block");
  const n=BigInt(x);
  if(n>MAX)halt("out_of_range");
  return n;
}
export type ProvenSatchelClaimReturn=Readonly<{
  claimId:number;claimKind:"bet_payout"|"bet_refund";
  txHash:string;canonicalHeight:bigint;headHeight:bigint;
  amountUwolo:bigint;vaultAddress:string;escrowAddress:string;
}>;
export function verifyCanonicalSatchelClaimReturn(input:{
  claimId:number; claimKind:"bet_payout"|"bet_refund";
  txHash:string; escrowAddress:string;vaultAddress:string;
  amountUwolo:string; chainStatus:unknown;txResponse:unknown;
}):ProvenSatchelClaimReturn{
  if(!Number.isSafeInteger(input.claimId)||input.claimId<1 ||
      !["bet_payout","bet_refund"].includes(input.claimKind) ||
      !HASH.test(input.txHash) ||!ADDRESS.test(input.escrowAddress)||
      !ADDRESS.test(input.vaultAddress)||
      input.escrowAddress===input.vaultAddress)halt("invalid_return_identity");
  const amount=positive(input.amountUwolo);
  const status=o(o(input.chainStatus).result);
  const info=o(status.node_info), sync=o(status.sync_info);
  if(info.network!=="wolo-1"||sync.catching_up!==false)halt("wrong_chain_or_syncing");
  const head=positive(sync.latest_block_height);
  const wrapper=o(input.txResponse),response=o(wrapper.tx_response);
  if(response.txhash!==input.txHash)halt("wrong_tx_hash");
  const code=Object.prototype.hasOwnProperty.call(response,"code")?response.code:0;
  if(code!==0&&code!=="0")halt("failed_chain_transaction");
  const height=positive(response.height);
  if(head<height||head-height+BigInt(1)<BigInt(3))halt("unconfirmed_chain_transaction");
  if(wrapper.tx==null&&response.tx==null)halt("missing_decoded_transaction");
  const body=o(o(wrapper.tx??response.tx).body);
  if(wrapper.tx!=null&&response.tx!=null){
    if(JSON.stringify(body)!==JSON.stringify(o(o(response.tx).body)))halt("ambiguous_tx_bodies");
  }
  if(body.memo!=="aoe2war/satchel/claim-return/v1/"+input.claimId)halt("claim_return_memo_mismatch");
  if(!Array.isArray(body.messages)||body.messages.length!==1)halt("multi_message_ambiguous_return");
  const send=o(body.messages[0]);
  if(send["@type"]!=="/cosmos.bank.v1beta1.MsgSend" ||
      send.from_address!==input.escrowAddress ||
      send.to_address!==input.vaultAddress)halt("not_escrow_to_exclusive_vault");
  if(!Array.isArray(send.amount)||send.amount.length!==1)halt("multi_denom_return");
  const coin=o(send.amount[0]);
  if(coin.denom!=="uwolo"||coin.amount!==input.amountUwolo)halt("return_amount_mismatch");
  return Object.freeze({
    claimId:input.claimId,claimKind:input.claimKind,
    txHash:input.txHash,canonicalHeight:height,headHeight:head,
    amountUwolo:amount,vaultAddress:input.vaultAddress,
    escrowAddress:input.escrowAddress,
  });
}
async function fetchStrict(url:string,reader:typeof fetch){
  if(url!=="https://rpc-mainnet.aoe2war.com/status"&&
     !/^https:\/\/rest-mainnet\.aoe2war\.com\/cosmos\/tx\/v1beta1\/txs\/[A-F0-9]{64}$/.test(url))
    halt("untrusted_chain_endpoint");
  const response=await reader(url,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json"},
    signal:AbortSignal.timeout(5500),
  });
  if(!response.ok||response.status!==200)halt("chain_rpc_unavailable");
  const length=Number(response.headers.get("content-length")||"0");
  if(!Number.isSafeInteger(length)||length>LIMIT)halt("oversized_chain_reply");
  const body=await response.text();
  if(Buffer.byteLength(body)>LIMIT)halt("oversized_chain_reply");
  return JSON.parse(body) as unknown;
}
export async function verifyLiveCanonicalSatchelClaimReturn(
  input:Omit<Parameters<typeof verifyCanonicalSatchelClaimReturn>[0],"chainStatus"|"txResponse">,
  reader:typeof fetch=fetch,
):Promise<ProvenSatchelClaimReturn>{
  if(!HASH.test(input.txHash))halt("wrong_tx_hash");
  const [chainStatus,txResponse]=await Promise.all([
    fetchStrict("https://rpc-mainnet.aoe2war.com/status",reader),
    fetchStrict("https://rest-mainnet.aoe2war.com/cosmos/tx/v1beta1/txs/"+input.txHash,reader),
  ]);
  return verifyCanonicalSatchelClaimReturn({...input,chainStatus,txResponse});
}
