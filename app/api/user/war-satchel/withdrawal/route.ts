/**
 * Owner-only Keplr-withdrawal reservation. No app wallet private keys,
 * no chain signing in Next.js, and no automatic replay after unknown status.
 * Endpoint is OFF unless a separately certified payout executor is online.
 */
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { readWarSatchelBoundedUtf8 } from "@/lib/warSatchelBoundedBody";
import {
  withdrawalChallengeText, verifySatchelWithdrawalKeplrSignature,
  type SatchelWithdrawalChallengeProof,
} from "@/lib/warSatchelWithdrawalAuthorization";
import {
  readIndependentSatchelBank,reserveOwnerSatchelWithdrawal,
} from "@/lib/warSatchelFundedLedger";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const H={"Cache-Control":"private, no-store"};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function out(status:number,body:Record<string,unknown>){
  return NextResponse.json(body,{status,headers:H});
}
function enabled(){
  return process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED==="true" &&
    process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED==="true" &&
    process.env.WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED==="true" &&
    process.env.WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED==="true" &&
    process.env.WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED==="true" &&
    process.env.WAR_SATCHEL_WITHDRAWAL_EXECUTOR_READY==="true" &&
    process.env.WAR_SATCHEL_WITHDRAWAL_REQUESTS_ENABLED==="true";
}
function origin(request:NextRequest){
  return request.headers.get("origin")==="https://aoe2war.com" &&
    request.headers.get("sec-fetch-site")!=="cross-site";
}
async function parse(request:NextRequest){
  const raw=await readWarSatchelBoundedUtf8(request.body,4096);
  try{
    const value:unknown=JSON.parse(raw??"");
    return value&&typeof value==="object"&&!Array.isArray(value)
      ?value as Record<string,unknown>:null;
  }catch{return null;}
}
async function actor(request:NextRequest){
  const uid=await getSessionUid(request);
  if(!uid)return null;
  const prisma=getPrisma();
  const user=await prisma.user.findUnique({
    where:{uid},select:{id:true,uid:true,walletAddress:true},
  });
  return user?.walletAddress?{prisma,user}:null;
}
function witness(c:{
  id:string;ownerUid:string;walletAddress:string;amountUwolo:bigint;
  issuedAt:Date;expiresAt:Date;consumedAt:Date|null;
}):SatchelWithdrawalChallengeProof{
  return {id:c.id,ownerUid:c.ownerUid,walletAddress:c.walletAddress,
    amountUwolo:c.amountUwolo.toString(),
    issuedAtUtc:c.issuedAt.toISOString(),expiresAtUtc:c.expiresAt.toISOString(),
    consumedAtUtc:c.consumedAt?.toISOString()??null};
}
export async function GET(request:NextRequest){
  if(!enabled())return out(200,{available:false,withdrawalsEnabled:false});
  const active=await actor(request);
  if(!active)return out(401,{detail:"Sign in and link Keplr."});
  const latest=await active.prisma.satchelFundedWithdrawal.findMany({
    where:{ownerUserId:active.user.id},orderBy:{createdAt:"desc"},take:5,
    select:{id:true,amountUwolo:true,status:true,txHash:true,createdAt:true},
  });
  return out(200,{available:true,withdrawalsEnabled:true,
    latest:latest.map(x=>({id:x.id,amountUwolo:x.amountUwolo.toString(),
      status:x.status,txHash:x.txHash,createdAtUtc:x.createdAt.toISOString()}))});
}
export async function POST(request:NextRequest){
  if(!enabled())return out(503,{detail:"Withdrawals are not certified."});
  if(!origin(request))return out(403,{detail:"Cross-site withdrawal denied."});
  const active=await actor(request);
  if(!active)return out(401,{detail:"Sign in and link Keplr."});
  const body=await parse(request);
  if(!body||Object.keys(body).join(",")!=="amountWolo" ||
      typeof body.amountWolo!=="string" ||
      !/^[1-9][0-9]{0,4}$/.test(body.amountWolo) ||
      Number(body.amountWolo)>50000) {
    return out(400,{detail:"Enter a whole-number withdrawal between 1 and 50000 WOLO."});
  }
  const amountUwolo=BigInt(body.amountWolo)*BigInt(1000000);
  try{
    const challenge=await active.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(721009,${active.user.id})`;
      const now=new Date();
      const oneHour=new Date(now.getTime()-60*60*1000);
      const attempts=await tx.satchelWithdrawalChallenge.count({
        where:{ownerUserId:active.user.id,issuedAt:{gte:oneHour}},
      });
      if(attempts>=5)throw Error("Withdrawal signature rate limit");
      const account=await tx.satchelFundedBalance.findUnique({
        where:{ownerUserId:active.user.id},
      });
      if(!account||account.availableUwolo<amountUwolo)throw Error("insufficient Satchel funds");
      return tx.satchelWithdrawalChallenge.create({
        data:{
          id:randomUUID(),ownerUserId:active.user.id,ownerUid:active.user.uid,
          walletAddress:active.user.walletAddress!,amountUwolo,
          issuedAt:now,expiresAt:new Date(now.getTime()+5*60*1000),
        },
      });
    },{maxWait:4000,timeout:7500});
    return out(201,{challengeId:challenge.id,chainId:"wolo-1",
      walletAddress:challenge.walletAddress,
      message:withdrawalChallengeText(witness(challenge)),
      expiresAtUtc:challenge.expiresAt.toISOString(),
      reserved:false,submitted:false});
  }catch{
    return out(409,{detail:"Cannot authorize this withdrawal. Check Satchel balance or daily challenge limit."});
  }
}
export async function PUT(request:NextRequest){
  if(!enabled())return out(503,{detail:"Withdrawals are not certified."});
  if(!origin(request))return out(403,{detail:"Cross-site withdrawal denied."});
  const active=await actor(request);
  if(!active)return out(401,{detail:"Sign in and link Keplr."});
  const body=await parse(request);
  if(!body||Object.keys(body).sort().join(",")!=="challengeId,keplrSignature"||
      typeof body.challengeId!=="string"||!UUID.test(body.challengeId)||
      !body.keplrSignature||typeof body.keplrSignature!=="object"||
      Array.isArray(body.keplrSignature))return out(400,{detail:"Invalid signed withdrawal proof."});
  try{
    const record=await active.prisma.satchelWithdrawalChallenge.findFirst({
      where:{id:body.challengeId,ownerUserId:active.user.id,
        walletAddress:active.user.walletAddress!,consumedAt:null,
        expiresAt:{gt:new Date()}},
    });
    if(!record)return out(409,{detail:"Withdrawal challenge expired or consumed."});
    const signed=verifySatchelWithdrawalKeplrSignature({
      challenge:witness(record),ownerUid:active.user.uid,
      ownerWallet:active.user.walletAddress!,nowMs:Date.now(),
      signature:body.keplrSignature as {
        pub_key:{type:string;value:string};signature:string;
      },
    });
    const bank=await readIndependentSatchelBank();
    const receipt=await reserveOwnerSatchelWithdrawal(active.prisma,{
      ownerUserId:active.user.id,ownerUid:active.user.uid,
      ownerKeplrWallet:active.user.walletAddress!,
      amountUwolo:record.amountUwolo,verifiedWithdrawalSignature:signed,bank,
    });
    return out(201,{authorized:true,reserved:true,
      withdrawalId:receipt.withdrawalId,
      amountUwolo:receipt.amountUwolo,
      status:receipt.state,
      // Never expose a remote signer endpoint or private key.
      paymentConfirmed:false,
    });
  }catch{
    return out(409,{detail:"Keplr signature, owner identity, fresh vault balance or one-use approval failed. No payout broadcast."});
  }
}
