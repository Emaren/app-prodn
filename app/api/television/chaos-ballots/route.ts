import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { assessTelevisionChaosBallotGame } from "@/lib/televisionChaosBallot";
import { readBoundedStreamChunkBody } from "@/lib/streamUploadProtocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = {"Cache-Control":"no-store, max-age=0"};
const BAD_ID = {detail:"A finalized game ID is required."};

function gameIdFrom(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" &&
    /^(0|[1-9]\d*)$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(value) && value>0 ? value : null;
}

async function ballotContext(prisma: ReturnType<typeof getPrisma>, gameId:number) {
  const game=await prisma.gameStats.findUnique({
    where:{id:gameId},
    select:{id:true,is_final:true,replayHash:true,parse_source:true,players:true,
      createdAt:true,played_on:true},
  });
  if (!game) return null;
  return {game,eligibility:assessTelevisionChaosBallotGame(game)};
}

export async function GET(request:NextRequest) {
  const gameId=gameIdFrom(request.nextUrl.searchParams.get("gameId"));
  if (!gameId) return NextResponse.json(BAD_ID,{status:400,headers:NO_STORE});
  const prisma=getPrisma();
  const context=await ballotContext(prisma,gameId);
  if (!context) return NextResponse.json({detail:"Game not found."},{status:404,headers:NO_STORE});
  const {eligibility}=context;
  const uid=await getSessionUid(request);
  const user=uid?await prisma.user.findUnique({where:{uid},select:{id:true}}):null;
  const [votes,myVote]=eligibility.rosterHash ? await Promise.all([
    prisma.televisionChaosBallot.groupBy({
      by:["nomineeKey"],where:{gameStatsId:gameId,rosterHash:eligibility.rosterHash},
      _count:{_all:true},
    }),
    user?prisma.televisionChaosBallot.findUnique({
      where:{gameStatsId_userId:{gameStatsId:gameId,userId:user.id}},
      select:{nomineeKey:true,rosterHash:true},
    }):Promise.resolve(null),
  ]) : [[],null];
  const tally=new Map(votes.map(row=>[row.nomineeKey,row._count._all]));
  return NextResponse.json({
    gameId,
    eligible:eligibility.eligible,reason:eligibility.reason,closesAt:eligibility.closesAt,
    signedIn:Boolean(user),myVote:myVote?.rosterHash===eligibility.rosterHash?myVote.nomineeKey:null,
    candidates:eligibility.candidates.map(candidate=>({
      ...candidate,votes:tally.get(candidate.key)??0,
    })),
    voteCount:votes.reduce((sum,row)=>sum+row._count._all,0),
    nonBinding:true,
    note:"Popularity only; votes cannot award or transfer the Chaos Championship.",
  },{headers:NO_STORE});
}

export async function POST(request:NextRequest) {
  if (request.headers.get("origin")!==request.nextUrl.origin)
    return NextResponse.json({detail:"Same-origin ballot action required."},{status:403,headers:NO_STORE});
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return NextResponse.json({detail:"JSON ballot required."},{status:415,headers:NO_STORE});
  const uid=await getSessionUid(request);
  if (!uid) return NextResponse.json({detail:"Sign in to vote."},{status:401,headers:NO_STORE});
  const prisma=getPrisma();
  const user=await prisma.user.findUnique({where:{uid},select:{id:true}});
  if (!user) return NextResponse.json({detail:"Account not found."},{status:401,headers:NO_STORE});
  let body:Record<string,unknown>;
  try {
    const raw=await readBoundedStreamChunkBody(request.body,2048);
    const parsed=JSON.parse(new TextDecoder().decode(raw)) as unknown;
    if (!parsed || typeof parsed!=="object" || Array.isArray(parsed)) throw Error("invalid");
    body=parsed as Record<string,unknown>;
  } catch {
    return NextResponse.json({detail:"Invalid or oversized ballot."},{status:400,headers:NO_STORE});
  }
  const gameId=gameIdFrom(body.gameId);
  const nomineeKey=typeof body.nomineeKey==="string" ? body.nomineeKey : "";
  if (!gameId || nomineeKey.length>128 || nomineeKey.length===0)
    return NextResponse.json({detail:"Invalid ballot choice."},{status:400,headers:NO_STORE});
  const context=await ballotContext(prisma,gameId);
  if (!context) return NextResponse.json({detail:"Game not found."},{status:404,headers:NO_STORE});
  const {eligibility}=context;
  if (!eligibility.eligible || !eligibility.rosterHash)
    return NextResponse.json({detail:"This battle is not accepting Chaos votes.",reason:eligibility.reason},
      {status:409,headers:NO_STORE});
  if (!eligibility.candidates.some(candidate=>candidate.key===nomineeKey))
    return NextResponse.json({detail:"Nominee is not in the verified game roster."},
      {status:400,headers:NO_STORE});
  const key={gameStatsId_userId:{gameStatsId:gameId,userId:user.id}};
  const existing=await prisma.televisionChaosBallot.findUnique({
    where:key,select:{nomineeKey:true,rosterHash:true},
  });
  if (existing) {
    if (existing.nomineeKey===nomineeKey && existing.rosterHash===eligibility.rosterHash)
      return NextResponse.json({recorded:true,alreadyRecorded:true,nonBinding:true},{headers:NO_STORE});
    return NextResponse.json({detail:"Your Chaos ballot is already recorded for this game."},
      {status:409,headers:NO_STORE});
  }
  try {
    await prisma.televisionChaosBallot.create({
      data:{gameStatsId:gameId,userId:user.id,nomineeKey,rosterHash:eligibility.rosterHash},
    });
  } catch (error) {
    if (error && typeof error==="object" && "code" in error && error.code==="P2002")
      return NextResponse.json({detail:"Your Chaos ballot was already recorded."},
        {status:409,headers:NO_STORE});
    throw error;
  }
  return NextResponse.json({recorded:true,alreadyRecorded:false,nonBinding:true},{status:201,headers:NO_STORE});
}
