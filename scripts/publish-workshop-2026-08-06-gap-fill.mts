import "dotenv/config";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { Prisma } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";

const APPLY_CONFIRMATION =
  "PUBLISH-WORKSHOP-GAP-FILL-2026-08-06";

const OPERATOR_UID = "release-workshop-gap-fill-20260806";

const REQUIRED_COMMITS = [
  "9d8e586adae6a98557c5f5487070d5450baea110",
  "b32027457104909deafe06448ae0355c8c84782d",
  "b6b4aabe4f681b137d05b8e1cc09d7d870d95f46",
  "48a1f152d56968b5fefb45473e89c20bb97b381a",
  "ea28fcbe378bb37fb78f5347734fef8a4768f453",
  "e31876f01cbe9f7cba97e3ab76924076115397e4",
  "1a8fa8981eb23307fe1bbc7620c942fba6566a3b",
  "0db6fbfbd01c6f609ce42380cfcb16f78d08681e",
  "3714d265fcb48cdc393834c648c01e6b5943f924",
  "d2bbd84d3cc96e380b41f8c597265ead22ceb089",
  "7023e43af24fd7c9fbf5ff45f2a77b978814c712",
  "52b7ec54e0c00e6eb53f19e7fe8bc7d2c7ce5e72",
  "5ebca4add4991e72f5136cea9d372624d5effc18",
  "45f93f8f7b5e0c4180785ab4c16776239fc4936c",
  "fd7db8ba04bb155ac8d727af4bc97b2951a4ada2",
] as const;

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
    publicId: "a66dff5f-ce7b-52c7-b5eb-9385deda4e0f",
    entryType: "milestone",
    title: "Team endings become replay truth.",
    summary:
      "Decisive multiplayer action tails, legacy completion receipts, roster-hash reconciliation, and complete winning-side projection close the team-game gap.",
    body:
      "August 5 carried team replay truth through the whole public path. Commit 9d8e586 added decisive team action-tail recovery. The legacy completion and roster reconciliation passes accepted older trustworthy endings without weakening ambiguity gates. Commit b320274 then projected every winning teammate, not one representative name, and b6b4aab carried raw player activity into the selected parser run. Statistics can now show the full winning side while betting and settlement authority remain separate.",
    lane: "fresh_forge",
    linkLabel: "Open Replay Operations",
    linkUrl: "/game-stats",
    pinned: false,
    featuredOrder: 900,
    occurredAt: "2026-08-05T16:23:07.000Z",
  },
  {
    publicId: "6dfaf485-71b8-50eb-a5f4-b87f543a5146",
    entryType: "deployment",
    title: "Payout recovery follows the bettor's entitlement.",
    summary:
      "A retry now proves the winning wager, bettor identity, winning side, and exact stored payout instead of comparing the bettor to the player who won the match.",
    body:
      "Commit 48a1f152 repaired the administrative payout-retry truth gate. Bet payouts belong to the bettor whose stored wager won; winner bounties still belong to the actual winning player. Retry now fails closed when user, side, status, or amount drifts from the persisted wager entitlement.",
    lane: "fresh_forge",
    linkLabel: "Open Betting Hall",
    linkUrl: "/bets",
    pinned: false,
    featuredOrder: 800,
    occurredAt: "2026-08-05T11:59:50.000Z",
  },
  {
    publicId: "d7f6c479-ce70-574a-bd84-cfc1b60f7f5b",
    entryType: "parser_discovery",
    title: "Silent 1v1 endings become decidable.",
    summary:
      "Final one-versus-one replays can recover a decisive outcome from trustworthy player-action tails even when the old scalar winner field is silent.",
    body:
      "The August 4 sequence beginning at ea28fcbe defined a bounded final-1v1 outcome rule, documented its evidence contract, and merged it into public replay truth. A decisive resignation or defeat tail may resolve the battle only when the roster, terminal action, and final-state requirements agree. Generic inference and incomplete endings still remain Unknown.",
    lane: "fresh_forge",
    linkLabel: "Inspect Replay Truth",
    linkUrl: "/game-stats",
    pinned: false,
    featuredOrder: 900,
    occurredAt: "2026-08-04T23:41:45.000Z",
  },
  {
    publicId: "a3d6bb19-c7a1-50e6-bd1d-3bcc5fe621e5",
    entryType: "design_decision",
    title: "The source of truth is fully re-audited.",
    summary:
      "Application state, production deployment procedure, reconstruction governance, and authority boundaries are reconciled before the next build wave.",
    body:
      "Commit e31876f performed a full source-of-truth audit across the application and its operational records. The same August 4 campaign documented the production release procedure and tightened Universal-16 reconstruction governance so code, evidence, deployment, and financial authority could be followed as separate explicit rails rather than one implied state.",
    lane: "fresh_forge",
    linkLabel: "Open the War Engine",
    linkUrl: "/war-engine",
    pinned: false,
    featuredOrder: 700,
    occurredAt: "2026-08-04T02:26:34.000Z",
  },
  {
    publicId: "e9c01d64-5877-5ab3-9faa-b3040b06e085",
    entryType: "milestone",
    title: "The homepage learns sixteen languages.",
    summary:
      "Spanish begins the international shell, translator hierarchy is cleaned up, and the homepage expands into sixteen dynamic language catalogs.",
    body:
      "The localization wave moved from the first Spanish shell through translator hierarchy and retired-copy cleanup into commit 1a8fa898: sixteen homepage languages backed by dynamic catalogs. The work widened the Kingdom's front door without hard-coding one translated copy block into the page.",
    lane: "fresh_forge",
    linkLabel: "Open AoE2WAR",
    linkUrl: "/",
    pinned: false,
    featuredOrder: 900,
    occurredAt: "2026-08-04T00:28:58.000Z",
  },
  {
    publicId: "3ecaedbc-baa9-511e-8feb-d3eea1cc1d40",
    entryType: "milestone",
    title: "Bounty Hall is rebuilt on verified payout truth.",
    summary:
      "Bounties gain canonical paid-history aggregation, stable warrior attribution, personal next contracts, and append-only WOLO valuation history.",
    body:
      "Commit 0db6fbfb replaced contaminated bounty totals with canonical verified payout truth. It added a dynamic claimed-warrior carousel, stable UID attribution, personal next-bounty administration, append-only valuation records, stricter database constraints, and dedicated regression coverage. The follow-up memo-history pass numbered the public bounty record without rewriting prior events.",
    lane: "fresh_forge",
    linkLabel: "Enter Bounty Hall",
    linkUrl: "/bounties",
    pinned: false,
    featuredOrder: 900,
    occurredAt: "2026-08-03T19:22:42.000Z",
  },
  {
    publicId: "913e7c01-e113-5fbe-bb97-c942ebc6bd72",
    entryType: "deployment",
    title: "The War Engine opens a reconstruction queue.",
    summary:
      "A public six-tier queue turns missing or damaged battle truth into visible reconstruction work instead of a hidden parser backlog.",
    body:
      "Commit 3714d265 created the War Engine reconstruction queue and its public status surface. The queue classifies recovery work by evidence tier, keeps bounded states visible, and gives the Kingdom a durable place to see which battle records can be reconstructed and which still require stronger proof.",
    lane: "fresh_forge",
    linkLabel: "Open the Reconstruction Queue",
    linkUrl: "/war-engine",
    pinned: false,
    featuredOrder: 800,
    occurredAt: "2026-08-03T05:06:43.000Z",
  },
  {
    publicId: "3f1d39c7-a504-507e-8b23-6795a1ef4e87",
    entryType: "design_decision",
    title: "Accepted adjudications enter public replay truth.",
    summary:
      "A complete accepted adjudication may correct public statistics while remaining explicitly unable to reopen betting or authorize settlement.",
    body:
      "Commit d2bbd84d made accepted replay-result adjudications durable statistics authority over immutable evidence. The adjudication must carry a complete explicit winning and losing roster, an accepted decision, and permission to affect statistics. Invalid or incomplete markers fail closed, and betting authority remains false unless a separate financial rail grants it.",
    lane: "fresh_forge",
    linkLabel: "Open Replay Review",
    linkUrl: "/game-stats",
    pinned: false,
    featuredOrder: 700,
    occurredAt: "2026-08-03T00:47:33.000Z",
  },
  {
    publicId: "1a688fc1-382c-5321-ae75-29835002962a",
    entryType: "deployment",
    title: "Replay recovery becomes exact-hash and disconnect-aware.",
    summary:
      "Recovery binds to exact final replay bytes, disconnect-only endings stay no-result, and displayed replay times respect the viewer's browser clock.",
    body:
      "Commit 7023e43a tightened final replay recovery around exact source hashes instead of loose file resemblance. Commit 52b7ec54 classified a final disconnect as a desynced no-result rather than Completed. The same August 2 pass moved replay chronology to browser-local time so evidence is preserved in UTC while visitors read it in their own clock.",
    lane: "fresh_forge",
    linkLabel: "Inspect the Battle Archive",
    linkUrl: "/battle-archive",
    pinned: false,
    featuredOrder: 800,
    occurredAt: "2026-08-02T22:33:40.000Z",
  },
  {
    publicId: "731a2e27-e42d-5b33-957e-f1503e60a064",
    entryType: "parser_discovery",
    title: "Automatic replay truth gains evidence fences.",
    summary:
      "Automation can project evidence, but owner hints remain diagnostic, ambiguous rosters stay unmerged, and ledger authority must still agree.",
    body:
      "Commit 5ebca4ad automated replay-result and identity evidence. The companion passes aligned automatic projections with the immutable ledger, kept watcher-owner signals diagnostic rather than authoritative, and skipped ambiguous identity rosters instead of merging humans by convenience. The machine became faster without becoming freer to guess.",
    lane: "fresh_forge",
    linkLabel: "Open Replay Operations",
    linkUrl: "/game-stats",
    pinned: false,
    featuredOrder: 700,
    occurredAt: "2026-08-02T02:47:39.000Z",
  },
  {
    publicId: "1705012d-c6e8-5b74-9a7a-ab5e1bdd8200",
    entryType: "milestone",
    title: "Betting Hall is rebuilt and wager rails harden.",
    summary:
      "The market interface, ticket flow, wager recovery, Extreme default, and reconciliation locks are rebuilt as one clearer betting system.",
    body:
      "Commit 45f93f8f overhauled the Betting Hall and wager rail, including the market presentation and transaction flow. The following passes made Extreme the default, removed distracting copy, and hardened reconciliation locks so concurrent or stale settlement work cannot silently duplicate or reopen a wager state.",
    lane: "fresh_forge",
    linkLabel: "Open Betting Hall",
    linkUrl: "/bets",
    pinned: false,
    featuredOrder: 900,
    occurredAt: "2026-08-01T23:23:58.000Z",
  },
  {
    publicId: "7a87c1c0-f574-5567-9d30-6a18791f53a7",
    entryType: "deployment",
    title: "Watcher 1.5.7 ships.",
    summary:
      "The desktop Watcher release binds each upload to one immutable byte snapshot and refreshes the public download and Workshop record.",
    body:
      "Commit fd7db8ba published Watcher 1.5.7. The release artwork followed, and the Workshop was refreshed around the new transport contract: one captured replay snapshot is hashed and uploaded as one immutable source object rather than changing underneath the parser while it moves.",
    lane: "fresh_forge",
    linkLabel: "Download Watcher 1.5.7",
    linkUrl: "/download",
    pinned: false,
    featuredOrder: 800,
    occurredAt: "2026-08-01T04:57:35.000Z",
  },
] as const;

function readArgument(name: string) {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function auditSource() {
  const page = readFileSync("app/workshop/page.tsx", "utf8");
  const centering = readFileSync(
    "app/workshop/workshop-chronicle-gap-fill.css",
    "utf8",
  );

  for (const marker of [
    'import "./workshop-chronicle-gap-fill.css"',
    'main[data-workshop-view="basic"] #chronicle > div > header',
    "margin-inline: auto",
    "justify-content: center",
  ]) {
    const source = marker.startsWith("import") ? page : centering;
    if (!source.includes(marker)) {
      throw new Error(`Workshop gap-fill marker missing: ${marker}`);
    }
  }

  for (const commit of REQUIRED_COMMITS) {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
  }

  const publicIds = new Set(ENTRIES.map((entry) => entry.publicId));
  if (publicIds.size !== ENTRIES.length) {
    throw new Error("Workshop gap-fill public IDs must be unique.");
  }

  const start = Date.parse("2026-08-01T00:00:00.000Z");
  const end = Date.parse("2026-08-06T00:00:00.000Z");

  for (const entry of ENTRIES) {
    const occurredAt = Date.parse(entry.occurredAt);
    if (!Number.isFinite(occurredAt) || occurredAt < start || occurredAt >= end) {
      throw new Error(
        `Workshop gap-fill entry is outside August 1-5: ${entry.title}`,
      );
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
  const existing = await prisma.workshopEntry.findMany({
    where: { publicId: { in: ENTRIES.map((entry) => entry.publicId) } },
    select: {
      publicId: true,
      title: true,
      summary: true,
      body: true,
      occurredAt: true,
    },
  });

  const byPublicId = new Map(existing.map((entry) => [entry.publicId, entry]));

  return ENTRIES.map((definition) => {
    const current = byPublicId.get(definition.publicId);
    const unchanged =
      current?.title === definition.title &&
      current.summary === definition.summary &&
      current.body === definition.body &&
      current.occurredAt.toISOString() === definition.occurredAt;

    return {
      publicId: definition.publicId,
      occurredAt: definition.occurredAt,
      title: definition.title,
      action: !current ? "create" : unchanged ? "unchanged" : "update",
    };
  });
}

async function applyPublication() {
  const prisma = getPrisma();
  const publishedAt = new Date();

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(207702, 20260808)",
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
  const entries = await prisma.workshopEntry.findMany({
    where: {
      publicId: { in: ENTRIES.map((entry) => entry.publicId) },
      status: "published",
      visibility: "public",
      publishedAt: { not: null },
    },
    select: { publicId: true, title: true, occurredAt: true },
  });

  if (entries.length !== ENTRIES.length) {
    throw new Error(
      `Expected ${ENTRIES.length} published gap-fill entries; found ${entries.length}.`,
    );
  }

  const expected = new Map(
    ENTRIES.map((entry) => [entry.publicId, entry.occurredAt]),
  );

  for (const entry of entries) {
    if (entry.occurredAt.toISOString() !== expected.get(entry.publicId)) {
      throw new Error(`Workshop gap-fill date verification failed: ${entry.title}`);
    }
  }

  return entries.sort(
    (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
  );
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
        range: "2026-08-01 through 2026-08-05",
        auditedCommits: REQUIRED_COMMITS.length,
        entries: publicationPlan,
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
  process.stdout.write("PASS: WORKSHOP AUGUST GAP FILLED\n");
}

try {
  await main();
} finally {
  await getPrisma().$disconnect();
}
