import "dotenv/config";

import { execFileSync } from "node:child_process";

import { Prisma } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";

const REQUIRED_BASE =
  "44df2bde51fac9e0f620312f48581a2520dd09ff";

const APPLY_CONFIRMATION =
  "PUBLISH-WORKSHOP-CHRONICLE-2026-08-20";

const OPERATOR_UID =
  "release-workshop-20260820";

const STATUS_UPDATE = {
  headline: "THE KINGDOM BUILDS AGAIN",
  description:
    "AoE2WAR's operating system is sealed around the builder: rollback storage is governed, release speed is measured automatically, host/recovery/workspace truth is surfaced by Council, and player profiles now have private War Archives for guides and field documents.",
  currentProject:
    "Player tools · product building · Aug 20",
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
    publicId: "1481eaf2-e122-5c81-a2ea-202608200101",
    entryType: "milestone",
    title: "Rollback history becomes a managed archive.",
    summary:
      "Storage OS converted old runnable releases into verified compressed history while preserving a small hot rollback set and Wolo safety.",
    body:
      "AoE2WAR's rollback estate stopped behaving like an ever-growing garage of fully expanded releases. Storage OS now keeps the newest hot generations immediately runnable while older known-safe generations can be converted into verified compressed archives with manifests, hashes, isolated extraction checks, exact comparison, and Wolo guards before the expanded copy is removed. The August closure run brought the mounted volume from roughly 87% used into the healthy target band without touching legacy generations automatically.",
    lane: "legendary",
    linkLabel: "Open the Workshop",
    linkUrl: "/workshop",
    pinned: false,
    featuredOrder: 2600,
    occurredAt: "2026-08-20T01:45:00.000Z",
  },
  {
    publicId: "0485817e-cd70-5cb0-8b54-202608200201",
    entryType: "milestone",
    title: "The operating system closes around the builder.",
    summary:
      "Council, Host, Recovery, Workspace, Documentation, Storage, Performance, Audit, Doctor, and the release engine now form one operator loop.",
    body:
      "The internal-closure campaign turned the project's maintenance systems into one practical operating loop. AoE2WAR Council ranks evidence-backed next actions; Host OS owns bounded systemd hygiene; Recovery OS fails closed on independent mutable-state proof; Workspace OS protects dirty or unmerged work while classifying cleanup candidates; Documentation OS keeps explicit source-of-truth records synchronized; and Finish remains the normal path from completed code to a certified production state. The closing estate audit returned P0/P1 at zero and Doctor at 96/100, leaving only explicit maintenance warnings rather than hidden operational debt.",
    lane: "legendary",
    linkLabel: "Open the Workshop",
    linkUrl: "/workshop",
    pinned: true,
    featuredOrder: 2700,
    occurredAt: "2026-08-20T03:22:00.000Z",
  },
  {
    publicId: "438c87c3-659c-5bf5-8c48-202608200301",
    entryType: "deployment",
    title: "Performance becomes a permanent release signal.",
    summary:
      "Every successful finish now leaves a cheap critical-route public pulse beside the deeper Performance OS history.",
    body:
      "Speed work is no longer a one-off campaign. The release path now records a persisted public pulse over ten critical routes after certification, compares like-for-like observations, and keeps that result separate from release truth so a transient network wobble cannot rewrite a successfully certified deployment. The broader 66-route Performance OS remains available for deeper diagnosis. This gives the kingdom both a cheap heartbeat on every release and a heavier benchmark when a real speed investigation is justified.",
    lane: "fresh_forge",
    linkLabel: "Open Speed",
    linkUrl: "/speed",
    pinned: true,
    featuredOrder: 2800,
    occurredAt: "2026-08-20T04:05:00.000Z",
  },
  {
    publicId: "15954514-947d-5c75-baf8-202608200401",
    entryType: "deployment",
    title: "Profiles gain private War Archives.",
    summary:
      "Players can drag guides, build orders, notes, and office documents onto their profile while the owner and AoE2WAR admins retain private access.",
    body:
      "Player profiles now include a premium War Archive directly beneath the warrior identity. The tile accepts drag-and-drop or file selection for PDF, Office, OpenDocument, and text formats, keeps document bytes outside the public managed-media route, and exposes them only through authenticated owner/admin API gates. Claimed player pages also surface the private shelf to the owner or an AoE2WAR admin, so a player such as Zodiac can hand over a civilization guide without moving the exchange into email or an external file host.",
    lane: "fresh_forge",
    linkLabel: "Open Profile",
    linkUrl: "/profile",
    pinned: true,
    featuredOrder: 2900,
    occurredAt: "2026-08-20T04:45:00.000Z",
  },
] as const;

function auditSource() {
  execFileSync(
    "git",
    ["merge-base", "--is-ancestor", REQUIRED_BASE, "HEAD"],
    {
      cwd: process.cwd(),
      stdio: "ignore",
    },
  );
}

async function assertProductionDatabase() {
  const rows =
    await getPrisma().$queryRaw<Array<{ database_name: string }>>`
      SELECT current_database() AS database_name
    `;

  const databaseName =
    rows[0]?.database_name || "";

  if (databaseName !== "aoe2hd_db") {
    throw new Error(
      `Refusing Workshop publication outside aoe2hd_db; current=${databaseName || "unknown"}.`,
    );
  }
}

function desiredEntry(definition: EntryDefinition) {
  return {
    publicId: definition.publicId,
    entryType: definition.entryType,
    title: definition.title,
    summary: definition.summary,
    body: definition.body,
    dialogue: [] as Prisma.InputJsonValue,
    lane: definition.lane,
    status: "published",
    visibility: "public",
    mediaKind: null,
    mediaUrl: null,
    mediaAlt: null,
    linkLabel: definition.linkLabel,
    linkUrl: definition.linkUrl,
    pinned: definition.pinned,
    featuredOrder: definition.featuredOrder,
    occurredAt: new Date(definition.occurredAt),
    createdByUid: OPERATOR_UID,
    updatedByUid: OPERATOR_UID,
  };
}

async function plan() {
  const prisma = getPrisma();

  const [status, existing] = await Promise.all([
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
          in: ENTRIES.map((entry) => entry.publicId),
        },
      },
      select: {
        publicId: true,
      },
    }),
  ]);

  if (!status) {
    throw new Error("WorkshopStatus row 1 is missing.");
  }

  const existingIds =
    new Set(existing.map((entry) => entry.publicId));

  return {
    database: "aoe2hd_db",
    status,
    desiredStatus: STATUS_UPDATE,
    entries: ENTRIES.map((entry) => ({
      date: entry.occurredAt.slice(0, 10),
      title: entry.title,
      lane: entry.lane,
      action: existingIds.has(entry.publicId)
        ? "update"
        : "create",
    })),
  };
}

async function applyPublication() {
  const prisma = getPrisma();
  const publishedAt = new Date();

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(207702, 20260820)",
      );

      const status =
        await tx.workshopStatus.findUnique({
          where: { id: 1 },
          select: { id: true },
        });

      if (!status) {
        throw new Error("WorkshopStatus row 1 is missing.");
      }

      let created = 0;
      let updated = 0;

      for (const definition of ENTRIES) {
        const existing =
          await tx.workshopEntry.findUnique({
            where: {
              publicId: definition.publicId,
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
              publicId: definition.publicId,
            },
            data: {
              ...desired,
              publishedAt:
                existing.publishedAt ?? publishedAt,
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
        Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}

async function verifyPublication() {
  const prisma = getPrisma();

  const [status, entries] = await Promise.all([
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
          in: ENTRIES.map((entry) => entry.publicId),
        },
        status: "published",
        visibility: "public",
        publishedAt: { not: null },
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
    status.headline !== STATUS_UPDATE.headline ||
    status.description !== STATUS_UPDATE.description ||
    status.currentProject !== STATUS_UPDATE.currentProject
  ) {
    throw new Error("Workshop status verification failed.");
  }

  if (entries.length !== ENTRIES.length) {
    throw new Error(
      `Expected ${ENTRIES.length} published entries; found ${entries.length}.`,
    );
  }

  return {
    status,
    publishedEntries: entries.length,
  };
}

async function main() {
  auditSource();
  await assertProductionDatabase();

  const apply =
    process.argv.includes("--apply");

  const confirmIndex =
    process.argv.indexOf("--confirm");

  const confirmation =
    confirmIndex >= 0
      ? process.argv[confirmIndex + 1]
      : "";

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLY" : "PLAN",
        confirmationRequired: APPLY_CONFIRMATION,
        ...(await plan()),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log();
    console.log("PLAN ONLY — no Workshop rows changed.");
    return;
  }

  if (confirmation !== APPLY_CONFIRMATION) {
    throw new Error(
      `Refusing apply without --confirm ${APPLY_CONFIRMATION}`,
    );
  }

  const result =
    await applyPublication();

  const verified =
    await verifyPublication();

  console.log();
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        result,
        verified,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect().catch(() => undefined);
  });
