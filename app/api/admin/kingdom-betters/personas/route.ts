import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
export const runtime="nodejs";export const dynamic="force-dynamic";
const HEADERS={"Cache-Control":"private, no-store"};
const MISSING=[
 {slug:"tony",uid:"aoe2hd_betting_bot_tony",name:"Tony"},
 {slug:"paulie",uid:"aoe2hd_betting_bot_paulie",name:"Paulie"},
 {slug:"tommy",uid:"aoe2hd_betting_bot_tommy",name:"Tommy"},
 {slug:"henry",uid:"aoe2hd_betting_bot_henry",name:"Henry"},
];
export async function POST(request:NextRequest){
 const gate=await requireAdmin(request);
 if("error" in gate)return gate.error;
 const origin=request.headers.get("origin");
 if(!origin||new URL(origin).host!==request.nextUrl.host)return NextResponse.json({detail:"Invalid origin"},{status:403,headers:HEADERS});
 try{
  const result=await gate.prisma.bettingBotConfig.createMany({data:MISSING.map(x=>({
   slug:x.slug,reservedUid:x.uid,displayName:x.name,mode:"disabled",oppositeOnly:true,
   commentaryEnabled:false,defaultCounterstakeWolo:1,maxCounterstakeWolo:10,
   perMarketExposureWolo:10,dailyExposureWolo:50,balanceFloorWolo:100,
   policyId:"opposite-counter",policyVersion:1
  })),skipDuplicates:true});
  return NextResponse.json({ok:true,created:result.count},{headers:HEADERS});
 }catch(error){
  console.warn("Kingdom house persona provision rejected",error);
  return NextResponse.json({detail:"Unable to provision disabled house personas."},{status:503,headers:HEADERS});
 }
}
