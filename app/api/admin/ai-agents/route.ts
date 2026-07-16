import { NextRequest, NextResponse } from "next/server";

import { AI_MODEL_OPTIONS } from "@/lib/aiConciergeConfig";
import {
  AI_AGENT_RUNTIME_PERSONAS,
  loadAiAdminSnapshot,
} from "@/lib/aiAgents";
import { requireAdmin } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, max: number, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, max) || fallback : fallback;
}

function slug(value: unknown) {
  return text(value, 64)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(2, parsed));
}

function stringList(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return Array.from(
    new Set(source.map((entry) => text(entry, 80)).filter(Boolean))
  ).slice(0, 30);
}

function runtimePersona(value: unknown) {
  const candidate = text(value, 24, "scribe");
  return AI_AGENT_RUNTIME_PERSONAS.includes(candidate as never) ? candidate : "scribe";
}

function model(value: unknown, fallback = "Agent4.1Scribe") {
  const candidate = text(value, 80, fallback);
  return AI_MODEL_OPTIONS.some((option) => option.id === candidate)
    ? candidate
    : fallback;
}

function mutationData(body: Record<string, unknown>, creating: boolean) {
  const runtimePersonaId = runtimePersona(body.runtimePersonaId);
  const requestedModel = model(
    body.requestedModel,
    runtimePersonaId === "grimer"
      ? "Agent4.1Grimer"
      : runtimePersonaId === "guy"
        ? "Agent4.1Guy"
        : "Agent4.1Scribe"
  );

  return {
    runtimePersonaId,
    name: text(body.name, 100, creating ? "New Council Voice" : "Council Voice"),
    avatarUrl: text(body.avatarUrl, 500) || null,
    enabled: body.enabled === true,
    public: body.public === true,
    description: text(body.description, 500),
    role: text(body.role, 160, "AoE2WAR council voice"),
    specialty: text(body.specialty, 220, "AoE2HD community intelligence"),
    introduction: text(body.introduction, 4_000),
    personalityPrompt: text(body.personalityPrompt, 12_000),
    aoe2Prompt: text(body.aoe2Prompt, 20_000),
    knowledgeScopes: stringList(body.knowledgeScopes),
    allowedTools: stringList(body.allowedTools),
    requestedModel,
    fallbackModel: body.fallbackModel
      ? model(body.fallbackModel, requestedModel)
      : null,
    temperature: optionalNumber(body.temperature),
    maxContextChars: integer(body.maxContextChars, 24_000, 2_000, 100_000),
    timeoutMs: integer(body.timeoutMs, 45_000, 5_000, 120_000),
    maxCouncilTurns: integer(body.maxCouncilTurns, 2, 1, 4),
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  return NextResponse.json(await loadAiAdminSnapshot(gate.prisma));
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const agentSlug = slug(body.slug || body.name);
  if (!agentSlug) {
    return NextResponse.json({ detail: "Agent name and slug are required." }, { status: 400 });
  }

  try {
    const agent = await gate.prisma.aiAgent.create({
      data: {
        slug: agentSlug,
        ...mutationData({ ...body, enabled: body.enabled === true, public: body.public === true }, true),
      },
      select: { id: true, slug: true },
    });
    return NextResponse.json({ ok: true, agent }, { status: 201 });
  } catch (error) {
    console.warn("AI agent create failed:", error);
    return NextResponse.json({ detail: "Could not create that agent. The slug may already exist." }, { status: 409 });
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = integer(body.id, 0, 1, 2_000_000_000);
  if (!id) {
    return NextResponse.json({ detail: "Agent id is required." }, { status: 400 });
  }

  try {
    const agent = await gate.prisma.aiAgent.update({
      where: { id },
      data: mutationData(body, false),
      select: { id: true, slug: true, updatedAt: true },
    });
    return NextResponse.json({ ok: true, agent });
  } catch (error) {
    console.warn("AI agent update failed:", error);
    return NextResponse.json({ detail: "Could not update that agent." }, { status: 400 });
  }
}

