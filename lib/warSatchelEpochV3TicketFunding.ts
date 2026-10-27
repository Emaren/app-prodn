/**
 * HELD HD epoch v3: a ticket may fund several markets through ONE bank MsgSend.
 * Never count the same original funding receipt once per market leg. Distinct
 * economic leg entitlements reference one owner-bound ticket funding record.
 * Pure source validator; no authenticated chain proof or database transaction.
 */
const EPOCH = /^[a-z][a-z0-9_-]{11,63}$/;
const HASH = /^[A-F0-9]{64}$/;
const UID = /^[a-zA-Z0-9_.:-]{1,100}$/;
const UWOLO = BigInt(1000000);
const MAX_BET = BigInt(10000)*UWOLO;
const WHOLE = /^[1-9][0-9]{0,17}$/;
function requireIt(ok:unknown,code:string):asserts ok {
  if(!ok) throw Error("EPOCH_V3_TICKET_FUNDING_HOLD:"+code);
}
export type EpochTicketLeg = Readonly<{
  marketId:number;legId:number;amountUwolo:string;
}>;
export type EpochTicketFunding = Readonly<{
  chainId:"wolo-1";epochId:string;operationId:string;ownerUid:string;
  ticketId:number;txHash:string;messageIndex:number;totalUwolo:string;
  legs:readonly EpochTicketLeg[];
}>;
/**
 * The DB must UNIQUE(chain_id,tx_hash,message_index) for the TICKET funding,
 * and UNIQUE(epoch,ticket,market,leg) for economic leg allocations.
 * Multiple leg references are legitimate, but money is consumed ONCE.
 */
export function inspectEpochV3TicketFunding(input:EpochTicketFunding) {
  requireIt(input && input.chainId==="wolo-1" &&
    EPOCH.test(input.epochId) && UID.test(input.ownerUid) &&
    Number.isSafeInteger(input.ticketId) && input.ticketId>0 &&
    input.operationId==="satchel:e3:"+input.epochId+":"+input.ticketId &&
    HASH.test(input.txHash) && input.messageIndex===0 &&
    WHOLE.test(input.totalUwolo), "invalid_original_ticket");
  const principal=BigInt(input.totalUwolo);
  requireIt(principal>BigInt(0) && principal<=MAX_BET &&
    principal%UWOLO===BigInt(0), "ticket_principal_cap");
  requireIt(Array.isArray(input.legs) && input.legs.length>=1 &&
    input.legs.length<=16, "missing_or_unbounded_legs");
  const legSet=new Set<string>();let sum=BigInt(0);
  const items=input.legs.map(l=>{
    requireIt(l && Number.isSafeInteger(l.marketId) && l.marketId>0 &&
      Number.isSafeInteger(l.legId) && l.legId>0 &&
      typeof l.amountUwolo==="string" && WHOLE.test(l.amountUwolo),
      "unowned_or_invalid_leg");
    const key=l.marketId+":"+l.legId;
    requireIt(!legSet.has(key),"duplicated_economic_leg");
    legSet.add(key);
    const value=BigInt(l.amountUwolo);
    requireIt(value>BigInt(0)&&value%UWOLO===BigInt(0),"leg_amount_not_whole_wolo");
    sum+=value;
    return Object.freeze({epochId:input.epochId,ownerUid:input.ownerUid,
      operationId:input.operationId,ticketId:input.ticketId,
      marketId:l.marketId,legId:l.legId,principalUwolo:l.amountUwolo,
      economicKey:"satchel:e3:"+input.epochId+":leg:"+input.ticketId+":"+l.marketId+":"+l.legId});
  });
  requireIt(sum===principal,"legs_do_not_conserve_original_ticket");
  return Object.freeze({
    chainId:"wolo-1" as const,epochId:input.epochId,ownerUid:input.ownerUid,
    ticketId:input.ticketId,operationId:input.operationId,
    onePhysicalFundingReceipt:"wolo-1:"+input.txHash+":0",
    totalFundingUwolo:principal.toString(),
    economicLegs:Object.freeze(items),
    fundingConsumedOnce:true as const,financialCreditAuthorized:false as const,
    nativePhysicalProofAuthenticated:false as const
  });
}
