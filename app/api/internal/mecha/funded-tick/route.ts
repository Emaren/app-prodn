/**
 * Private service-to-service Mecha scheduler handoff. No public/user betting
 * submission is exposed. Signed owner mandates, wallet solvency and precise
 * Watcher event evidence are revalidated per game inside DB transactions.
 *
 * This route is NOT active unless separately configured by a protected
 * production systemd runner with a dedicated, root-held authorization token.
 */
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { runCertifiedWatcherFundedTick } from "@/lib/warSatchelFundedWatcherTick";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const H={"Cache-Control":"no-store"};

function authorized(request:NextRequest){
  if(process.env.WAR_SATCHEL_WATCHER_TICK_ENABLED!=="true")return false;
  const secret=process.env.WAR_SATCHEL_WATCHER_TICK_AUTH_TOKEN||"";
  const presented=request.headers.get("authorization")||"";
  if(!/^[A-Za-z0-9_-]{48,256}$/.test(secret) ||
      !presented.startsWith("Bearer ") ||
      presented.length!==secret.length+7)return false;
  const actual=Buffer.from(presented.slice(7),"utf8");
  const expected=Buffer.from(secret,"utf8");
  return actual.length===expected.length && timingSafeEqual(actual,expected);
}
export async function POST(request:NextRequest){
  if(!authorized(request))return NextResponse.json(
    {enabled:false,detail:"Watcher-funded scheduler is unavailable."},
    {status:404,headers:H});
  try{
    const result=await runCertifiedWatcherFundedTick(getPrisma());
    // Aggregate counts only. Never reveal owner identities, wallet hashes,
    // signer credentials or chain settlement internals in timer logs.
    return NextResponse.json({
      executed:true,examined:result.examined,
      claimed:result.claimed,accepted:result.accepted,
      rejectedBeforeBroadcast:result.rejectedBeforeBroadcast,
      unknownHeld:result.unknownHeld,skipped:result.skipped,
    },{status:200,headers:H});
  }catch{
    return NextResponse.json({
      executed:false,detail:"Protected funded tick was refused; no replay authorized.",
    },{status:503,headers:H});
  }
}
