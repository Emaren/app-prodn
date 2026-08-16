import "dotenv/config";

import { getPrisma } from "@/lib/prisma";

const FOUNDING_CLANS = [
  {
    slug: "mystikal",
    name: "Mystikal Clan",
    tagline:
      "The old Deathmatch band enters the clan hall.",
    description:
      "A home for the Mystikal players, their allies, their rivals, and the AoE2 HD stories that keep the band together.",
    crestUrl: "/clans/mystikal-crest.webp",
    ownerNames: [],
  },
  {
    slug: "jims-clan",
    name: "Jim's Clan",
    tagline:
      "The American Champion raises his banner.",
    description:
      "A hard American warhouse for Jim, his allies, and every player willing to carry the fight.",
    crestUrl: null,
    ownerNames: ["Jim"],
  },
  {
    slug: "legend-clan",
    name: "Legend Clan",
    tagline:
      "The Sultan's house gathers beneath an opulent banner.",
    description:
      "A palace-hall for LeGenD_Sultan and the warriors who fight beneath the Legend banner.",
    crestUrl: null,
    ownerNames: [
      "LeGenD_Sultan",
      "Legend_Sultan",
      "Legend Sultan",
    ],
  },
] as const;

async function findUser(
  prisma: ReturnType<typeof getPrisma>,
  names: readonly string[],
) {
  if (names.length === 0) return null;

  return prisma.user.findFirst({
    where: {
      OR: names.flatMap((name) => [
        {
          inGameName: {
            equals: name,
            mode: "insensitive" as const,
          },
        },
        {
          steamPersonaName: {
            equals: name,
            mode: "insensitive" as const,
          },
        },
      ]),
    },
    orderBy: {
      id: "asc",
    },
  });
}

async function main() {
  const prisma = getPrisma();
  const results = [];

  for (const definition of FOUNDING_CLANS) {
    const existing = await prisma.clan.findUnique({
      where: {
        slug: definition.slug,
      },
    });

    const clan = existing
      ? await prisma.clan.update({
          where: {
            id: existing.id,
          },
          data: {
            name: definition.name,
            tagline: definition.tagline,
            description: definition.description,
            status: "active",
            crestUrl:
              existing.crestUrl ??
              definition.crestUrl,
          },
        })
      : await prisma.clan.create({
          data: {
            slug: definition.slug,
            name: definition.name,
            tagline: definition.tagline,
            description: definition.description,
            crestUrl: definition.crestUrl,
            status: "active",
            chatAudiencePolicy: "public",
          },
        });

    const owner = await findUser(
      prisma,
      definition.ownerNames,
    );

    if (owner) {
      await prisma.clanMember.upsert({
        where: {
          clanId_userId: {
            clanId: clan.id,
            userId: owner.id,
          },
        },
        create: {
          clanId: clan.id,
          userId: owner.id,
          role: "owner",
          status: "active",
        },
        update: {
          role: "owner",
          status: "active",
        },
      });
    }

    results.push({
      clan: {
        id: clan.id,
        slug: clan.slug,
        name: clan.name,
        crestUrl: clan.crestUrl,
      },
      owner: owner
        ? {
            uid: owner.uid,
            name:
              owner.inGameName ||
              owner.steamPersonaName ||
              owner.uid,
          }
        : null,
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        clans: results,
      },
      null,
      2,
    )}\n`,
  );
}

try {
  await main();
} finally {
  await getPrisma().$disconnect();
}
