import "dotenv/config";

import { readFileSync } from "node:fs";

import { Prisma } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";

const APPLY_CONFIRMATION =
  "PUBLISH-WORKSHOP-EXTREME-POLISH-2026-08-06";

const OPERATOR_UID = "release-workshop-polish-20260806";

const STATUS_UPDATE = {
  headline: "THE WORKSHOP OBSERVATORY",
  description:
    "Extreme is the default command-deck view, Advanced is the polished readable observatory, and Basic preserves the classic side-by-side Chronicle.",
  currentProject:
    "Workshop Extreme default · Basic Chronicle restored",
  updatedByUid: OPERATOR_UID,
} as const;

type EntryDefinition = {
  publicId: string;
  entryType: string;
  title: string;
  summary: string;
  body: string;
  lane: string;
  linkLabel: string;
  linkUrl: string;
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
      "Basic preserves the classic side-by-side Chronicle, Advanced keeps the polished readable observatory, and Extreme is now the default command-deck view with the deepest diagnostics.",
    body:
      "The Workshop keeps three deliberate levels instead of forcing one density on every visitor. Basic carries the original alternating desktop timeline. Advanced keeps the readable full-width Chronicle and a calmer progress-first hierarchy. Extreme is the default and exposes archive, parser, battle, identity, review, publication, and financial-boundary diagnostics without granting authority between those systems. The B/A/E choice remains persistent.",
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
    title: "The Chronicle gains two deliberate reading modes.",
    summary:
      "Basic restores the cinematic left-right timeline while Advanced and Extreme retain the faster full-width record with optional technical evidence.",
    body:
      "The timeline no longer has to choose one layout for everyone. Basic alternates entries around the center rail on desktop and remains single-column on mobile. Advanced and Extreme keep the full-width record, safer long-hash wrapping, visible summaries, and expandable technical details. The stored evidence, ordering, pagination, dialogue, artifacts, and links are shared; only presentation changes by view.",
    lane: "fresh_forge",
    linkLabel: "Read the Chronicle",
    linkUrl: "/workshop#chronicle",
    pinned: true,
    featuredOrder: 1100,
    occurredAt: "2026-08-06T16:11:00.000Z",
  },
] as const;

function readArgument(name: string) {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function auditSource() {
  const preferences = readFileSync("lib/tileViewPreferences.ts", "utf8");
  const page = readFileSync("app/workshop/page.tsx", "utf8");
  const polish = readFileSync("app/workshop/workshop-polish.css", "utf8");
  const sponsor = readFileSync(
    "components/workshop/WorkshopSponsor.tsx",
    "utf8",
  );

  const requiredMarkers = [
    [preferences, 'workshop: "extreme"'],
    [page, 'import "./workshop-polish.css"'],
    [polish, 'main[data-workshop-view="basic"] #chronicle'],
    [polish, 'main[data-workshop-view="advanced"]'],
    [polish, 'main[data-workshop-view="extreme"]'],
    [sponsor, "Buy a Feature"],
  ] as const;

  for (const [source, marker] of requiredMarkers) {
    if (!source.includes(marker)) {
      throw new Error(`Workshop polish marker missing: ${marker}`);
    }
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
      select: { publicId: true, title: true, summary: true, body: true },
    }),
  ]);

  if (!status) throw new Error("WorkshopStatus row 1 is missing.");

  const byPublicId = new Map(existing.map((entry) => [entry.publicId, entry]));

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
      const unchanged =
        current?.title === definition.title &&
        current.summary === definition.summary &&
        current.body === definition.body;

      return {
        publicId: definition.publicId,
        title: definition.title,
        action: !current ? "create" : unchanged ? "unchanged" : "update",
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
            data: { ...desired, publishedAt },
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
      `Expected ${ENTRIES.length} published entries; found ${entries.length}.`,
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
  process.stdout.write("PASS: WORKSHOP EXTREME POLISH PUBLISHED\n");
}

try {
  await main();
} finally {
  await getPrisma().$disconnect();
}
