import "dotenv/config";

import { execFileSync } from "node:child_process";

import { Prisma } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";

const REQUIRED_RELEASES = [
  "e55e943d038c1c62e6d6e40e507b4e0b115b604e",
  "07a0c8c87d19d77ba45ea68a3050ddcff884a8ea",
  "97db284b69a0f973e9a6a6408a5dcb52703362c4",
  "875ba6448b5763be02a4da8b548bff3a556cb821",
  "b44176ef680441ff7ef40d8dc587b0d091d838bf",
  "1396062b50d6a7b0a3418d42f0e0f6aa612d1b06",
] as const;

const APPLY_CONFIRMATION =
  "PUBLISH-WORKSHOP-TRUTH-IN-PRODUCTION-2026-08-08";

const OPERATOR_UID =
  "release-workshop-20260808";

const STATUS_UPDATE = {
  headline:
    "TRUTH IN PRODUCTION",

  description:
    "Replay results, Watcher evidence, traffic, and statistics now follow explicit truth sources from captured evidence through public projection, while financial authority remains separately gated.",

  currentProject:
    "Replay truth · Watcher observability · Production proof",

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
      "3f25409a-3628-5692-a86a-391730eaa9a5",

    entryType:
      "parser_discovery",

    title:
      "Visible victory becomes admissible evidence.",

    summary:
      "AoE2HD postgame victory emblems can resolve a result when the winner cue is explicit; score, survival, chat, and action-tail ordering remain non-authority.",

    body:
      "The screenshot evidence parser learned the explicit HD victory/result emblem and raised that cue above score or statistical inference. TACHI vs Emaren was recovered from the visible winner emblem rather than Total Score. The canonical-duel fallback permits that explicit winner to map onto exactly two canonical singleton players only when stable-key mapping is exact and high-confidence. The resulting replay adjudication may improve public and statistical truth without mutating raw parser evidence or creating financial authority.",

    lane:
      "fresh_forge",

    linkLabel:
      "Open TACHI result",

    linkUrl:
      "/game-stats/21811",

    pinned:
      true,

    featuredOrder:
      1600,

    occurredAt:
      "2026-08-08T02:15:06.000Z",
  },

  {
    publicId:
      "2d0dd9cc-2385-52de-90f9-61cc86fd183a",

    entryType:
      "milestone",

    title:
      "Fast exits gain a narrow stats-only recovery rail.",

    summary:
      "Authenticated recorder-exit v1 can provisionally recover a modern unresolved rated 1v1 without pretending the replay exposed a player-specific leave packet.",

    body:
      "replay-terminal-recorder-exit-v1 handles the narrow case where an authenticated Watcher records a final rated 1v1, the result remains unresolved, serialized winner/resignation/postgame evidence is absent, and recorder identity exactly matches one canonical player. The recorder becomes a provisional statistical loser and the opponent a provisional statistical winner. #22128 therefore projects kaoritec over Emaren through adjudication #67. replayPacketLeaveProof remains false, provisionalStatsInference remains true, affectsStats is true, affectsBets is false, and financialAuthority remains false. Watcher 1.5.7 completion receipts may omit finalStored; omission is neutral while explicit false or identity/hash/session conflicts still block the policy. The old 1v1 action-tail authority remains disabled.",

    lane:
      "fresh_forge",

    linkLabel:
      "Open kaoritec result",

    linkUrl:
      "/game-stats/22128",

    pinned:
      true,

    featuredOrder:
      1500,

    occurredAt:
      "2026-08-08T04:38:36.651Z",
  },

  {
    publicId:
      "afc7a71e-a834-593c-81a9-3209ea0ac541",

    entryType:
      "deployment",

    title:
      "Traffic stops graphing unfinished days.",

    summary:
      "Public Traffic now ends on the last completed UTC day instead of drawing a misleading plunge from the still-accumulating current day.",

    body:
      "Release b44176ef680441ff7ef40d8dc587b0d091d838bf filters the current UTC date before public chart projection. Historical completed days remain unchanged. During the August 8 production proof, the newest visible Traffic point was August 7 and the current-day row count was zero. This changes presentation truth only; the underlying telemetry remains intact.",

    lane:
      "fresh_forge",

    linkLabel:
      "Open Traffic",

    linkUrl:
      "/traffic",

    pinned:
      true,

    featuredOrder:
      1400,

    occurredAt:
      "2026-08-08T04:52:26.000Z",
  },

  {
    publicId:
      "49f2d558-5a8d-5193-8664-5fca5fbb4329",

    entryType:
      "deployment",

    title:
      "Statistics is rewired to Watcher truth.",

    summary:
      "Games Streamed now means unique watcher_live sessions, Players Streamed comes from those same sessions, and Watcher Games counts distinct watcher_final replays including Batch Upload.",

    body:
      "Release 1396062b50d6a7b0a3418d42f0e0f6aa612d1b06 removes the separate video-stream subsystem from these game metrics. watcher_live parser iterations collapse to one stable game identity using platform match ID or replay identity; the first-seen UTC day owns a session crossing midnight and the richest iteration supplies player seats. Watcher Games intentionally counts distinct watcher_final replay hashes on the day AoE2WAR receives them, so Batch Upload remains visible. Production proof for August 7 is 13 Games Streamed, 48 Players Streamed, and 13 Watcher Games. The July 7 and July 8 Batch Upload mountains remain 812 and 1,172 distinct Watcher Games. Statistics also omits the incomplete current UTC day.",

    lane:
      "fresh_forge",

    linkLabel:
      "Open Statistics",

    linkUrl:
      "/statistics",

    pinned:
      true,

    featuredOrder:
      1300,

    occurredAt:
      "2026-08-08T05:23:42.000Z",
  },
] as const;

function readArgument(name: string) {
  const direct =
    process.argv.find(
      (value) =>
        value.startsWith(
          `${name}=`,
        ),
    );

  if (direct) {
    return direct.slice(
      name.length + 1,
    );
  }

  const index =
    process.argv.indexOf(
      name,
    );

  return index >= 0
    ? process.argv[index + 1] ?? null
    : null;
}

function auditSource() {
  for (const release of REQUIRED_RELEASES) {
    execFileSync(
      "git",
      [
        "merge-base",
        "--is-ancestor",
        release,
        "HEAD",
      ],
      {
        cwd:
          process.cwd(),

        stdio:
          "ignore",
      },
    );
  }
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
      new Date(
        definition.occurredAt,
      ),

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
      prisma.workshopStatus.findUnique(
        {
          where:
            {
              id: 1,
            },

          select:
            {
              headline:
                true,

              description:
                true,

              currentProject:
                true,

              updatedByUid:
                true,
            },
        },
      ),

      prisma.workshopEntry.findMany(
        {
          where:
            {
              publicId:
                {
                  in:
                    ENTRIES.map(
                      (entry) =>
                        entry.publicId,
                    ),
                },
            },

          select:
            {
              publicId:
                true,
            },
        },
      ),
    ]);

  if (!status) {
    throw new Error(
      "WorkshopStatus row 1 is missing.",
    );
  }

  const existingIds =
    new Set(
      existing.map(
        (entry) =>
          entry.publicId,
      ),
    );

  return {
    statusAction:
      status.headline ===
        STATUS_UPDATE.headline &&
      status.description ===
        STATUS_UPDATE.description &&
      status.currentProject ===
        STATUS_UPDATE.currentProject &&
      status.updatedByUid ===
        STATUS_UPDATE.updatedByUid
        ? "unchanged"
        : "update",

    entries:
      ENTRIES.map(
        (entry) => ({
          publicId:
            entry.publicId,

          title:
            entry.title,

          action:
            existingIds.has(
              entry.publicId,
            )
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
        "SELECT pg_advisory_xact_lock(207702, 20260808)",
      );

      const status =
        await tx.workshopStatus.findUnique(
          {
            where:
              {
                id:
                  1,
              },

            select:
              {
                id:
                  true,
              },
          },
        );

      if (!status) {
        throw new Error(
          "WorkshopStatus row 1 is missing.",
        );
      }

      let created = 0;
      let updated = 0;

      for (const definition of ENTRIES) {
        const existing =
          await tx.workshopEntry.findUnique(
            {
              where:
                {
                  publicId:
                    definition.publicId,
                },

              select:
                {
                  publishedAt:
                    true,
                },
            },
          );

        const desired =
          desiredEntry(
            definition,
          );

        if (existing) {
          await tx.workshopEntry.update(
            {
              where:
                {
                  publicId:
                    definition.publicId,
                },

              data:
                {
                  ...desired,

                  publishedAt:
                    existing.publishedAt ??
                    publishedAt,
                },
            },
          );

          updated += 1;
        } else {
          await tx.workshopEntry.create(
            {
              data:
                {
                  ...desired,

                  publishedAt,
                },
            },
          );

          created += 1;
        }
      }

      await tx.workshopStatus.update(
        {
          where:
            {
              id:
                1,
            },

          data:
            STATUS_UPDATE,
        },
      );

      return {
        created,
        updated,
        total:
          ENTRIES.length,
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
      prisma.workshopStatus.findUnique(
        {
          where:
            {
              id:
                1,
            },

          select:
            {
              headline:
                true,

              description:
                true,

              currentProject:
                true,

              updatedByUid:
                true,
            },
        },
      ),

      prisma.workshopEntry.findMany(
        {
          where:
            {
              publicId:
                {
                  in:
                    ENTRIES.map(
                      (entry) =>
                        entry.publicId,
                    ),
                },

              status:
                "published",

              visibility:
                "public",

              publishedAt:
                {
                  not:
                    null,
                },
            },

          select:
            {
              publicId:
                true,

              title:
                true,
            },
        },
      ),
    ]);

  if (
    !status ||
    status.headline !==
      STATUS_UPDATE.headline ||
    status.description !==
      STATUS_UPDATE.description ||
    status.currentProject !==
      STATUS_UPDATE.currentProject ||
    status.updatedByUid !==
      STATUS_UPDATE.updatedByUid
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
    entries,
  };
}

async function main() {
  const apply =
    process.argv.includes(
      "--apply",
    );

  const confirmation =
    readArgument(
      "--confirm",
    );

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

  process.stdout.write(
    `${JSON.stringify(
      {
        mode:
          apply
            ? "apply"
            : "plan",

        requiredReleases:
          REQUIRED_RELEASES,

        workshop,
      },
      null,
      2,
    )}\n`,
  );

  if (!apply) {
    process.stdout.write(
      "PLAN ONLY: no Workshop rows were changed.\n",
    );

    return;
  }

  const applied =
    await applyPublication();

  const verification =
    await verifyPublication();

  process.stdout.write(
    `${JSON.stringify(
      {
        applied,
        verification,
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(
    "PASS: WORKSHOP TRUTH IN PRODUCTION PUBLISHED\n",
  );
}

try {
  await main();
} finally {
  await getPrisma().$disconnect();
}
