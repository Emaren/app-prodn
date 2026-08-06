import "dotenv/config";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { Prisma } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";

const REQUIRED_BAE_RELEASE_SHA =
  "222c4601f925c966232afff6d9b9aaf6570f2a0d";

const DEPLOYED_BUILD_VERSION =
  "20260806153401-ba04dfc88b";

const APPLY_CONFIRMATION =
  "PUBLISH-WORKSHOP-CHRONICLE-2026-08-06";

const OPERATOR_UID =
  "release-workshop-20260806";

const STATUS_UPDATE = {
  headline: "THE WORKSHOP OBSERVATORY",
  description:
    "B/A/E views now turn replay, identity, archive, parser, and release evidence into readable public progress. The Chronicle keeps summaries visible and opens technical records only on demand.",
  currentProject:
    "Workshop B/A/E · Chronicle readability",
  updatedByUid: OPERATOR_UID,
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
    publicId: "c6a92c19-afc0-52b0-9b51-c2909f23ebbb",
    entryType: "milestone",
    title: "The Workshop becomes a three-level observatory.",
    summary:
      "Basic preserves the familiar public Workshop, Advanced becomes the clear default, and Extreme exposes the deeper replay, archive, identity, parser, and authority diagnostics.",
    body:
      `Release ${REQUIRED_BAE_RELEASE_SHA} added a persistent Workshop B/A/E preference with Advanced as the default. The production build ${DEPLOYED_BUILD_VERSION} passed all four Workshop regression tests, compiled successfully, restarted cleanly, and was verified through the public deployment-version endpoint. The display changes presentation only: parser evidence still cannot silently grant result, identity, betting, financial, or chain authority.`,
    lane: "fresh_forge",
    linkLabel: "Open the Workshop Observatory",
    linkUrl: "/workshop",
    pinned: true,
    featuredOrder: 1200,
    occurredAt: "2026-08-06T15:34:01.000Z",
  },
  {
    publicId: "50e3dd4d-70a9-5737-a42a-39df94e2eaa4",
    entryType: "design_decision",
    title: "The Chronicle trades narrow zig-zags for one readable record.",
    summary:
      "Every entry now uses the full reading width beside one timeline rail. Summaries stay visible while hashes, receipts, dialogue, and artifacts move into an optional technical record.",
    body:
      "The prior desktop alternation left half the Chronicle empty and forced long evidence into narrow cards. The new layout keeps newest-first date groups and infinite history, but uses one full-width reading column, smaller titles, clearer time and type labels, safe wrapping for long hashes, explicit record counts, and cursor-marked expand controls. No Chronicle evidence is deleted or shortened in storage; dense material is simply collapsed until requested.",
    lane: "fresh_forge",
    linkLabel: "Read the Chronicle",
    linkUrl: "/workshop#chronicle",
    pinned: true,
    featuredOrder: 1100,
    occurredAt: "2026-08-06T15:42:00.000Z",
  },
] as const;

function readArgument(name: string) {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));

  if (direct) return direct.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function auditSource() {
  execFileSync(
    "git",
    ["merge-base", "--is-ancestor", REQUIRED_BAE_RELEASE_SHA, "HEAD"],
    {
      cwd: process.cwd(),
      stdio: "ignore",
    },
  );

  const experience = readFileSync(
    "components/workshop/WorkshopExperience.tsx",
    "utf8",
  );
  const chronicle = readFileSync(
    "components/workshop/WorkshopChronicle.tsx",
    "utf8",
  );

  const requiredExperienceMarkers = [
    "data-workshop-view",
    'useTileViewPreference("workshop")',
    "WorkshopChronicle",
  ];

  const requiredChronicleMarkers = [
    "max-w-6xl",
    "Read technical record",
    "aria-expanded",
    "[overflow-wrap:anywhere]",
    "loaded records",
  ];

  for (const marker of requiredExperienceMarkers) {
    if (!experience.includes(marker)) {
      throw new Error(`Workshop experience marker missing: ${marker}`);
    }
  }

  for (const marker of requiredChronicleMarkers) {
    if (!chronicle.includes(marker)) {
      throw new Error(`Workshop Chronicle marker missing: ${marker}`);
    }
  }

  if (chronicle.includes("sm:grid-cols-2")) {
    throw new Error("Workshop Chronicle still contains the narrow split-card layout.");
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

function sameEntry(
  existing: {
    entryType: string;
    title: string;
    summary: string;
    body: string;
    dialogue: Prisma.JsonValue;
    lane: string;
    status: string;
    visibility: string;
    mediaKind: string | null;
    mediaUrl: string | null;
    mediaAlt: string | null;
    linkLabel: string | null;
    linkUrl: string | null;
    pinned: boolean;
    featuredOrder: number;
    occurredAt: Date;
    createdByUid: string | null;
    updatedByUid: string | null;
  },
  definition: EntryDefinition,
) {
  const desired = desiredEntry(definition);

  return (
    existing.entryType === desired.entryType &&
    existing.title === desired.title &&
    existing.summary === desired.summary &&
    existing.body === desired.body &&
    JSON.stringify(existing.dialogue) === "[]" &&
    existing.lane === desired.lane &&
    existing.status === desired.status &&
    existing.visibility === desired.visibility &&
    existing.mediaKind === desired.mediaKind &&
    existing.mediaUrl === desired.mediaUrl &&
    existing.mediaAlt === desired.mediaAlt &&
    existing.linkLabel === desired.linkLabel &&
    existing.linkUrl === desired.linkUrl &&
    existing.pinned === desired.pinned &&
    existing.featuredOrder === desired.featuredOrder &&
    existing.occurredAt.toISOString() === desired.occurredAt.toISOString() &&
    existing.createdByUid === desired.createdByUid &&
    existing.updatedByUid === desired.updatedByUid
  );
}

async function plan() {
  const prisma = getPrisma();
  const publicIds = ENTRIES.map((entry) => entry.publicId);

  const [status, existing] = await Promise.all([
    prisma.workshopStatus.findUnique({
      where: { id: 1 },
      select: {
        headline: true,
        description: true,
        currentProject: true,
        updatedByUid: true,
      },
    }),
    prisma.workshopEntry.findMany({
      where: { publicId: { in: publicIds } },
      select: {
        publicId: true,
        entryType: true,
        title: true,
        summary: true,
        body: true,
        dialogue: true,
        lane: true,
        status: true,
        visibility: true,
        mediaKind: true,
        mediaUrl: true,
        mediaAlt: true,
        linkLabel: true,
        linkUrl: true,
        pinned: true,
        featuredOrder: true,
        occurredAt: true,
        createdByUid: true,
        updatedByUid: true,
      },
    }),
  ]);

  if (!status) throw new Error("WorkshopStatus row 1 is missing.");

  const byPublicId = new Map(
    existing.map((entry) => [entry.publicId, entry]),
  );

  return {
    statusAction:
      status.headline === STATUS_UPDATE.headline &&
      status.description === STATUS_UPDATE.description &&
      status.currentProject === STATUS_UPDATE.currentProject &&
      status.updatedByUid === STATUS_UPDATE.updatedByUid
        ? "unchanged"
        : "update",
    entries: ENTRIES.map((definition) => {
      const current = byPublicId.get(definition.publicId);

      return {
        publicId: definition.publicId,
        title: definition.title,
        action: !current
          ? "create"
          : sameEntry(current, definition)
            ? "unchanged"
            : "update",
      };
    }),
  };
}

async function applyPublication() {
  const prisma = getPrisma();
  const publishedAt = new Date();

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(207702, 20260806)",
      );

      const status = await tx.workshopStatus.findUnique({
        where: { id: 1 },
        select: { id: true },
      });

      if (!status) throw new Error("WorkshopStatus row 1 is missing.");

      let created = 0;
      let updated = 0;

      for (const definition of ENTRIES) {
        const existing = await tx.workshopEntry.findUnique({
          where: { publicId: definition.publicId },
          select: { publishedAt: true },
        });

        const desired = desiredEntry(definition);

        if (existing) {
          await tx.workshopEntry.update({
            where: { publicId: definition.publicId },
            data: {
              ...desired,
              publishedAt: existing.publishedAt ?? publishedAt,
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

      return { created, updated, total: ENTRIES.length };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
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
        updatedByUid: true,
      },
    }),
    prisma.workshopEntry.findMany({
      where: {
        publicId: { in: ENTRIES.map((entry) => entry.publicId) },
        status: "published",
        visibility: "public",
        publishedAt: { not: null },
      },
      select: { publicId: true, title: true },
    }),
  ]);

  if (
    !status ||
    status.headline !== STATUS_UPDATE.headline ||
    status.description !== STATUS_UPDATE.description ||
    status.currentProject !== STATUS_UPDATE.currentProject ||
    status.updatedByUid !== STATUS_UPDATE.updatedByUid
  ) {
    throw new Error("Workshop status verification failed.");
  }

  if (entries.length !== ENTRIES.length) {
    throw new Error(
      `Expected ${ENTRIES.length} published Workshop entries; found ${entries.length}.`,
    );
  }

  return { status, entries };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmation = readArgument("--confirm");

  if (apply && confirmation !== APPLY_CONFIRMATION) {
    throw new Error(
      `Apply mode requires --confirm ${APPLY_CONFIRMATION}`,
    );
  }

  auditSource();
  const publicationPlan = await plan();

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: apply ? "apply" : "plan",
        requiredBaeReleaseSha: REQUIRED_BAE_RELEASE_SHA,
        deployedBuildVersion: DEPLOYED_BUILD_VERSION,
        workshop: publicationPlan,
      },
      null,
      2,
    )}\n`,
  );

  if (!apply) {
    process.stdout.write("PLAN ONLY: no Workshop rows were changed.\n");
    return;
  }

  const applied = await applyPublication();
  const verification = await verifyPublication();

  process.stdout.write(
    `${JSON.stringify({ applied, verification }, null, 2)}\n`,
  );
  process.stdout.write("PASS: WORKSHOP CHRONICLE 2026-08-06 PUBLISHED\n");
}

try {
  await main();
} finally {
  await getPrisma().$disconnect();
}
