import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { Prisma } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";

const ROOT = process.cwd();

const CONFIG = JSON.parse(
  readFileSync("config/aoe2war-operations.json", "utf8"),
) as {
  finish?: {
    workshop_chronicler?: {
      enabled?: boolean;
      start_date?: string;
      timezone?: string;
      max_entries_per_workday?: number;
    };
  };
  development?: {
    shadow_database?: string;
  };
};

const POLICY = CONFIG.finish?.workshop_chronicler ?? {};
const ENABLED = POLICY.enabled !== false;
const START_DAY = POLICY.start_date || "2026-08-01";
const SHADOW_DATABASE =
  CONFIG.development?.shadow_database || "aoe2hdbets_shadow";
const TIME_ZONE = POLICY.timezone || "America/Edmonton";
const MAX_PER_DAY = Math.max(
  1,
  Math.min(4, POLICY.max_entries_per_workday ?? 4),
);

const OPERATOR_UID = "aoe2war-finish-chronicler";
const PROD_CONFIRMATION = "PUBLISH-AOE2WAR-WORKSHOP-CHRONICLE";
const SHADOW_CONFIRMATION = "PREVIEW-AOE2WAR-WORKSHOP-CHRONICLE";

type Commit = {
  sha: string;
  committedAt: string;
  day: string;
  subject: string;
  paths: string[];
};

type ExistingEntry = {
  id: number;
  publicId: string;
  title: string;
  occurredAt: Date;
  createdByUid: string | null;
};

type Topic = {
  key: string;
  label: string;
  headline: string;
  entryType: string;
  patterns: RegExp[];
};

type PlannedEntry = {
  publicId: string;
  day: string;
  topic: string;
  entryType: string;
  title: string;
  summary: string;
  body: string;
  lane: string;
  pinned: boolean;
  featuredOrder: number;
  occurredAt: Date;
  commits: Commit[];
};

type DayPlan = {
  day: string;
  mode: "CREATE" | "UPDATE_AUTO" | "SKIP_MANUAL";
  existing: ExistingEntry[];
  automaticExisting: ExistingEntry[];
  entries: PlannedEntry[];
};

const TOPICS: Topic[] = [
  {
    key: "release_os",
    label: "AoE2WAR OS and release engineering",
    headline: "AoE2WAR's operating system gets stronger.",
    entryType: "milestone",
    patterns: [
      /aoe2war os/i,
      /release/i,
      /rollback/i,
      /doctor/i,
      /storage os/i,
      /performance os/i,
      /operator/i,
      /workspace os/i,
      /recovery os/i,
      /host os/i,
      /documentation os/i,
      /deploy/i,
      /scripts\/aoe2_/i,
      /bin\/aoe2war/i,
    ],
  },
  {
    key: "leaderboard",
    label: "Living Leaderboard",
    headline: "The Living Leaderboard evolves.",
    entryType: "deployment",
    patterns: [/leaderboard/i, /spotlight/i, /rank scroll/i, /hd leaderboard/i],
  },
  {
    key: "clans",
    label: "Clan Hall and clan systems",
    headline: "Clan Hall grows into a real social space.",
    entryType: "deployment",
    patterns: [/clan/i, /hall scribe/i, /warhouse/i, /components\/clan/i, /app\/clans/i],
  },
  {
    key: "social",
    label: "Direct Chat and social systems",
    headline: "Direct Chat and social tools get sharper.",
    entryType: "deployment",
    patterns: [
      /direct chat/i,
      /social/i,
      /inbox/i,
      /contact/i,
      /direct_message/i,
      /components\/contact/i,
    ],
  },
  {
    key: "presence",
    label: "Living Kingdom presence",
    headline: "The Living Kingdom comes alive.",
    entryType: "milestone",
    patterns: [/living kingdom/i, /kingdom-presence/i, /presence/i],
  },
  {
    key: "players",
    label: "Players, profiles, and identity",
    headline: "Player identity and profiles get stronger.",
    entryType: "deployment",
    patterns: [
      /player registry/i,
      /profile/i,
      /war archive/i,
      /identity/i,
      /claimed/i,
      /players/i,
    ],
  },
  {
    key: "staking",
    label: "Staking and token safety",
    headline: "Staking safety gets hardened.",
    entryType: "deployment",
    patterns: [/staking/i, /stake/i, /reserve/i],
  },
  {
    key: "replay",
    label: "Replay, Watcher, and battle truth",
    headline: "Replay truth gets sharper.",
    entryType: "parser_discovery",
    patterns: [
      /watcher/i,
      /replay/i,
      /parser/i,
      /roster/i,
      /battle truth/i,
      /statistics/i,
      /game_stats/i,
    ],
  },
  {
    key: "traffic",
    label: "Traffic and observability",
    headline: "Traffic observability gets stronger.",
    entryType: "deployment",
    patterns: [/traffic/i, /observability/i, /speed observatory/i],
  },
  {
    key: "workshop",
    label: "The Workshop",
    headline: "The Workshop learns from the work.",
    entryType: "build_note",
    patterns: [/workshop/i, /chronicle/i],
  },
  {
    key: "i18n",
    label: "Languages and localization",
    headline: "The Kingdom reaches more languages.",
    entryType: "deployment",
    patterns: [/i18n/i, /spanish/i, /localization/i, /language/i, /translate/i],
  },
  {
    key: "marketplace",
    label: "Marketplace and Kingdom economy",
    headline: "The Kingdom market expands.",
    entryType: "deployment",
    patterns: [/marketplace/i, /market shop/i, /awning/i, /kingdom forge/i],
  },
  {
    key: "bets",
    label: "Betting and settlement",
    headline: "Betting rails get stronger.",
    entryType: "deployment",
    patterns: [/betting/i, /wager/i, /payout/i, /settlement/i, /\bbets?\b/i],
  },
];

const DEFAULT_TOPIC: Topic = {
  key: "kingdom",
  label: "AoE2WAR",
  headline: "The Kingdom moves forward.",
  entryType: "deployment",
  patterns: [],
};


type CuratedHistoricalEntry = {
  topic: string;
  entryType: string;
  title: string;
  summary: string;
  patterns: RegExp[];
};

const HISTORICAL_CURATED: Record<
  string,
  CuratedHistoricalEntry[]
> = {
  "2026-08-09": [
    {
      topic: "release_os",
      entryType: "milestone",
      title: "AoE2WAR gets a real release control plane.",
      summary:
        "Operator CLI, deploy locking, certified rollback, and receipt-driven activation turn shipping from a checklist into a governed system.",
      patterns: [
        /operator cli/i,
        /deploy lock/i,
        /rollback/i,
        /receipt-driven/i,
        /activation/i,
        /release hardening/i,
      ],
    },
    {
      topic: "release_os",
      entryType: "milestone",
      title: "Releases become risk-aware and recoverable.",
      summary:
        "Risk-aware gates, manifests, staging proofs, and recovery paths make uncertain releases easier to stop, diagnose, and safely resume.",
      patterns: [
        /risk-aware/i,
        /release gate/i,
        /manifest/i,
        /staging/i,
        /recovery/i,
      ],
    },
    {
      topic: "replay",
      entryType: "parser_discovery",
      title: "Watcher learns to leave uncertain team results uncertain.",
      summary:
        "Incomplete or disconnected team endings are classified as unresolved instead of being forced into a false winner.",
      patterns: [
        /watcher/i,
        /team final/i,
        /disconnect/i,
        /result unknown/i,
      ],
    },
  ],
  "2026-08-15": [
    {
      topic: "leaderboard",
      entryType: "deployment",
      title: "The Living Leaderboard gets a personal command view.",
      summary:
        "Viewport control, recent form, spotlight movement, personal positioning, and rank navigation receive a major polish pass.",
      patterns: [
        /leaderboard/i,
        /spotlight/i,
        /recent form/i,
        /personal view/i,
        /rank/i,
      ],
    },
    {
      topic: "release_os",
      entryType: "milestone",
      title: "Hot pages get dramatically smarter about speed.",
      summary:
        "Stale revalidation, prewarming, deterministic caching, and safer build/runtime limits cut repeat work from the hottest paths.",
      patterns: [
        /stale revalidation/i,
        /prewarm/i,
        /caching/i,
        /performance/i,
        /memory ceiling/i,
      ],
    },
    {
      topic: "players",
      entryType: "deployment",
      title: "Profiles and statistics get a cleanup pass.",
      summary:
        "The Basic player grid is stabilized while expensive statistics and Watcher-funnel queries move behind caching.",
      patterns: [
        /profile grid/i,
        /statistics/i,
        /watcher funnel/i,
      ],
    },
  ],
  "2026-08-16": [
    {
      topic: "clans",
      entryType: "deployment",
      title: "Clan Hall opens its doors.",
      summary:
        "Clan Hall moves from concept to a live social room with invitations and a real entrance into the clan experience.",
      patterns: [
        /live hall/i,
        /invitation door/i,
        /invitation/i,
      ],
    },
    {
      topic: "clans",
      entryType: "deployment",
      title: "Clan identity gets a cleaner home.",
      summary:
        "The clan experience gets a stronger default presentation and a dedicated display rail without losing the Hall's personality.",
      patterns: [
        /blue default/i,
        /display rail/i,
        /clan/i,
      ],
    },
  ],
  "2026-08-17": [
    {
      topic: "replay",
      entryType: "deployment",
      title: "Watcher identity and replay truth get tightened.",
      summary:
        "Financial-market identity and replay evidence are aligned more carefully so the right player and the right game truth stay connected.",
      patterns: [
        /watcher/i,
        /financial market identity/i,
        /replay truth/i,
      ],
    },
    {
      topic: "i18n",
      entryType: "deployment",
      title: "Private chat speaks more of the Kingdom's languages.",
      summary:
        "Direct chat translation and full-site Spanish support take a major step forward while Hall Scribe identity work lands beside them.",
      patterns: [
        /translation/i,
        /spanish/i,
        /openai provider/i,
        /scribe/i,
      ],
    },
  ],
  "2026-08-18": [
    {
      topic: "release_os",
      entryType: "milestone",
      title: "AoE2WAR OS takes over storage and safer maintenance.",
      summary:
        "Storage OS becomes a governed subsystem, and maintenance isolation is tightened so background work yields before protected Wolo runtime health.",
      patterns: [
        /storage os/i,
        /maintenance/i,
        /wolo/i,
      ],
    },
    {
      topic: "marketplace",
      entryType: "deployment",
      title: "Marketplace Business V1 and Gray Dot V2 ship.",
      summary:
        "The business layer and Gray Dot observability arrive together with stronger activation recovery and clearer operator visibility.",
      patterns: [
        /marketplace business/i,
        /gray dot/i,
        /activation/i,
        /operator readout/i,
      ],
    },
    {
      topic: "marketplace",
      entryType: "deployment",
      title: "Marketplace rendering moves off the critical path.",
      summary:
        "Database-backed Marketplace rendering is deferred to request time so slower work does not unnecessarily hold the page open.",
      patterns: [
        /marketplace/i,
        /request time/i,
        /database rendering/i,
      ],
    },
  ],
  "2026-08-20": [
    {
      topic: "leaderboard",
      entryType: "deployment",
      title: "The Living Leaderboard gets a sharper focus rail.",
      summary:
        "Sticky table behavior, spotlight centering, presence polish, and cleaner rank scrolling make the board easier to command.",
      patterns: [
        /leaderboard/i,
        /focus rail/i,
        /sticky/i,
        /spotlight/i,
        /rank scrolling/i,
      ],
    },
    {
      topic: "release_os",
      entryType: "milestone",
      title: "Privacy and operator contracts get hardened.",
      summary:
        "Knowledge/privacy contracts and operator documentation are tightened around the systems built during the week.",
      patterns: [
        /privacy/i,
        /operator documentation/i,
        /kkr/i,
      ],
    },
  ],
  "2026-08-21": [
    {
      topic: "presence",
      entryType: "milestone",
      title: "The Living Kingdom comes alive.",
      summary:
        "AoE2WAR gains an ambient presence layer that makes the Kingdom feel inhabited without turning movement into permanent tracking.",
      patterns: [
        /living kingdom/i,
        /presence/i,
      ],
    },
    {
      topic: "release_os",
      entryType: "milestone",
      title: "The systems behind the Kingdom become easier to understand and operate.",
      summary:
        "AI knowledge topology, operator controls, and architecture documentation grow into a clearer map of how the Kingdom actually works.",
      patterns: [
        /ai knowledge/i,
        /topology/i,
        /operator/i,
        /architecture/i,
      ],
    },
  ],
  "2026-08-22": [
    {
      topic: "release_os",
      entryType: "milestone",
      title: "AoE2WAR OS V1.2 learns to ship itself.",
      summary:
        "Feature worktrees, production-shaped local data, digest-bound validation reuse, and self-hosting finish turn the release system into a much more complete operating layer.",
      patterns: [
        /aoe2war os v1\\.2/i,
        /feature worktree/i,
        /shadow/i,
        /validation/i,
        /finish/i,
      ],
    },
    {
      topic: "social",
      entryType: "deployment",
      title: "Direct Chat reactions, replies, and edits become reliable.",
      summary:
        "The portalled message-action lifecycle is fixed and browser-proven across both Nav Chat and Full Chat.",
      patterns: [
        /direct chat/i,
        /portalled/i,
        /message actions/i,
      ],
    },
    {
      topic: "clans",
      entryType: "deployment",
      title: "Clan social tools and the Player Registry get a polish pass.",
      summary:
        "Clan Hall social chat, invitation media, and player-registry presentation all receive another round of refinement.",
      patterns: [
        /clan/i,
        /social media/i,
        /player registry/i,
      ],
    },
    {
      topic: "staking",
      entryType: "deployment",
      title: "Staking safety gets an explicit pause control.",
      summary:
        "The staking safety state becomes visible and configurable so protective pauses are clear instead of implicit.",
      patterns: [
        /staking/i,
        /safety pause/i,
      ],
    },
  ],
};


const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = dayFormatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function git(args: string[]) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function loadCommits() {
  const raw = git([
    "log",
    `--since=${START_DAY}T00:00:00-06:00`,
    "--pretty=format:%H%x1f%cI%x1f%s%x1e",
  ]);

  if (!raw) return [] as Commit[];

  return raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, committedAt, subject] = record.split("\x1f");
      return {
        sha,
        committedAt,
        day: dayKey(committedAt),
        subject: subject.trim(),
        paths: [],
      };
    });
}

function pathsForCommit(sha: string) {
  const raw = git([
    "show",
    "--pretty=format:",
    "--name-only",
    "--no-renames",
    sha,
  ]);

  return raw
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isNoiseSubject(subject: string) {
  return (
    /^merge pull request\b/i.test(subject) ||
    /^refresh .*documentation baseline/i.test(subject) ||
    /^refresh app-prodn documentation baseline/i.test(subject) ||
    /^document release implementation/i.test(subject) ||
    /^docs:\s*(refresh|seal|record)\b/i.test(subject)
  );
}

function normalizeSubject(subject: string) {
  let value = subject.trim();

  value = value.replace(
    /^(feat|fix|docs|style|refactor|test|chore|hotfix)(\([^)]*\))?:\s*/i,
    "",
  );
  value = value.replace(/^p\d+\s*:\s*/i, "");

  if (!value) return "";

  value = value[0].toUpperCase() + value.slice(1);

  if (!/[.!?]$/.test(value)) {
    value += ".";
  }

  return value;
}

function topicFor(commit: Commit) {
  const haystack = [
    commit.subject,
    ...commit.paths,
  ].join("\n");

  for (const topic of TOPICS) {
    if (topic.patterns.some((pattern) => pattern.test(haystack))) {
      return topic;
    }
  }

  return DEFAULT_TOPIC;
}

function deterministicUuid(seed: string) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function meaningfulCommits(commits: Commit[]) {
  const filtered = commits.filter(
    (commit) => !isNoiseSubject(commit.subject),
  );

  return filtered.length ? filtered : commits;
}

function chooseTitle(topic: Topic, commits: Commit[]) {
  const haystack = commits
    .flatMap((commit) => [commit.subject, ...commit.paths])
    .join("\n");

  const rules: Array<[RegExp, string]> = [
    [
      /leaderboard[\s\S]*(focus|spotlight|viewport|sticky)/i,
      "The Living Leaderboard gets a sharper view.",
    ],
    [
      /leaderboard[\s\S]*(cache|switch|instant|stale)/i,
      "The Living Leaderboard gets faster.",
    ],
    [
      /clan[\s\S]*(hall|invite|invitation)/i,
      "Clan Hall gets more alive.",
    ],
    [
      /direct chat|direct_message|components\/contact/i,
      "Direct Chat gets smoother.",
    ],
    [
      /storage[\s\S]*(os|maintenance)/i,
      "AoE2WAR OS takes care of more of the boring work.",
    ],
    [
      /release|rollback|deploy|finish/i,
      "Shipping AoE2WAR gets safer and more automatic.",
    ],
    [
      /workshop|chronicle/i,
      "The Workshop learns to tell its own story.",
    ],
  ];

  for (const [pattern, title] of rules) {
    if (pattern.test(haystack)) return title;
  }

  return topic.headline;
}


function buildClusters(commits: Commit[]) {
  const byTopic = new Map<string, { topic: Topic; commits: Commit[] }>();

  for (const commit of commits) {
    const topic = topicFor(commit);
    const current = byTopic.get(topic.key) || {
      topic,
      commits: [],
    };

    current.commits.push(commit);
    byTopic.set(topic.key, current);
  }

  const groups = [...byTopic.values()]
    .map((group) => ({
      ...group,
      commits: [...group.commits].sort(
        (a, b) =>
          new Date(b.committedAt).getTime() -
          new Date(a.committedAt).getTime(),
      ),
    }))
    .sort(
      (a, b) =>
        b.commits.length - a.commits.length ||
        new Date(b.commits[0].committedAt).getTime() -
          new Date(a.commits[0].committedAt).getTime(),
    );

  const selected = groups.slice(0, MAX_PER_DAY);
  const overflow = groups
    .slice(selected.length)
    .flatMap((group) => group.commits);

  if (selected.length && overflow.length) {
    selected[selected.length - 1].commits.push(...overflow);
    selected[selected.length - 1].commits.sort(
      (a, b) =>
        new Date(b.committedAt).getTime() -
        new Date(a.committedAt).getTime(),
    );
  }

  return selected.map((group) => ({
    topic: group.topic,
    part: 0,
    commits: group.commits,
  }));
}


function buildEntry(
  day: string,
  slot: number,
  topic: Topic,
  part: number,
  commits: Commit[],
): PlannedEntry {
  const title = chooseTitle(topic, commits);
  const supporting = commits
    .map((commit) => normalizeSubject(commit.subject))
    .filter(
      (subject) =>
        subject &&
        subject !== title &&
        !/^Finish AoE2WAR work\.?$/i.test(subject),
    )
    .slice(0, 3);

  const summary =
    supporting.length > 0
      ? `${topic.label} moved forward. ${supporting
          .slice(0, 2)
          .join(" ")}`
      : `${topic.label} moved forward through a certified AoE2WAR release.`;

  const evidence = commits
    .slice(0, 16)
    .map(
      (commit) =>
        `• ${commit.sha.slice(0, 12)} — ${commit.subject}`,
    )
    .join("\n");

  const bodyLines = [
    `AoE2WAR Finish distilled this ${day} work into a public Chronicle record instead of exposing raw deployment noise.`,
    "What changed",
    ...commits
      .slice(0, 8)
      .map(
        (commit) =>
          `• ${normalizeSubject(commit.subject) || topic.headline}`,
      ),
    "Source evidence",
    evidence,
  ];

  if (commits.length > 16) {
    bodyLines.push(
      `• …and ${commits.length - 16} additional source commit(s) in this grouped workstream.`,
    );
  }

  bodyLines.push(
    "This record is maintained idempotently by AoE2WAR Finish. Additional releases on the same local workday refine the same small set of public headings instead of creating one entry per deploy.",
  );

  const latest = commits
    .map((commit) => new Date(commit.committedAt))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const start = new Date(`${START_DAY}T00:00:00-06:00`);
  const dayDate = new Date(`${day}T12:00:00-06:00`);
  const dayOffset = Math.max(
    0,
    Math.floor((dayDate.getTime() - start.getTime()) / 86_400_000),
  );

  return {
    publicId: deterministicUuid(
      `aoe2war-workshop:${day}:${topic.key}:${part}`,
    ),
    day,
    topic: topic.key,
    entryType: topic.entryType,
    title,
    summary,
    body: bodyLines.join("\n\n"),
    lane: "fresh_forge",
    pinned: false,
    featuredOrder: 3000 + dayOffset * 10 + slot,
    occurredAt: latest,
    commits,
  };
}

function localEnvValue(name: string) {
  try {
    const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#") || !line.includes("=")) {
        continue;
      }

      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();

      if (key !== name) continue;

      let value = line.slice(separator + 1).trim();

      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }

      return value;
    }
  } catch {
    return "";
  }

  return "";
}

function configureShadowDatabaseUrl() {
  const raw =
    process.env.DATABASE_URL?.trim() ||
    localEnvValue("DATABASE_URL");

  if (!raw) {
    throw new Error(
      "Shadow apply requires a local DATABASE_URL template.",
    );
  }

  const normalized = raw.replace(
    "postgresql+asyncpg://",
    "postgresql://",
  );
  const url = new URL(normalized);

  if (
    ![
      "",
      "localhost",
      "127.0.0.1",
      "::1",
    ].includes(url.hostname)
  ) {
    throw new Error(
      `Refusing Workshop Chronicler shadow apply because DATABASE_URL host=${url.hostname || "unknown"} is not local.`,
    );
  }

  url.pathname = `/${SHADOW_DATABASE}`;
  process.env.DATABASE_URL = url.toString();

  delete process.env.AOE2WAR_PROD_DB_PREVIEW;
}


function topicByKey(key: string) {
  return TOPICS.find((topic) => topic.key === key) ?? DEFAULT_TOPIC;
}

function buildCuratedEntries(
  day: string,
  commits: Commit[],
  specs: CuratedHistoricalEntry[],
) {
  const remaining = [...commits];
  const results: PlannedEntry[] = [];

  specs.forEach((spec, index) => {
    const isLast = index === specs.length - 1;

    let selected = isLast
      ? [...remaining]
      : remaining.filter((commit) => {
          const haystack = [
            commit.subject,
            ...commit.paths,
          ].join("\n");

          return spec.patterns.some((pattern) =>
            pattern.test(haystack),
          );
        });

    if (!selected.length && remaining.length) {
      selected = [remaining[0]];
    }

    const selectedIds = new Set(
      selected.map((commit) => commit.sha),
    );

    for (let cursor = remaining.length - 1; cursor >= 0; cursor -= 1) {
      if (selectedIds.has(remaining[cursor].sha)) {
        remaining.splice(cursor, 1);
      }
    }

    if (!selected.length) return;

    const base = buildEntry(
      day,
      index + 1,
      topicByKey(spec.topic),
      index,
      selected,
    );

    results.push({
      ...base,
      publicId: deterministicUuid(
        `aoe2war-workshop:${day}:curated:${index + 1}`,
      ),
      entryType: spec.entryType,
      title: spec.title,
      summary: spec.summary,
    });
  });

  return results;
}


async function assertDatabase(mode: "production" | "shadow") {
  const rows =
    await getPrisma().$queryRaw<Array<{ database_name: string }>>`
      SELECT current_database() AS database_name
    `;

  const actual = rows[0]?.database_name || "";
  const expected =
    mode === "production"
      ? "aoe2hd_db"
      : SHADOW_DATABASE;

  if (actual !== expected) {
    throw new Error(
      `Refusing Workshop Chronicler ${mode} apply; current database=${actual || "unknown"} expected=${expected}.`,
    );
  }
}

function attachPaths(commits: Commit[]) {
  return commits.map((commit) => ({
    ...commit,
    paths: pathsForCommit(commit.sha),
  }));
}

async function buildPlan() {
  const prisma = getPrisma();
  const allCommits = loadCommits();
  const commitsByDay = new Map<string, Commit[]>();

  for (const commit of allCommits) {
    const current = commitsByDay.get(commit.day) || [];
    current.push(commit);
    commitsByDay.set(commit.day, current);
  }

  const existing = await prisma.workshopEntry.findMany({
    where: {
      status: "published",
      visibility: "public",
      publishedAt: { not: null },
      occurredAt: {
        gte: new Date(`${START_DAY}T00:00:00-06:00`),
      },
    },
    select: {
      id: true,
      publicId: true,
      title: true,
      occurredAt: true,
      createdByUid: true,
    },
  });

  const existingByDay = new Map<string, ExistingEntry[]>();

  for (const entry of existing) {
    const day = dayKey(entry.occurredAt);
    const current = existingByDay.get(day) || [];
    current.push(entry);
    existingByDay.set(day, current);
  }

  const plans: DayPlan[] = [];

  for (const day of [...commitsByDay.keys()].sort()) {
    const dayExisting = existingByDay.get(day) || [];
    const automaticExisting = dayExisting.filter(
      (entry) => entry.createdByUid === OPERATOR_UID,
    );

    if (dayExisting.length > 0 && automaticExisting.length === 0) {
      plans.push({
        day,
        mode: "SKIP_MANUAL",
        existing: dayExisting,
        automaticExisting,
        entries: [],
      });
      continue;
    }

    const raw = meaningfulCommits(commitsByDay.get(day) || []);
    const commits = attachPaths(raw);
    const historical = HISTORICAL_CURATED[day];

    const entries = historical
      ? buildCuratedEntries(
          day,
          commits,
          historical,
        )
      : buildClusters(commits).map((cluster, index) =>
          buildEntry(
            day,
            index + 1,
            cluster.topic,
            cluster.part,
            cluster.commits,
          ),
        );

    plans.push({
      day,
      mode: automaticExisting.length ? "UPDATE_AUTO" : "CREATE",
      existing: dayExisting,
      automaticExisting,
      entries,
    });
  }

  return {
    allCommits,
    commitsByDay,
    plans,
  };
}

async function applyPlan(plan: Awaited<ReturnType<typeof buildPlan>>) {
  const prisma = getPrisma();
  const publishedAt = new Date();

  let created = 0;
  let updated = 0;
  let deleted = 0;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(207702, 20260823)",
      );

      for (const dayPlan of plan.plans) {
        if (dayPlan.mode === "SKIP_MANUAL") continue;

        const desiredIds = new Set(
          dayPlan.entries.map((entry) => entry.publicId),
        );
        const staleIds = dayPlan.automaticExisting
          .map((entry) => entry.publicId)
          .filter((publicId) => !desiredIds.has(publicId));

        if (staleIds.length) {
          const result = await tx.workshopEntry.deleteMany({
            where: {
              publicId: { in: staleIds },
              createdByUid: OPERATOR_UID,
            },
          });
          deleted += result.count;
        }

        for (const entry of dayPlan.entries) {
          const existing =
            await tx.workshopEntry.findUnique({
              where: { publicId: entry.publicId },
              select: { publishedAt: true },
            });

          const data = {
            publicId: entry.publicId,
            entryType: entry.entryType,
            title: entry.title,
            summary: entry.summary,
            body: entry.body,
            dialogue: [] as Prisma.InputJsonValue,
            lane: entry.lane,
            status: "published",
            visibility: "public",
            mediaKind: null,
            mediaUrl: null,
            mediaAlt: null,
            linkLabel: "Open the Workshop",
            linkUrl: "/workshop",
            pinned: entry.pinned,
            featuredOrder: entry.featuredOrder,
            occurredAt: entry.occurredAt,
            createdByUid: OPERATOR_UID,
            updatedByUid: OPERATOR_UID,
          };

          if (existing) {
            await tx.workshopEntry.update({
              where: { publicId: entry.publicId },
              data: {
                ...data,
                publishedAt: existing.publishedAt ?? publishedAt,
              },
            });
            updated += 1;
          } else {
            await tx.workshopEntry.create({
              data: {
                ...data,
                publishedAt,
              },
            });
            created += 1;
          }
        }
      }
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );

  return { created, updated, deleted };
}

async function verifyCoverage(
  plan: Awaited<ReturnType<typeof buildPlan>>,
) {
  const prisma = getPrisma();

  const published = await prisma.workshopEntry.findMany({
    where: {
      status: "published",
      visibility: "public",
      publishedAt: { not: null },
      occurredAt: {
        gte: new Date(`${START_DAY}T00:00:00-06:00`),
      },
    },
    select: {
      publicId: true,
      occurredAt: true,
      createdByUid: true,
    },
  });

  const publicDays = new Set(
    published.map((entry) => dayKey(entry.occurredAt)),
  );
  const commitDays = new Set(plan.commitsByDay.keys());

  const remainingGapDays = [...commitDays]
    .filter((day) => !publicDays.has(day))
    .sort();

  const currentDay = dayKey(new Date());
  const currentDayPublicIds = published
    .filter(
      (entry) =>
        dayKey(entry.occurredAt) === currentDay &&
        entry.createdByUid === OPERATOR_UID,
    )
    .map((entry) => entry.publicId);

  if (remainingGapDays.length) {
    throw new Error(
      `Workshop Chronicle still has uncovered Git workdays: ${remainingGapDays.join(", ")}`,
    );
  }

  return {
    commitDays: commitDays.size,
    publicDays: publicDays.size,
    remainingGapDays,
    currentDay,
    currentDayPublicIds,
  };
}

function auditReleaseSha(expected: string) {
  const actual = git(["rev-parse", "HEAD"]);
  if (!expected || actual !== expected) {
    throw new Error(
      `Workshop Chronicler release SHA mismatch; expected=${expected || "missing"} actual=${actual}`,
    );
  }
}

async function main() {
  if (!ENABLED) {
    console.log(
      JSON.stringify({
        status: "DISABLED",
        reason: "finish.workshop_chronicler.enabled=false",
      }),
    );
    return;
  }

  const applyProduction = process.argv.includes("--apply");
  const applyShadow = process.argv.includes("--apply-shadow");
  const jsonMode = process.argv.includes("--json");

  if (applyProduction && applyShadow) {
    throw new Error("Choose only one Workshop Chronicler apply mode.");
  }

  const confirmIndex = process.argv.indexOf("--confirm");
  const confirmation =
    confirmIndex >= 0 ? process.argv[confirmIndex + 1] || "" : "";

  const releaseIndex = process.argv.indexOf("--release-sha");
  const releaseSha =
    releaseIndex >= 0 ? process.argv[releaseIndex + 1] || "" : "";

  if (applyProduction) {
    if (confirmation !== PROD_CONFIRMATION) {
      throw new Error(
        `Production apply requires --confirm ${PROD_CONFIRMATION}`,
      );
    }
    auditReleaseSha(releaseSha);
    await assertDatabase("production");
  } else if (applyShadow) {
    if (confirmation !== SHADOW_CONFIRMATION) {
      throw new Error(
        `Shadow apply requires --confirm ${SHADOW_CONFIRMATION}`,
      );
    }

    configureShadowDatabaseUrl();
    await assertDatabase("shadow");
  }

  const plan = await buildPlan();

  const planSummary = plan.plans.map((day) => ({
    day: day.day,
    mode: day.mode,
    existingCount: day.existing.length,
    entries: day.entries.map((entry) => ({
      publicId: entry.publicId,
      topic: entry.topic,
      title: entry.title,
      sourceCommits: entry.commits.map(
        (commit) => commit.sha.slice(0, 12),
      ),
    })),
  }));

  if (!applyProduction && !applyShadow) {
    const payload = {
      status: "PLAN",
      timezone: TIME_ZONE,
      startDay: START_DAY,
      maxEntriesPerWorkday: MAX_PER_DAY,
      days: planSummary,
    };

    console.log(
      jsonMode
        ? JSON.stringify(payload)
        : JSON.stringify(payload, null, 2),
    );
    return;
  }

  const mutation = await applyPlan(plan);
  const coverage = await verifyCoverage(plan);

  const payload = {
    status: "PASS",
    mode: applyProduction ? "PRODUCTION" : "SHADOW",
    timezone: TIME_ZONE,
    startDay: START_DAY,
    mutation,
    coverage,
    days: planSummary,
  };

  console.log(
    jsonMode
      ? JSON.stringify(payload)
      : JSON.stringify(payload, null, 2),
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
