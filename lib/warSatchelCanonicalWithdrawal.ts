/**
 * Exclusive Satchel physical bank-send withdrawal verifier.
 * A signer HTTP 200, an untrusted transaction hash, or a bank balance alone
 * are NEVER proof of payment. Prove exactly one wolo-1 MsgSend, its sender,
 * payee, six-decimal amount and immutable request memo at 3+ block depth.
 */
const HASH=/^[0-9A-F]{64}$/;
const ADDR=/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const I64=BigInt("9223372036854775807");
const LIMIT=65536;
function assert(ok:unknown,reason:string): asserts ok {
  if(!ok)throw Error("SATCHEL_WITHDRAW_CANONICAL_REFUSED:"+reason);
}
function obj(raw:unknown):Record<string,unknown>{
  assert(raw!==null&&typeof raw==="object"&&!Array.isArray(raw),"invalid_object");
  return raw as Record<string,unknown>;
}
function int(value:unknown):bigint{
  assert(typeof value==="string"&&/^[1-9][0-9]{0,18}$/.test(value),"invalid_integer");
  const n=BigInt(value);
  assert(n<=I64,"overflow");
  return n;
}
export type CanonicalWithdrawalProof=Readonly<{
  kind:"canonical_satchel_owner_withdrawal";
  hash:string; confirmedHeight:string; headHeight:string;
  recipient:string; amountUwolo:string; withdrawalId:string;
}>;

export function inspectCanonicalSatchelWithdrawal(input:{
  withdrawalId:string;
  txHash:string;
  vaultAddress:string;
  ownerWalletAddress:string;
  amountUwolo:string;
  chainStatus:unknown;
  txResponse:unknown;
}):CanonicalWithdrawalProof{
  assert(/^[0-9a-f-]{36}$/i.test(input.withdrawalId),"bad_withdrawal_identity");
  assert(HASH.test(input.txHash)&&ADDR.test(input.vaultAddress)&&
    ADDR.test(input.ownerWalletAddress)&&
    input.ownerWalletAddress!==input.vaultAddress,"bad_sender_or_payee");
  int(input.amountUwolo);
  const status=obj(obj(input.chainStatus).result);
  const net=obj(status.node_info);
  const sync=obj(status.sync_info);
  assert(net.network==="wolo-1"&&sync.catching_up===false,"wrong_chain_or_sync");
  const head=int(sync.latest_block_height);
  const response=obj(input.txResponse);
  const receipt=obj(response.tx_response);
  assert(receipt.txhash===input.txHash,"hash_mismatch");
  const code=Object.prototype.hasOwnProperty.call(receipt,"code")?receipt.code:0;
  assert(code===0||code==="0","failed_execution");
  const height=int(receipt.height);
  assert(head>=height&&head-height+BigInt(1)>=BigInt(3),"not_chain_final");
  assert(response.tx!==null||receipt.tx!==null,"missing_decoded_transaction");
  const primary=response.tx!=null?obj(obj(response.tx).body):obj(obj(receipt.tx).body);
  if(response.tx!=null&&receipt.tx!=null){
    const other=obj(obj(receipt.tx).body);
    assert(JSON.stringify(primary)===JSON.stringify(other),"conflicting_decoded_bodies");
  }
  assert(primary.memo==="aoe2war/satchel/withdraw/v1/"+input.withdrawalId,
    "memo_does_not_bind_request");
  assert(Array.isArray(primary.messages)&&primary.messages.length===1,
    "ambiguous_multi_message_payout");
  const transfer=obj(primary.messages[0]);
  assert(transfer["@type"]==="/cosmos.bank.v1beta1.MsgSend"&&
    transfer.from_address===input.vaultAddress&&
    transfer.to_address===input.ownerWalletAddress,"wrong_payee_or_vault");
  assert(Array.isArray(transfer.amount)&&transfer.amount.length===1,
    "multi_denom_or_multi_coin");
  const coin=obj(transfer.amount[0]);
  assert(coin.denom==="uwolo"&&coin.amount===input.amountUwolo,
    "wrong_amount_or_denom");
  return Object.freeze({
    kind:"canonical_satchel_owner_withdrawal" as const,
    hash:input.txHash,
    confirmedHeight:height.toString(),
    headHeight:head.toString(),
    recipient:input.ownerWalletAddress,
    amountUwolo:input.amountUwolo,
    withdrawalId:input.withdrawalId,
  });
}

async function getCanonical(url:string,reader:typeof fetch){
  assert(url==="https://rpc-mainnet.aoe2war.com/status"||
    /^https:\/\/rest-mainnet\.aoe2war\.com\/cosmos\/tx\/v1beta1\/txs\/[0-9A-F]{64}$/.test(url),
    "untrusted_chain_endpoint");
  const resp=await reader(url,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json"},
    signal:AbortSignal.timeout(5000),
  });
  assert(resp.ok&&resp.status===200,"chain_unavailable");
  const len=Number(resp.headers.get("content-length")||"0");
  assert(Number.isFinite(len)&&len<=LIMIT,"oversized_payload");
  const body=await resp.text();
  assert(Buffer.byteLength(body)<=LIMIT,"oversized_payload");
  return JSON.parse(body) as unknown;
}
export async function inspectLiveCanonicalWithdrawal(input:{
  withdrawalId:string;
  txHash:string;
  vaultAddress:string;
  ownerWalletAddress:string;
  amountUwolo:string;
},reader:typeof fetch=fetch):Promise<CanonicalWithdrawalProof>{
  assert(HASH.test(input.txHash),"invalid_hash");
  const [chainStatus,txResponse]=await Promise.all([
    getCanonical("https://rpc-mainnet.aoe2war.com/status",reader),
    getCanonical("https://rest-mainnet.aoe2war.com/cosmos/tx/v1beta1/txs/"+input.txHash,reader),
  ]);
  return inspectCanonicalSatchelWithdrawal({...input,chainStatus,txResponse});
}
