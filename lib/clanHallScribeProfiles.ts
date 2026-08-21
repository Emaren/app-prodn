export type ClanHallScribeProfile = {
  mention: string;
  legacyMentions: readonly string[];
  displayName: string;
  uid: string;
  agentSlug: string;
  fallbackAgentSlug: string | null;
};

function token(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "clan";
}

function profile(args: {
  slug: string;
  mention: string;
  displayName: string;
  legacyMentions?: readonly string[];
  agentSlug?: string;
  fallbackAgentSlug?: string | null;
}): ClanHallScribeProfile {
  const slugToken = token(args.slug);
  return {
    mention: args.mention,
    legacyMentions: args.legacyMentions ?? [],
    displayName: args.displayName,
    uid: `aoe2hd_ai_clan_${slugToken}_hall_scribe`,
    agentSlug: args.agentSlug ?? `${slugToken}-hall-scribe`,
    fallbackAgentSlug:
      args.fallbackAgentSlug === undefined
        ? "aoe2war-hall-scribe"
        : args.fallbackAgentSlug,
  };
}

export function resolveClanHallScribeProfile(
  clanSlug: string,
  clanName: string,
): ClanHallScribeProfile {
  const slug = token(clanSlug);
  const haystack = `${slug} ${clanName.trim().toLowerCase()}`;

  if (slug === "aoe2war") {
    return profile({
      slug,
      mention: "@Scribe",
      legacyMentions: [
        "@Hall Scribe",
        "Hall Scribe",
        "@hall_scribe",
      ],
      displayName: "Hall Scribe",
      agentSlug: "aoe2war-hall-scribe",
      fallbackAgentSlug: null,
    });
  }

  if (slug === "mystikal" || /mysti[kc]al/.test(haystack)) {
    return profile({
      slug,
      mention: "@Mscribe",
      displayName: "Mystikal Scribe",
    });
  }

  if (slug === "jims-clan" || /\bjim(?:'s|s)?\b/.test(haystack)) {
    return profile({
      slug,
      mention: "@Jscribe",
      displayName: "Jim's Scribe",
    });
  }

  if (slug === "legend-clan" || /\blegend\b/.test(haystack)) {
    return profile({
      slug,
      mention: "@Lscribe",
      displayName: "Legend Scribe",
    });
  }

  if (/\bjulio\b|\balvarez\b/.test(haystack)) {
    return profile({
      slug,
      mention: "@JAscribe",
      displayName: "Julio's Scribe",
    });
  }

  return profile({
    slug,
    mention: "@Scribe",
    displayName: `${clanName.trim() || "Clan"} Scribe`,
  });
}

export function clanHallScribeMentionAliases(
  profileValue: ClanHallScribeProfile,
) {
  return [
    profileValue.mention,
    ...profileValue.legacyMentions,
  ];
}
