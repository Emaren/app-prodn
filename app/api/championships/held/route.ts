import { NextRequest, NextResponse } from "next/server";
import { getSessionUid } from "@/lib/session";
import { getPrisma } from "@/lib/prisma";
import { ChampionshipCustodyError, loadHeldChampionshipStack } from "@/lib/trophies/championship";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return NextResponse.json({ detail: "Sign in to inspect championship eligibility." },{status:401});
  const holderUid = request.nextUrl.searchParams.get("holderUid")?.trim();
  if (!holderUid) return NextResponse.json({ detail:"Choose a warrior." },{status:400});
  const prisma = getPrisma();
  try {
    const [viewer,holder] = await Promise.all([prisma.user.findUnique({where:{uid},select:{id:true}}),prisma.user.findUnique({where:{uid:holderUid},select:{id:true}})]);
    if (!viewer || !holder) return NextResponse.json({detail:"Warrior identity not found."},{status:404});
    return NextResponse.json(await loadHeldChampionshipStack(prisma,holder.id,viewer.id),{headers:{"cache-control":"no-store"}});
  } catch (error) {
    return NextResponse.json({detail:error instanceof ChampionshipCustodyError ? error.message : "Championship custody unavailable.",reasonCode:error instanceof ChampionshipCustodyError ? error.reasonCode : "CUSTODY_UNAVAILABLE"},{status:409});
  }
}
