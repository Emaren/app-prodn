import { NextRequest,NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { commissionerChampionshipAction,loadChampionshipProjectionMap } from "@/lib/championshipChallenges";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
  const gate=await requireAdmin(request);if("error"in gate)return gate.error;
  try {
    const [rows,disputes]=await Promise.all([
      gate.prisma.championshipChallenge.findMany({where:{state:{in:["open","ready","defense_in_progress","default_grace","commissioner_review","disputed"]}},orderBy:{challengeDeadline:"asc"},take:100,select:{scheduledMatchId:true}}),
      gate.prisma.championshipTitleDispute.findMany({where:{status:"open"},orderBy:{createdAt:"desc"},take:100}),
    ]);
    const projections=await loadChampionshipProjectionMap(gate.prisma,rows.map(row=>row.scheduledMatchId),gate.user.id);
    const titles=await gate.prisma.trophy.findMany({where:{id:{in:disputes.map(dispute=>dispute.trophyId)}},select:{id:true,displayName:true,currentBountyWolo:true}});
    const byTitle=new Map(titles.map(title=>[title.id,title]));
    return NextResponse.json({
      challenges:rows.map(row=>({id:row.scheduledMatchId,...projections.get(row.scheduledMatchId)})),
      disputes:disputes.map(dispute=>({...dispute,titleName:byTitle.get(dispute.trophyId)?.displayName||`Title #${dispute.trophyId}`,frozenBountyWolo:byTitle.get(dispute.trophyId)?.currentBountyWolo??null})),
      serverNow:new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({detail:"Championship review is temporarily unavailable. Custody and payment evidence remain unchanged."},{status:503});
  }
}
export async function PATCH(request:NextRequest) {
  const gate=await requireAdmin(request);if("error"in gate)return gate.error;
  try {const input=await request.json();await commissionerChampionshipAction(gate.prisma,gate.user.id,input);return NextResponse.json({ok:true});}
  catch(error){return NextResponse.json({detail:error instanceof Error?error.message:"Commissioner action failed."},{status:error instanceof Error&&"status"in error?Number(error.status):409});}
}
