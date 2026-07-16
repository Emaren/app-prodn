import type { AiAgent, AiRequestTrace, PrismaClient } from "@/lib/generated/prisma";
import type { AiPersonaId } from "@/lib/aiConciergeConfig";

export const AI_AGENT_RUNTIME_PERSONAS = ["scribe", "grimer", "guy"] as const;

export type AiAgentRuntimeConfig = Pick<
  AiAgent,
  | "id"
  | "slug"
  | "runtimePersonaId"
  | "name"
  | "avatarUrl"
  | "enabled"
  | "public"
  | "description"
  | "role"
  | "specialty"
  | "introduction"
  | "personalityPrompt"
  | "aoe2Prompt"
  | "knowledgeScopes"
  | "allowedTools"
  | "requestedModel"
  | "fallbackModel"
  | "temperature"
  | "maxContextChars"
  | "timeoutMs"
  | "maxCouncilTurns"
>;

const AGENT_SELECT = {
  id: true,
  slug: true,
  runtimePersonaId: true,
  name: true,
  avatarUrl: true,
  enabled: true,
  public: true,
  description: true,
  role: true,
  specialty: true,
  introduction: true,
  personalityPrompt: true,
  aoe2Prompt: true,
  knowledgeScopes: true,
  allowedTools: true,
  requestedModel: true,
  fallbackModel: true,
  temperature: true,
  maxContextChars: true,
  timeoutMs: true,
  maxCouncilTurns: true,
} as const;

function numericPercentile(values: number[], percentile: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentile) - 1)
  );
  return sorted[index] ?? null;
}

function traceMetrics(traces: Pick<AiRequestTrace, "status" | "totalMs" | "modelMs" | "firstTokenMs">[]) {
  const total = traces.length;
  const succeeded = traces.filter((trace) => trace.status === "succeeded").length;
  const durations = traces.map((trace) => trace.totalMs).filter(Number.isFinite);
  const modelDurations = traces.flatMap((trace) =>
    typeof trace.modelMs === "number" ? [trace.modelMs] : []
  );
  const firstTokens = traces.flatMap((trace) =>
    typeof trace.firstTokenMs === "number" ? [trace.firstTokenMs] : []
  );

  return {
    requests: total,
    succeeded,
    failed: total - succeeded,
    successRateBps: total ? Math.round((succeeded / total) * 10_000) : null,
    medianMs: numericPercentile(durations, 0.5),
    p95Ms: numericPercentile(durations, 0.95),
    medianModelMs: numericPercentile(modelDurations, 0.5),
    medianFirstTokenMs: numericPercentile(firstTokens, 0.5),
  };
}

export async function loadRuntimeAiAgent(
  prisma: PrismaClient,
  personaId: AiPersonaId
): Promise<AiAgentRuntimeConfig | null> {
  const exact = await prisma.aiAgent.findUnique({
    where: { slug: personaId },
    select: AGENT_SELECT,
  });
  if (exact?.enabled) return exact;

  return prisma.aiAgent.findFirst({
    where: {
      runtimePersonaId: personaId,
      enabled: true,
    },
    orderBy: { id: "asc" },
    select: AGENT_SELECT,
  });
}

export async function loadAiAgentBySlug(
  prisma: PrismaClient,
  slug: string,
  options: { publicOnly?: boolean; enabledOnly?: boolean } = {}
): Promise<AiAgentRuntimeConfig | null> {
  return prisma.aiAgent.findFirst({
    where: {
      slug,
      ...(options.publicOnly ? { public: true } : {}),
      ...(options.enabledOnly ? { enabled: true } : {}),
    },
    select: AGENT_SELECT,
  });
}

export async function loadPublicAiCouncil(prisma: PrismaClient) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const agents = await prisma.aiAgent.findMany({
    where: { enabled: true, public: true },
    orderBy: [{ id: "asc" }],
    select: {
      ...AGENT_SELECT,
      traces: {
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          status: true,
          totalMs: true,
          modelMs: true,
          firstTokenMs: true,
        },
      },
    },
  });

  return agents.map(({ traces, ...agent }) => ({
    ...agent,
    telemetry: traceMetrics(traces),
  }));
}

export async function loadAiAdminSnapshot(prisma: PrismaClient) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const agents = await prisma.aiAgent.findMany({
    orderBy: [{ enabled: "desc" }, { public: "desc" }, { id: "asc" }],
    select: {
      ...AGENT_SELECT,
      createdAt: true,
      updatedAt: true,
      traces: {
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: {
          status: true,
          totalMs: true,
          modelMs: true,
          firstTokenMs: true,
        },
      },
    },
  });
  const recentErrors = await prisma.aiRequestTrace.findMany({
    where: { status: { not: "succeeded" } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true,
      agentSlugSnapshot: true,
      source: true,
      status: true,
      requestedModel: true,
      totalMs: true,
      errorCode: true,
      createdAt: true,
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    agents: agents.map(({ traces, createdAt, updatedAt, ...agent }) => ({
      ...agent,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      telemetry: traceMetrics(traces),
    })),
    recentErrors: recentErrors.map((trace) => ({
      ...trace,
      createdAt: trace.createdAt.toISOString(),
    })),
  };
}

export function isRuntimePersonaId(value: unknown): value is AiPersonaId {
  return AI_AGENT_RUNTIME_PERSONAS.includes(value as AiPersonaId);
}
