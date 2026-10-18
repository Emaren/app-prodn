import "server-only";
import { getPrisma } from "@/lib/prisma";
import { isInternalSystemUid } from "@/lib/internalSystemAccounts";
import { readBettingBotRuntime } from "@/lib/bettingBots";

export type KingdomBettor = {
  key:string; uid:string|null; name:string; role:"house"|"human"; avatar:string|null; href:string|null;
  mode:string; canExecuteMoney:false; wins:number; losses:number; pending:number;
  totalBets:number; stakedWolo:number; recordedPayoutWolo:number; recordedNetWolo:number|null;
  lastBetAt:string|null; verifiedTxCount:number;
};
export type KingdomBelt = {
  id:string; name:string; holder:string|null; bounty:number; tribute:number;
  daysHeld:number|null; image:string; href:string;
};
export type KingdomBetReceipt = {
  id:number; bettorKey:string; marketId:number; marketTitle:string; side:string;
  stake:number; payout:number|null; outcome:string; recordedAt:string;
  stakeTxHash:string|null; payoutTxHash:string|null; payoutProofStatus:"chain-reference"|"recorded-only";
};
export type KingdomBettorsSnapshot = {
  generatedAt:string; bettors:KingdomBettor[]; belts:KingdomBelt[]; receipts:KingdomBetReceipt[];
  engine:{executorInstalled:false;status:"preview-only";limitWolo:10};
};
const HOUSE = [
  {slug:"tony",name:"Tony"},
  {slug:"paulie",name:"Paulie"},
  {slug:"tommy",name:"Tommy"},
  {slug:"henry",name:"Henry"},
] as const;

function avatar(name:string,configured:string|null=null) {
  if (configured && configured.startsWith("/") && !configured.startsWith("//")) return configured;
  const n=name.trim().toLowerCase();
  if(n==="jim")return "/champions/players/jim.webp";
  if(n==="emaren")return "/champions/players/emaren.webp";
  if(n==="julio" || n==="julio alvarez")return "/champions/players/julio.webp";
  return null;
}
function beltArt(id:string) {
  const lower=id.toLowerCase();
  if(lower.includes("chaos"))return "/champions/belts/chaos.webp";
  if(lower.includes("world"))return "/champions/belts/aoe2war-world.webp";
  if(/(2v2|3v3|4v4|tag)/.test(lower))return "/champions/belts/tag-team.webp";
  if(lower.includes("canada"))return "/champions/belts/canada.webp";
  if(lower.includes("usa")||lower.includes("american"))return "/champions/belts/usa.webp";
  if(lower.includes("uk"))return "/champions/belts/uk.webp";
  if(lower.includes("rising"))return "/champions/belts/elo-rising.webp";
  if(lower.includes("legend"))return "/champions/belts/elo-legend.webp";
  return "/champions/belts/aoe2war-world.webp";
}
function bounded(value:number|null|undefined) {
  return typeof value==="number" && Number.isFinite(value) && value>=0 ? value : 0;
}
function txRef(value:string|null|undefined) {
  return value && /^[a-fA-F0-9]{64}$/.test(value) ? value.toUpperCase() : null;
}
export async function loadKingdomBettors():Promise<KingdomBettorsSnapshot> {
  const db=getPrisma();
  const [users,bots,grouped,recent,belts]=await Promise.all([
    db.user.findMany({select:{id:true,uid:true,inGameName:true,steamPersonaName:true,createdAt:true},take:500,orderBy:{id:"asc"}}),
    db.bettingBotConfig.findMany({select:{
      id:true,slug:true,displayName:true,avatarUrl:true,mode:true,defaultCounterstakeWolo:true,
      maxCounterstakeWolo:true,balanceFloorWolo:true,
    },orderBy:{id:"asc"}}),
    db.betWager.groupBy({by:["userId","status"],_count:{_all:true},_sum:{amountWolo:true,payoutWolo:true}}),
    db.betWager.findMany({take:160,orderBy:[{createdAt:"desc"},{id:"desc"}],
      select:{id:true,userId:true,marketId:true,side:true,amountWolo:true,payoutWolo:true,status:true,createdAt:true,
        stakeTxHash:true,payoutTxHash:true,market:{select:{title:true}}}}),
    db.trophy.findMany({where:{kind:{not:"designation"}},select:{
      trophyId:true,displayName:true,status:true,currentHolderDisplayName:true,currentBountyWolo:true,
      tributeAmountWolo:true,holderSince:true},take:90,orderBy:[{updatedAt:"desc"},{id:"desc"}]}),
  ]);
  const perUser=new Map<number,Pick<KingdomBettor,"wins"|"losses"|"pending"|"totalBets"|"stakedWolo"|"recordedPayoutWolo">>();
  for(const group of grouped){
    const prior=perUser.get(group.userId)??{wins:0,losses:0,pending:0,totalBets:0,stakedWolo:0,recordedPayoutWolo:0};
    const n=group._count._all;
    prior.totalBets+=n;
    if(group.status==="won")prior.wins+=n;
    else if(group.status==="lost")prior.losses+=n;
    else if(!["void","refunded"].includes(group.status))prior.pending+=n;
    prior.stakedWolo+=bounded(group._sum.amountWolo);
    prior.recordedPayoutWolo+=bounded(group._sum.payoutWolo);
    perUser.set(group.userId,prior);
  }
  const keyById=new Map<number,string>();
  const human:KingdomBettor[]=users.filter(user=>!isInternalSystemUid(user.uid)).map(user=>{
    const key="human:"+user.uid;
    keyById.set(user.id,key);
    const stat=perUser.get(user.id)??{wins:0,losses:0,pending:0,totalBets:0,stakedWolo:0,recordedPayoutWolo:0};
    const name=user.inGameName||user.steamPersonaName||"Warrior";
    const ownerReceipts=recent.filter(row=>row.userId===user.id);
    const decided=stat.wins+stat.losses>0;
    return {...stat,key,uid:user.uid,name,role:"human",avatar:avatar(name),href:"/players",
      mode:"human",canExecuteMoney:false,
      recordedNetWolo:decided?stat.recordedPayoutWolo-stat.stakedWolo:null,
      verifiedTxCount:ownerReceipts.filter(r=>txRef(r.payoutTxHash)).length,
      lastBetAt:ownerReceipts[0]?.createdAt.toISOString()??null
    };
  });
  human.sort((a,b)=>b.totalBets-a.totalBets || a.name.localeCompare(b.name));
  const house:KingdomBettor[]=HOUSE.map(identity=>{
    const bot=bots.find(b=>b.slug===identity.slug);
    const runtime=bot?readBettingBotRuntime({
      mode:bot.mode==="shadow"||bot.mode==="live"?bot.mode:"disabled",
      maxCounterstakeWolo:bot.maxCounterstakeWolo,balanceFloorWolo:bot.balanceFloorWolo,
    }):null;
    return {key:"house:"+identity.slug,uid:null,name:bot?.displayName??identity.name,role:"house",
      avatar:avatar(identity.name,bot?.avatarUrl??null),href:null,
      mode:bot?runtime?.effectiveMode??"disabled":"unconfigured",
      canExecuteMoney:false,wins:0,losses:0,pending:0,totalBets:0,stakedWolo:0,
      recordedPayoutWolo:0,recordedNetWolo:null,lastBetAt:null,verifiedTxCount:0};
  });
  const receipts:KingdomBetReceipt[]=recent.filter(r=>keyById.has(r.userId)).map(r=>({
    id:r.id,bettorKey:keyById.get(r.userId)!,marketId:r.marketId,marketTitle:r.market.title,side:r.side,
    stake:r.amountWolo,payout:r.payoutWolo,outcome:r.status,recordedAt:r.createdAt.toISOString(),
    stakeTxHash:txRef(r.stakeTxHash),payoutTxHash:txRef(r.payoutTxHash),
    payoutProofStatus:txRef(r.payoutTxHash)?"chain-reference":"recorded-only",
  }));
  const now=Date.now();
  return {generatedAt:new Date(now).toISOString(),bettors:[...house,...human],receipts,
    belts:belts.map(row=>({
      id:row.trophyId,name:row.displayName,holder:row.currentHolderDisplayName,
      bounty:bounded(row.currentBountyWolo),tribute:bounded(row.tributeAmountWolo),
      daysHeld:row.holderSince?Math.max(0,Math.floor((now-row.holderSince.getTime())/86_400_000)):null,
      image:beltArt(row.trophyId),href:"/champions",
    })),
    engine:{executorInstalled:false,status:"preview-only",limitWolo:10}};
}
