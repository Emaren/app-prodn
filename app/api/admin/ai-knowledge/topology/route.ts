import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { getAiPromptContextManifest } from "@/lib/aiPromptPolicy";
import { resolveClanHallScribeProfile } from "@/lib/clanHallScribeProfiles";
import {
  KINGDOM_KNOWLEDGE_REPOSITORIES,
  PUBLIC_KINGDOM_PAGES,
} from "@/lib/kingdomKnowledgeCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentRow = {
  slug: string;
  runtimePersonaId: string;
  name: string;
  enabled: boolean;
  knowledgeScopes: unknown;
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(String)
    : [];
}

function resolveAgent(
  agents: AgentRow[],
  slug: string,
  runtimePersonaId?: string,
) {
  return (
    agents.find(
      (agent) =>
        agent.slug === slug &&
        agent.enabled,
    ) ??
    (
      runtimePersonaId
        ? agents.find(
            (agent) =>
              agent.runtimePersonaId === runtimePersonaId &&
              agent.enabled,
          )
        : null
    ) ??
    null
  );
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const [agents, clans] = await Promise.all([
    gate.prisma.aiAgent.findMany({
      orderBy: [{ enabled: "desc" }, { id: "asc" }],
      select: {
        slug: true,
        runtimePersonaId: true,
        name: true,
        enabled: true,
        knowledgeScopes: true,
      },
    }),
    gate.prisma.clan.findMany({
      where: { status: "active" },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        slug: true,
        name: true,
        crestUrl: true,
      },
    }),
  ]);

  const repositoryIds =
    KINGDOM_KNOWLEDGE_REPOSITORIES.map(
      (repository) => repository.id,
    );

  const lobbyManifest =
    getAiPromptContextManifest("lobby_public");
  const hallManifest =
    getAiPromptContextManifest("clan_hall");

  const lobbyProfiles = [
    {
      key: "lobby-scribe",
      kind: "public_lobby",
      displayName: "The AI Scribe",
      mention: null,
      source: "lobby_public",
      agent: resolveAgent(agents, "scribe", "scribe"),
      hall: null,
      contextManifest: lobbyManifest,
    },
    {
      key: "lobby-grimer",
      kind: "public_lobby",
      displayName: "Grimer",
      mention: null,
      source: "lobby_public",
      agent: resolveAgent(agents, "grimer", "grimer"),
      hall: null,
      contextManifest: lobbyManifest,
    },
  ] as const;

  const hallProfiles = clans.map((clan) => {
    const profile =
      resolveClanHallScribeProfile(
        clan.slug,
        clan.name,
      );
    const exact = resolveAgent(
      agents,
      profile.agentSlug,
    );
    const inherited =
      exact ??
      (
        profile.fallbackAgentSlug
          ? resolveAgent(
              agents,
              profile.fallbackAgentSlug,
            )
          : null
      );

    return {
      key: `hall-${clan.slug}`,
      kind: "clan_hall",
      displayName: profile.displayName,
      mention: profile.mention,
      source: "clan_hall",
      agent: inherited,
      configurationMode:
        exact
          ? "dedicated"
          : inherited
            ? "inherits"
            : "missing",
      configuredAgentSlug:
        exact?.slug ??
        inherited?.slug ??
        profile.agentSlug,
      hall: {
        slug: clan.slug,
        name: clan.name,
        crestUrl: clan.crestUrl,
      },
      contextManifest: hallManifest,
    };
  });

  const accessProfiles = [
    ...lobbyProfiles.map((profile) => ({
      ...profile,
      configurationMode:
        profile.agent
          ? "dedicated"
          : "missing",
      configuredAgentSlug:
        profile.agent?.slug ??
        (
          profile.key === "lobby-grimer"
            ? "grimer"
            : "scribe"
        ),
    })),
    ...hallProfiles,
  ].map((profile) => ({
    ...profile,
    routableRepositoryIds: repositoryIds,
    configuredKnowledgeScopes:
      stringList(profile.agent?.knowledgeScopes),
    additiveContext:
      profile.source === "clan_hall" &&
      profile.hall
        ? [
            `${profile.hall.name} active roster`,
            `${profile.hall.name} audience-filtered Hall history`,
          ]
        : [
            "Bounded public Lobby history",
          ],
    excludedContext:
      profile.contextManifest
        .filter((item) => item.mode === "excluded")
        .map((item) => item.label),
  }));

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      routingMode:
        "All listed KKR repositories are eligible. The router selects only the repositories relevant to each question.",
      repositories:
        KINGDOM_KNOWLEDGE_REPOSITORIES.map(
          (repository) => ({
            id: repository.id,
            label: repository.label,
            description: repository.description,
            pagePaths: repository.pagePaths,
            guidance: repository.guidance,
            priority: repository.priority,
          }),
        ),
      publicPages: PUBLIC_KINGDOM_PAGES,
      accessProfiles,
      sourceRules: {
        lobby_public: lobbyManifest,
        clan_hall: hallManifest,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
