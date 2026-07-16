import { NextRequest, NextResponse } from "next/server";

import { requestAiConciergeReply } from "@/lib/aiConcierge";
import {
  isRuntimePersonaId,
  loadAiAgentBySlug,
  type AiAgentRuntimeConfig,
} from "@/lib/aiAgents";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanMessage(value: unknown, max = 1_200) {
  return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, max) : "";
}

function cleanSlugs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => cleanMessage(entry, 64).toLowerCase())
        .filter((entry) => /^[a-z0-9-]+$/.test(entry))
    )
  ).slice(0, 2);
}

function publicAgentSummary(agent: AiAgentRuntimeConfig) {
  return {
    slug: agent.slug,
    name: agent.name,
    role: agent.role,
    specialty: agent.specialty,
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const uid = await resolveRequestUid(request, body);
  if (!uid) {
    return NextResponse.json({ detail: "Sign in with Steam to convene the Council." }, { status: 401 });
  }
  const question = cleanMessage(body.message);
  const mode = body.mode === "convene" ? "convene" : "ask";
  const requestedSlugs = cleanSlugs(body.agentSlugs);
  if (!question) {
    return NextResponse.json({ detail: "Give the Council a real AoE2HD question." }, { status: 400 });
  }
  if (requestedSlugs.length < (mode === "convene" ? 2 : 1)) {
    return NextResponse.json({ detail: mode === "convene" ? "Choose two Council voices." : "Choose a Council voice." }, { status: 400 });
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: { uid: true, inGameName: true, steamPersonaName: true },
  });
  if (!user) {
    return NextResponse.json({ detail: "User not found." }, { status: 404 });
  }

  const recentRequests = await prisma.aiRequestTrace.count({
    where: {
      viewerUid: uid,
      createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
  });
  if (recentRequests >= 10) {
    return NextResponse.json({ detail: "The Council is catching its breath. Try again in a few minutes." }, { status: 429 });
  }

  const agents = (
    await Promise.all(
      requestedSlugs.map((agentSlug) =>
        loadAiAgentBySlug(prisma, agentSlug, { publicOnly: true, enabledOnly: true })
      )
    )
  ).filter((agent): agent is AiAgentRuntimeConfig => Boolean(agent));
  if (agents.length < requestedSlugs.length) {
    return NextResponse.json({ detail: "One of those Council voices is unavailable." }, { status: 404 });
  }

  const requestedTurns = Number(body.turns);
  const maxTurns = Math.min(
    mode === "convene" ? 2 : 1,
    ...agents.map((agent) => agent.maxCouncilTurns),
    Number.isFinite(requestedTurns) ? Math.max(1, Math.round(requestedTurns)) : 2
  );
  const transcript: Array<{
    agent: ReturnType<typeof publicAgentSummary>;
    body: string;
    timing: { contextMs: number; modelMs: number; totalMs: number; firstTokenMs: null };
  }> = [];

  try {
    for (let round = 0; round < maxTurns; round += 1) {
      const roundAgents = mode === "ask" ? agents.slice(0, 1) : agents;
      for (const agent of roundAgents) {
        if (!isRuntimePersonaId(agent.runtimePersonaId)) continue;
        const prior = transcript.length
          ? transcript.map((turn) => `${turn.agent.name}: ${turn.body}`).join("\n")
          : "No prior Council turns.";
        const reply = await requestAiConciergeReply({
          prisma,
          viewer: {
            uid: user.uid,
            displayName: user.inGameName || user.steamPersonaName || user.uid,
          },
          source: "council",
          userMessage: question,
          personaId: agent.runtimePersonaId,
          requestedModel: agent.requestedModel,
          agentConfig: agent,
          visibility: "public",
          groundingContext: [
            `Council mode: ${mode}.`,
            `Round: ${round + 1} of ${maxTurns}.`,
            "Address the user's question directly. Respond to prior Council turns only when useful.",
            `Prior Council turns:\n${prior}`,
          ].join("\n"),
        });
        transcript.push({
          agent: publicAgentSummary(agent),
          body: reply.body,
          timing: reply.timing,
        });
      }
    }
    return NextResponse.json({ ok: true, mode, maxTurns, transcript });
  } catch (error) {
    console.warn("Council request failed:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "The Council could not answer." },
      { status: 502 }
    );
  }
}

