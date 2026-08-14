import "dotenv/config";

import { execFileSync } from "node:child_process";

import { Prisma } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";

const REQUIRED_BASE =
  "266edd3e58961291ff0537cea91dd8f06d8eba79";

const APPLY_CONFIRMATION =
  "PUBLISH-WORKSHOP-CHRONICLE-2026-08-14";

const OPERATOR_UID =
  "release-workshop-20260814";

const STATUS_UPDATE = {
  headline: "THE FORGE IS HOT",

  description:
    "Replay truth is sharper, releases are safer, and AoE2WAR is substantially faster. The Chronicle tells the story in plain English; open any record when you want the technical receipts.",

  currentProject:
    "Speed · replay truth · safer releases · Aug 9–14",

  updatedByUid:
    OPERATOR_UID,
} as const;

type EntryDefinition = {
  publicId: string;
  entryType: string;
  title: string;
  summary: string;
  body: string;
  lane: string;
  linkLabel: string | null;
  linkUrl: string | null;
  pinned: boolean;
  featuredOrder: number;
  occurredAt: string;
};

const ENTRIES: readonly EntryDefinition[] = [
  {
    publicId:
      "f86ea2c9-5779-5c39-a323-71a5d8120901",

    entryType:
      "deployment",

    title:
      "Replay truth goes realtime — without guessing.",

    summary:
      "Watcher games became easier to recover as they arrive, while incomplete evidence is still allowed to remain unresolved.",

    body:
      "The realtime replay path was hardened around recoverable watcher evidence and explicit result authority. A finished recording no longer has to mean a lost battle record, but it also does not automatically mean the system knows who won. Where replay evidence is strong enough, public match truth can resolve quickly. Where it is not, AoE2WAR keeps the result visibly unresolved instead of turning score, survival, or timing into a guess.",

    lane:
      "fresh_forge",

    linkLabel:
      "Open Live Games",

    linkUrl:
      "/live-games",

    pinned:
      false,

    featuredOrder:
      1900,

    occurredAt:
      "2026-08-09T05:18:35.000Z",
  },

  {
    publicId:
      "7d36c518-a1a2-5ad7-aea5-04efde121001",

    entryType:
      "milestone",

    title:
      "AoE2WAR gets an operating system.",

    summary:
      "Audits, documentation, live run progress, the admin control center, doctor checks, rollback, and one-command finishing turned release work into a governed system.",

    body:
      "August 10 was less about one page and more about how the entire project is operated. The release tools gained read-only estate auditing, automatic documentation refreshes, operator progress guidance, live run telemetry, an admin control center, doctor checks, certified rollback, and the finish lane. The goal is simple: production changes should be explainable before they happen, observable while they happen, and recoverable afterward.",

    lane:
      "legendary",

    linkLabel:
      "Open the Workshop",

    linkUrl:
      "/workshop",

    pinned:
      false,

    featuredOrder:
      2000,

    occurredAt:
      "2026-08-10T19:44:46.000Z",
  },

  {
    publicId:
      "290f79ef-febf-56af-a429-e10a31421101",

    entryType:
      "deployment",

    title:
      "The release lane becomes atomic and observable.",

    summary:
      "Real browser journeys became measurable, while candidate builds became dependency-aware, isolated, and reproducible offline.",

    body:
      "The browser gained an authenticated flight recorder so performance work can be tied to real navigation behavior instead of impressions alone. At the same time, the deployment lane became dependency-aware and atomic. Prisma generation and production builds were hardened for isolated offline execution, memory headroom was raised where justified, and release receipts became stronger proof of exactly what candidate was staged and activated.",

    lane:
      "fresh_forge",

    linkLabel:
      "Open Speed",

    linkUrl:
      "/speed",

    pinned:
      false,

    featuredOrder:
      2100,

    occurredAt:
      "2026-08-11T20:44:42.000Z",
  },

  {
    publicId:
      "8bcabafd-dd8a-5cd2-b987-e69233971201",

    entryType:
      "parser_discovery",

    title:
      "Replay rosters get a deterministic second brain.",

    summary:
      "A new roster forge can reconstruct who actually played while deliberately preserving result truth that is already known.",

    body:
      "Roster V2 began as a deterministic reconstruction pass over public replay evidence. It then gained a fail-closed promotion dry run and a campaign-bound writer. The important rule is that better roster evidence does not get permission to rewrite stronger result evidence. Player identity, roster membership, and winner truth stay separate authorities so one useful reconstruction cannot silently become a broader claim than the evidence supports.",

    lane:
      "fresh_forge",

    linkLabel:
      "Open Game Statistics",

    linkUrl:
      "/game-stats",

    pinned:
      false,

    featuredOrder:
      2200,

    occurredAt:
      "2026-08-12T23:39:54.000Z",
  },

  {
    publicId:
      "4be4dbfd-c6ad-5b0d-aa1a-f19008721301",

    entryType:
      "milestone",

    title:
      "One battle gets one canonical truth.",

    summary:
      "Multiple physical replay records can now resolve into one logical battle view without blending roster, result, and evidence into one guess.",

    body:
      "The replay archive gained a canonical logical-battle layer above individual physical records. Several files or parser observations may describe the same real battle, but the public system can now reason about that battle as one object. Roster truth, result truth, and supporting evidence remain distinct. Release staging was also tightened during the same campaign to reduce duplicated artifacts and disposable build cache while preserving rollback evidence.",

    lane:
      "legendary",

    linkLabel:
      "Explore Game Statistics",

    linkUrl:
      "/game-stats",

    pinned:
      false,

    featuredOrder:
      2300,

    occurredAt:
      "2026-08-13T04:00:41.000Z",
  },

  {
    publicId:
      "b657a75e-5c5c-59d1-96cd-bf7448421401",

    entryType:
      "milestone",

    title:
      "AoE2WAR gets dramatically faster.",

    summary:
      "A controlled 66-route production pass cut median visible loading by about 37%, requests by about 39%, and transferred bytes by about 19% without lowering artwork quality.",

    body:
      "The performance campaign began with a real production baseline: 66 representative public routes and 198 repeated HTTP samples. Median cold first-contentful paint fell from 1.892 seconds to about 1.182 seconds. Median largest-contentful paint fell from 1.980 seconds to about 1.250 seconds. Median requests fell from 64 to 39 and median transfer size fell from roughly 771 KB to 622 KB. The gains came from shared-shell trimming, projection reuse, streaming, earlier list loading, smarter media activation, caching, and lossless image delivery — not cheaper avatars or blurry artwork.",

    lane:
      "legendary",

    linkLabel:
      "Open the Speed Observatory",

    linkUrl:
      "/speed",

    pinned:
      true,

    featuredOrder:
      2400,

    occurredAt:
      "2026-08-14T04:33:39.000Z",
  },

  {
    publicId:
      "fb84822e-29a8-5c49-a41a-59ee19721402",

    entryType:
      "deployment",

    title:
      "The last rough edges get sanded off.",

    summary:
      "Leaderboard scrolling loads much farther ahead, Academy hero art stops black-switching, Traffic catches up again, and Speed waits for useful Statistics content before calling the page ready.",

    body:
      "The final polish focused on things a fast human can actually catch. Modern Leaderboard continuation now requests 150 warriors at a time and starts roughly 8,000 pixels before the bottom. Academy keeps its default hero in the critical lane, warms a saved alternate before switching to it, and streams the hero without waiting for the lower-page Zodiac advisor lookup. Statistics publishes its explicit Speed-ready signal only after real chart data has rendered through a paint cycle. Traffic's public archive was rebuilt through August 14, its recurring maintenance timer was restored, and the public graph correctly ends on August 13 because the still-accumulating current day remains hidden.",

    lane:
      "fresh_forge",

    linkLabel:
      "See the Speed Observatory",

    linkUrl:
      "/speed",

    pinned:
      true,

    featuredOrder:
      2500,

    occurredAt:
      "2026-08-14T13:40:00.000Z",
  },
] as const;

function auditSource() {
  execFileSync(
    "git",
    [
      "merge-base",
      "--is-ancestor",
      REQUIRED_BASE,
      "HEAD",
    ],
    {
      cwd: process.cwd(),
      stdio: "ignore",
    },
  );
}

function desiredEntry(
  definition: EntryDefinition,
) {
  return {
    publicId:
      definition.publicId,

    entryType:
      definition.entryType,

    title:
      definition.title,

    summary:
      definition.summary,

    body:
      definition.body,

    dialogue:
      [] as Prisma.InputJsonValue,

    lane:
      definition.lane,

    status:
      "published",

    visibility:
      "public",

    mediaKind:
      null,

    mediaUrl:
      null,

    mediaAlt:
      null,

    linkLabel:
      definition.linkLabel,

    linkUrl:
      definition.linkUrl,

    pinned:
      definition.pinned,

    featuredOrder:
      definition.featuredOrder,

    occurredAt:
      new Date(definition.occurredAt),

    createdByUid:
      OPERATOR_UID,

    updatedByUid:
      OPERATOR_UID,
  };
}

async function plan() {
  const prisma =
    getPrisma();

  const [status, existing] =
    await Promise.all([
      prisma.workshopStatus.findUnique({
        where: { id: 1 },
        select: {
          headline: true,
          currentProject: true,
        },
      }),

      prisma.workshopEntry.findMany({
        where: {
          publicId: {
            in: ENTRIES.map(
              (entry) => entry.publicId,
            ),
          },
        },
        select: {
          publicId: true,
        },
      }),
    ]);

  if (!status) {
    throw new Error(
      "WorkshopStatus row 1 is missing.",
    );
  }

  const existingIds =
    new Set(
      existing.map(
        (entry) => entry.publicId,
      ),
    );

  return {
    status,
    desiredStatus:
      STATUS_UPDATE,
    entries:
      ENTRIES.map(
        (entry) => ({
          date:
            entry.occurredAt.slice(0, 10),

          title:
            entry.title,

          lane:
            entry.lane,

          action:
            existingIds.has(entry.publicId)
              ? "update"
              : "create",
        }),
      ),
  };
}

async function applyPublication() {
  const prisma =
    getPrisma();

  const publishedAt =
    new Date();

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(207702, 20260814)",
      );

      const status =
        await tx.workshopStatus.findUnique({
          where: { id: 1 },
          select: { id: true },
        });

      if (!status) {
        throw new Error(
          "WorkshopStatus row 1 is missing.",
        );
      }

      let created = 0;
      let updated = 0;

      for (const definition of ENTRIES) {
        const existing =
          await tx.workshopEntry.findUnique({
            where: {
              publicId:
                definition.publicId,
            },
            select: {
              publishedAt: true,
            },
          });

        const desired =
          desiredEntry(definition);

        if (existing) {
          await tx.workshopEntry.update({
            where: {
              publicId:
                definition.publicId,
            },
            data: {
              ...desired,
              publishedAt:
                existing.publishedAt ??
                publishedAt,
            },
          });

          updated += 1;
        } else {
          await tx.workshopEntry.create({
            data: {
              ...desired,
              publishedAt,
            },
          });

          created += 1;
        }
      }

      await tx.workshopStatus.update({
        where: { id: 1 },
        data: STATUS_UPDATE,
      });

      return {
        created,
        updated,
        total: ENTRIES.length,
      };
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel
          .Serializable,

      maxWait:
        10_000,

      timeout:
        60_000,
    },
  );
}

async function verifyPublication() {
  const prisma =
    getPrisma();

  const [status, entries] =
    await Promise.all([
      prisma.workshopStatus.findUnique({
        where: { id: 1 },
        select: {
          headline: true,
          description: true,
          currentProject: true,
        },
      }),

      prisma.workshopEntry.findMany({
        where: {
          publicId: {
            in: ENTRIES.map(
              (entry) => entry.publicId,
            ),
          },
          status: "published",
          visibility: "public",
          publishedAt: {
            not: null,
          },
        },
        select: {
          publicId: true,
          title: true,
          lane: true,
        },
      }),
    ]);

  if (
    !status ||
    status.headline !==
      STATUS_UPDATE.headline ||
    status.description !==
      STATUS_UPDATE.description ||
    status.currentProject !==
      STATUS_UPDATE.currentProject
  ) {
    throw new Error(
      "Workshop status verification failed.",
    );
  }

  if (
    entries.length !==
    ENTRIES.length
  ) {
    throw new Error(
      `Expected ${ENTRIES.length} published entries; found ${entries.length}.`,
    );
  }

  return {
    status,
    publishedEntries:
      entries.length,
  };
}

async function main() {
  const apply =
    process.argv.includes("--apply");

  const confirmIndex =
    process.argv.indexOf("--confirm");

  const confirmation =
    confirmIndex >= 0
      ? process.argv[confirmIndex + 1] ?? null
      : null;

  if (
    apply &&
    confirmation !==
      APPLY_CONFIRMATION
  ) {
    throw new Error(
      `Apply requires --confirm ${APPLY_CONFIRMATION}`,
    );
  }

  auditSource();

  const workshop =
    await plan();

  console.log(
    JSON.stringify(
      {
        mode:
          apply ? "apply" : "plan",
        requiredBase:
          REQUIRED_BASE,
        workshop,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log(
      "PLAN ONLY: no Workshop rows changed.",
    );
    return;
  }

  const applied =
    await applyPublication();

  const verification =
    await verifyPublication();

  console.log(
    JSON.stringify(
      {
        applied,
        verification,
      },
      null,
      2,
    ),
  );

  console.log(
    "PASS: WORKSHOP CHRONICLE THROUGH 2026-08-14 PUBLISHED",
  );
}

try {
  await main();
} finally {
  await getPrisma().$disconnect();
}
