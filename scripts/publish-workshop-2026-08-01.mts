import "dotenv/config";

import { execFileSync } from "node:child_process";

import { Prisma } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";

const PREVIOUS_CAMPAIGN_SHA =
  "aece6b2f2b4640e73f2207cfdf7120638deca4e9";

const AUDITED_APP_HEAD =
  "223612f7583ece499c551a6ea62ae376ce5d0115";

const WATCHER_SOURCE_SHA =
  "c3d3af0a2c03a05d631b44eab773bf20650de0f8";

const EXPECTED_APP_COMMIT_COUNT = 44;

const APPLY_CONFIRMATION =
  "PUBLISH-WORKSHOP-EVIDENCE-IN-MOTION-2026-08-01";

const OPERATOR_UID =
  "release-workshop-20260801";

const STATUS_UPDATE = {
  headline: "EVIDENCE IN MOTION",
  description:
    "Pass 8 replay statistics, provisional account identity, bet and replay reliability, final-proof visibility, and Watcher 1.5.7 are now the current public Workshop front.",
  currentProject:
    "Evidence in Motion · Pass 8 · Watcher 1.5.7",
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
  mediaKind?: string | null;
  mediaUrl?: string | null;
  mediaAlt?: string | null;
};

const ENTRIES: readonly EntryDefinition[] = [
  {
    publicId: "944598f5-59f8-5839-8b7e-e8a978a5cfb3",
    entryType: "milestone",
    title: "The Chronicle catches up to forty-four commits.",
    summary:
      "The prior Deterministic Evidence campaign at aece6b2 is exactly 44 app commits behind the Watcher 1.5.7 artwork release at 223612f. This update is built from that audited range, plus the separately frozen watcher source.",
    body:
      "The audited app range is aece6b2f2b4640e73f2207cfdf7120638deca4e9..223612f7583ece499c551a6ea62ae376ce5d0115: 44 commits ahead and zero behind. Required anchors cover recovered replay truth, Pass 8 statistics, post-broadcast bet recovery, governed documentation, Player Identity Wave 2, account-grain leaderboard views, bet/replay reliability, final-proof visibility, Watcher 1.5.7 publication, and the new responsive artwork. Watcher source c3d3af0a2c03a05d631b44eab773bf20650de0f8 is audited separately because it lives in the watcher repository. Signing activation and the safe 5.4 GB server reclaim are operational receipts, not app commits.",
    lane: "fresh_forge",
    linkLabel: "Open the Workshop",
    linkUrl: "/workshop",
    pinned: true,
    featuredOrder: 1000,
    occurredAt: "2026-08-01T04:35:00.000Z",
  },
  {
    publicId: "34ac6e2f-1ed9-5796-a217-53dc47e244d0",
    entryType: "deployment",
    title: "The forge reclaims 5.4 GB without dropping service.",
    summary:
      "Reproducible Next.js, Yarn, Snap, APT, journal, and rotated-log storage was reclaimed after the release. Root usage fell from 98% to 84% while AoE2WAR remained healthy.",
    body:
      "This was an operations-only receipt rather than a source commit. The cleanup preserved PostgreSQL, WoloChain binaries, market-integrity evidence, node_modules, the active build, and all Watcher release backups. Production remained on the Watcher artwork commit and continued serving the 1.5.7 release API and betting API throughout the reclaim.",
    lane: "fresh_forge",
    linkLabel: "Open Speed Observatory",
    linkUrl: "/speed",
    pinned: false,
    featuredOrder: 90,
    occurredAt: "2026-08-01T04:31:00.000Z",
  },
  {
    publicId: "06c38a3a-00f3-5acc-bbbc-87cc1daf1b5f",
    entryType: "image",
    title: "Watcher 1.5.7 receives a desktop and mobile standard.",
    summary:
      "Versioned desktop and portrait artwork now present the same release truth, with responsive Windows Installer and Profile Pairing hotspots aligned to each composition.",
    body:
      "App commit 223612f7583ece499c551a6ea62ae376ce5d0115 added the two versioned images and responsive click regions. Public bytes were verified against local SHA-256 evidence before the release was declared live.",
    lane: "fresh_forge",
    linkLabel: "See Watcher 1.5.7",
    linkUrl: "/download",
    pinned: true,
    featuredOrder: 900,
    occurredAt: "2026-08-01T04:27:32.000Z",
    mediaKind: "image",
    mediaUrl: "/watcher/watcher-v157-desktop.png",
    mediaAlt:
      "AoE2WAR Watcher 1.5.7 desktop release artwork",
  },
  {
    publicId: "5482d98b-270f-5eeb-906b-4c95e40b9b39",
    entryType: "deployment",
    title: "Watcher 1.5.7 binds every upload to immutable bytes.",
    summary:
      "A growing replay can continue changing on disk while one upload request keeps a single body, size, and fingerprint. Windows, macOS, Linux, and the direct ZIP now advertise the same live release.",
    body:
      "Watcher source c3d3af0a2c03a05d631b44eab773bf20650de0f8 captures one immutable in-memory replay snapshot per request. The multipart body, known length, x-file-size-bytes, and fingerprint are derived from those same bytes; source growth is rechecked afterward. Queue telemetry counts logical replay/finality keys instead of retry noise. Windows builds were signed and timestamped; macOS remains unsigned; Linux ships as AppImage. App publication commit fd7db8ba04bb155ac8d727af4bc97b2951a4ada2 switched the public release contract to 1.5.7.",
    lane: "fresh_forge",
    linkLabel: "Download Watcher 1.5.7",
    linkUrl: "/download",
    pinned: true,
    featuredOrder: 800,
    occurredAt: "2026-08-01T04:04:18.000Z",
  },
  {
    publicId: "b95a0c0b-56b8-533a-819b-f59d29aafe6a",
    entryType: "design_decision",
    title: "Final proof stays visible without reopening betting.",
    summary:
      "An unresolved watcher final may remain visible for a bounded 15-minute proof window, preserving the battle context while markets, betting CTAs, and settlement authority stay closed.",
    body:
      "The final-proof visibility rail was defined in d2a46cc, implemented in 85b11ea, and sealed in d7dcc9e. Trusted finals bypass the hold and move to Completed. The hold changes presentation only: it never downgrades final transport evidence, reopens a book, or authorizes settlement without canonical result truth.",
    lane: "fresh_forge",
    linkLabel: "Open Live Games",
    linkUrl: "/live-games",
    pinned: false,
    featuredOrder: 80,
    occurredAt: "2026-07-31T01:42:39.000Z",
  },
  {
    publicId: "c1d8efd7-140d-5f45-8a1e-5fb73e59396e",
    entryType: "deployment",
    title: "Bet and replay reliability closes the stale wager rails.",
    summary:
      "Trusted 1v1 results, bounded final-proof refunds, structured-result precedence, separated bonus rewards, and truthful settlement/resolution queues now share one fail-closed lifecycle.",
    body:
      "The reliability sequence spans 3660cf6, 9652532, 2974eff, 13be6d8, 74cb39e, 32be8b7, and release record 375f876. It cleared the historical active wager backlog, kept real roster or proposition conflicts visible, separated optional rewards from bettor liability, and appended unresolved successors for 538 false-resolved projections without granting result or betting authority.",
    lane: "fresh_forge",
    linkLabel: "Open Betting",
    linkUrl: "/bets",
    pinned: true,
    featuredOrder: 700,
    occurredAt: "2026-07-29T21:09:29.000Z",
  },
  {
    publicId: "7010d908-1187-5845-b8e0-4605c975cb2b",
    entryType: "milestone",
    title: "The leaderboard learns account grain and persistent B/A/E views.",
    summary:
      "The public board now distinguishes Warriors from Kingdom profiles, folds exact Steam evidence safely, and defaults new visitors to a refined Advanced presentation while preserving saved choices.",
    body:
      "Identity-safe leaderboard work runs through d4dc703, 812b359, 61bd8e8, 6447fd3, c8b11c0, and the release seals through 58f6ce6. The 2026-07-28 public snapshot contained 2,345 rows: 2,216 replay-backed exact-Steam rows, 124 public name-only replay rows, and five profile-only rows. Those are account and presentation grains, not a count of humans.",
    lane: "fresh_forge",
    linkLabel: "Open the Leaderboard",
    linkUrl: "/leaderboard",
    pinned: false,
    featuredOrder: 70,
    occurredAt: "2026-07-29T02:10:17.000Z",
  },
  {
    publicId: "e0289e94-e06d-50fb-9a3a-a25e8563aad6",
    entryType: "milestone",
    title: "Player Identity Wave 2 populates the provisional ledger.",
    summary:
      "Deterministic discovery populated exact account evidence and name-only ambiguity buckets without activating a claim, merging humans, or publishing an identity cutover.",
    body:
      "Foundation commit 59f4c86 and discovery commit a187aa5 produced 2,220 PlatformAccounts, 13,839 name observations, 126 provisional name-only buckets, 2,216 provisional Warriors, 2,216 proposed links, and 11 proposed claims. Active links, active claims, resolution runs, replay identity projections, and publications remain zero. The archive census also made every public count name its grain instead of treating files, ingestion rows, battles, accounts, names, and humans as interchangeable.",
    lane: "fresh_forge",
    linkLabel: "Inspect the Account-Grain Board",
    linkUrl: "/leaderboard",
    pinned: false,
    featuredOrder: 60,
    occurredAt: "2026-07-28T15:41:06.000Z",
  },
  {
    publicId: "a5da5aa3-da9f-5dd1-899d-c44f2d7d241e",
    entryType: "design_decision",
    title: "AoE2WAR gains a governed documentation control plane.",
    summary:
      "Architecture, product state, deployment truth, active contracts, historical evidence, and document authority now have explicit ownership and review rules.",
    body:
      "Commit fd39725 established the governed documentation baseline. The following releases registered canonical replay metrics, identity scope, leaderboard presentation, bet reliability, final-proof visibility, and Watcher telemetry so operational claims can point to a durable authority instead of drifting across chats and terminals.",
    lane: "fresh_forge",
    linkLabel: null,
    linkUrl: null,
    pinned: false,
    featuredOrder: 50,
    occurredAt: "2026-07-27T01:31:35.000Z",
  },
  {
    publicId: "7a928fc5-e5b9-5f71-853e-2562224c8cb5",
    entryType: "deployment",
    title: "Post-broadcast bet recovery receives exact fences.",
    summary:
      "Recovery now respects chain time, exact memos, frozen exposure, and corrected migration backfill rules while presenting one coherent betting lifecycle.",
    body:
      "The sequence 7beb2d5, abf7ae1, and 22232a0 repaired post-broadcast recovery without weakening custody. Recovery cannot claim unrelated transfers, and migration correction preserves exact evidence instead of broadening a match by convenience.",
    lane: "fresh_forge",
    linkLabel: "Review Betting",
    linkUrl: "/bets",
    pinned: false,
    featuredOrder: 40,
    occurredAt: "2026-07-26T04:52:51.000Z",
  },
  {
    publicId: "3b820172-08a9-593d-8dc6-2accc4d5c7a8",
    entryType: "milestone",
    title: "Replay statistics becomes an operations system.",
    summary:
      "Pass 8 added exact recorded-action observations, append-only normalized statistics, versioned aggregates, post-ingest parity, and a bounded Replay Operations Command Center.",
    body:
      "Commit c4aaa32 launched the replay statistics and operations system. The authority chain now stays explicit: bytes → archive → parser candidate → normalized statistics → result review → team-integrity gate → market reconciliation → chain settlement. Candidate work cannot become public result, betting, or settlement truth merely because parsing succeeded.",
    lane: "fresh_forge",
    linkLabel: "Open Game Stats",
    linkUrl: "/game-stats",
    pinned: false,
    featuredOrder: 30,
    occurredAt: "2026-07-25T23:42:00.000Z",
  },
  {
    publicId: "25dfa495-bd7d-5426-bb99-4aa916b423db",
    entryType: "build_note",
    title: "Recovered leaderboard and team-result contracts are repaired.",
    summary:
      "The preserved VPS work was converted into a clean production baseline, then recovered leaderboard and team-result readers were brought back under canonical replay truth.",
    body:
      "Commit 1ad32bc repaired the recovered leaderboard and team-result contracts immediately after the prior Workshop campaign baseline. That clean handoff is the first commit in the 44-commit audit range now summarized by Evidence in Motion.",
    lane: "fresh_forge",
    linkLabel: "Open Game Stats",
    linkUrl: "/game-stats",
    pinned: false,
    featuredOrder: 20,
    occurredAt: "2026-07-25T21:35:28.000Z",
  },
] as const;

const REQUIRED_APP_COMMITS = [
  "1ad32bc82ca72b8d21b678db728b0bf9578ed0a3",
  "c4aaa32de2e82b56194ad7da80508c7cbb96b44b",
  "7beb2d521abbcf3efdf1c7bb30df4ece2a82d277",
  "22232a0bcc038a567acd052f432883e70482a3f9",
  "fd39725eab132e77028825975063377523ae5052",
  "59f4c867367bc0b85d5060e6f3edf08f847cbe6b",
  "a187aa5cc5c9c613720e1f1955c9c81f77c6b192",
  "d4dc7037e829f8c65de5c3ffabe07fc27b96525c",
  "6447fd3cad63adb8886b8e982dca3550fba61c1e",
  "c8b11c0373f6b276b34870d535bda35d656a2ccf",
  "3660cf6038f4f51e52960e0fb83e6972c79008cd",
  "85b11ea419fb14f089500c16bb9cf8847fd685f9",
  "fd7db8ba04bb155ac8d727af4bc97b2951a4ada2",
  "223612f7583ece499c551a6ea62ae376ce5d0115",
] as const;

function readArgument(name: string) {
  const direct =
    process.argv.find(
      (value) =>
        value.startsWith(
          `${name}=`
        )
    );

  if (direct) {
    return direct.slice(
      name.length + 1
    );
  }

  const index =
    process.argv.indexOf(name);

  return index >= 0
    ? process.argv[index + 1] ?? null
    : null;
}

function git(...args: string[]) {
  return execFileSync(
    "git",
    args,
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
    }
  ).trim();
}

function auditAppCommits() {
  execFileSync(
    "git",
    [
      "merge-base",
      "--is-ancestor",
      PREVIOUS_CAMPAIGN_SHA,
      AUDITED_APP_HEAD,
    ],
    {
      cwd: process.cwd(),
      stdio: "ignore",
    }
  );

  execFileSync(
    "git",
    [
      "merge-base",
      "--is-ancestor",
      AUDITED_APP_HEAD,
      "HEAD",
    ],
    {
      cwd: process.cwd(),
      stdio: "ignore",
    }
  );

  const lines =
    git(
      "log",
      "--reverse",
      "--format=%H\t%s",
      `${PREVIOUS_CAMPAIGN_SHA}..${AUDITED_APP_HEAD}`
    )
      .split("\n")
      .filter(Boolean);

  if (
    lines.length !==
    EXPECTED_APP_COMMIT_COUNT
  ) {
    throw new Error(
      `Expected ${EXPECTED_APP_COMMIT_COUNT} audited app commits; found ${lines.length}.`
    );
  }

  const commits =
    lines.map((line) => {
      const separator =
        line.indexOf("\t");

      return {
        sha:
          line.slice(
            0,
            separator
          ),
        message:
          line.slice(
            separator + 1
          ),
      };
    });

  const commitSet =
    new Set(
      commits.map(
        (commit) =>
          commit.sha
      )
    );

  for (
    const required
    of REQUIRED_APP_COMMITS
  ) {
    if (
      !commitSet.has(required)
    ) {
      throw new Error(
        `Required app commit missing from audit range: ${required}`
      );
    }
  }

  return commits;
}

function desiredEntry(
  definition: EntryDefinition
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
      definition.mediaKind ?? null,
    mediaUrl:
      definition.mediaUrl ?? null,
    mediaAlt:
      definition.mediaAlt ?? null,
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
        definition.occurredAt
      ),
    createdByUid:
      OPERATOR_UID,
    updatedByUid:
      OPERATOR_UID,
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
  definition: EntryDefinition
) {
  const desired =
    desiredEntry(definition);

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
    existing.occurredAt.toISOString() ===
      desired.occurredAt.toISOString() &&
    existing.createdByUid === desired.createdByUid &&
    existing.updatedByUid === desired.updatedByUid
  );
}

async function plan() {
  const prisma =
    getPrisma();

  const publicIds =
    ENTRIES.map(
      (entry) =>
        entry.publicId
    );

  const [status, existing] =
    await Promise.all([
      prisma.workshopStatus.findUnique({
        where: {
          id: 1,
        },
        select: {
          id: true,
          headline: true,
          description: true,
          currentProject: true,
          updatedByUid: true,
        },
      }),
      prisma.workshopEntry.findMany({
        where: {
          publicId: {
            in: publicIds,
          },
        },
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

  if (!status) {
    throw new Error(
      "WorkshopStatus row 1 is missing."
    );
  }

  const byPublicId =
    new Map(
      existing.map(
        (entry) => [
          entry.publicId,
          entry,
        ]
      )
    );

  const actions =
    ENTRIES.map((definition) => {
      const current =
        byPublicId.get(
          definition.publicId
        );

      return {
        publicId:
          definition.publicId,
        title:
          definition.title,
        action:
          !current
            ? "create"
            : sameEntry(
                  current,
                  definition
                )
              ? "unchanged"
              : "update",
      };
    });

  const statusUnchanged =
    status.headline ===
      STATUS_UPDATE.headline &&
    status.description ===
      STATUS_UPDATE.description &&
    status.currentProject ===
      STATUS_UPDATE.currentProject &&
    status.updatedByUid ===
      STATUS_UPDATE.updatedByUid;

  return {
    statusAction:
      statusUnchanged
        ? "unchanged"
        : "update",
    actions,
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
        "SELECT pg_advisory_xact_lock(207702, 20260801)"
      );

      const status =
        await tx.workshopStatus.findUnique({
          where: {
            id: 1,
          },
          select: {
            id: true,
          },
        });

      if (!status) {
        throw new Error(
          "WorkshopStatus row 1 is missing."
        );
      }

      let created = 0;
      let updated = 0;

      for (
        const definition
        of ENTRIES
      ) {
        const existing =
          await tx.workshopEntry.findUnique({
            where: {
              publicId:
                definition.publicId,
            },
            select: {
              id: true,
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
        where: {
          id: 1,
        },
        data: STATUS_UPDATE,
      });

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
      maxWait: 10_000,
      timeout: 60_000,
    }
  );
}

async function verifyPublication() {
  const prisma =
    getPrisma();

  const [status, entries] =
    await Promise.all([
      prisma.workshopStatus.findUnique({
        where: {
          id: 1,
        },
        select: {
          headline: true,
          description: true,
          currentProject: true,
          updatedByUid: true,
        },
      }),
      prisma.workshopEntry.findMany({
        where: {
          publicId: {
            in: ENTRIES.map(
              (entry) =>
                entry.publicId
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
      STATUS_UPDATE.currentProject ||
    status.updatedByUid !==
      STATUS_UPDATE.updatedByUid
  ) {
    throw new Error(
      "Workshop status verification failed."
    );
  }

  if (
    entries.length !==
    ENTRIES.length
  ) {
    throw new Error(
      `Expected ${ENTRIES.length} published Workshop entries; found ${entries.length}.`
    );
  }

  return {
    status,
    entries:
      entries.sort(
        (left, right) =>
          left.title.localeCompare(
            right.title
          )
      ),
  };
}

async function main() {
  const apply =
    process.argv.includes("--apply");

  const auditOnly =
    process.argv.includes("--audit-only");

  const confirmation =
    readArgument("--confirm");

  if (
    apply &&
    confirmation !==
      APPLY_CONFIRMATION
  ) {
    throw new Error(
      `Apply mode requires --confirm ${APPLY_CONFIRMATION}`
    );
  }

  const commits =
    auditAppCommits();

  if (auditOnly) {
    process.stdout.write(
      `${JSON.stringify(
        {
          base:
            PREVIOUS_CAMPAIGN_SHA,
          head:
            AUDITED_APP_HEAD,
          count:
            commits.length,
          commits,
          watcherSourceSha:
            WATCHER_SOURCE_SHA,
        },
        null,
        2
      )}\n`
    );

    process.stdout.write(
      "PASS: WORKSHOP COMMIT AUDIT VERIFIED\n"
    );
    return;
  }

  const publicationPlan =
    await plan();

  const evidence = {
    mode:
      apply
        ? "apply"
        : "plan",
    appAudit: {
      base:
        PREVIOUS_CAMPAIGN_SHA,
      head:
        AUDITED_APP_HEAD,
      count:
        commits.length,
      first:
        commits.at(0),
      last:
        commits.at(-1),
      requiredAnchors:
        REQUIRED_APP_COMMITS,
    },
    watcherAudit: {
      sourceSha:
        WATCHER_SOURCE_SHA,
      version:
        "1.5.7",
    },
    workshop: {
      entries:
        ENTRIES.length,
      plan:
        publicationPlan,
    },
  };

  process.stdout.write(
    `${JSON.stringify(
      evidence,
      null,
      2
    )}\n`
  );

  if (!apply) {
    process.stdout.write(
      "PLAN ONLY: no Workshop rows were changed.\n"
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
      2
    )}\n`
  );

  process.stdout.write(
    "PASS: WORKSHOP EVIDENCE IN MOTION PUBLISHED\n"
  );
}

try {
  await main();
} finally {
  if (
    !process.argv.includes(
      "--audit-only"
    )
  ) {
    await getPrisma()
      .$disconnect();
  }
}
