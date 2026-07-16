import { NextRequest, NextResponse } from "next/server";

import { requestAiConciergeReply } from "@/lib/aiConcierge";
import { isRuntimePersonaId, loadAiAgentBySlug } from "@/lib/aiAgents";
import { bountyAdvisorGrounding, loadBountyBoard } from "@/lib/bounties";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const uid = await resolveRequestUid(request, body);
  if (!uid) return NextResponse.json({ detail: "Sign in with Steam to ask the Bounty Scribe." }, { status: 401 });
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1_000) : "";
  if (!message) return NextResponse.json({ detail: "Ask a bounty question first." }, { status: 400 });

  const prisma = getPrisma();
  const recentRequests = await prisma.aiRequestTrace.count({
    where: { viewerUid: uid, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
  });
  if (recentRequests >= 10) {
    return NextResponse.json({ detail: "The Bounty Scribe is catching its breath. Try again in a few minutes." }, { status: 429 });
  }
  const [user, agent, snapshot] = await Promise.all([
    prisma.user.findUnique({ where: { uid }, select: { uid: true, inGameName: true, steamPersonaName: true } }),
    loadAiAgentBySlug(prisma, "scribe", { publicOnly: true, enabledOnly: true }),
    loadBountyBoard(prisma),
  ]);
  if (!user || !agent || !isRuntimePersonaId(agent.runtimePersonaId)) {
    return NextResponse.json({ detail: "The Bounty Scribe is unavailable." }, { status: 503 });
  }

  try {
    const reply = await requestAiConciergeReply({
      prisma,
      viewer: { uid: user.uid, displayName: user.inGameName || user.steamPersonaName || user.uid },
      source: "bounty_page",
      userMessage: message,
      personaId: agent.runtimePersonaId,
      requestedModel: agent.requestedModel,
      agentConfig: agent,
      groundingContext: bountyAdvisorGrounding(snapshot),
      visibility: "public",
    });
    return NextResponse.json({ ok: true, body: reply.body, timing: reply.timing });
  } catch (error) {
    return NextResponse.json({ detail: error instanceof Error ? error.message : "The Bounty Scribe could not answer." }, { status: 502 });
  }
}
