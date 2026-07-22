import "server-only";

import { execFile } from "node:child_process";
import { chmod, mkdir, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import type { PrismaClient } from "@/lib/generated/prisma";

const API_ROOT = "/var/www/AoE2HDBets/api-prodn";
const PYTHON = `${API_ROOT}/venv/bin/python`;
const WORKER = `${API_ROOT}/scripts/run_replay_engine_room_job.py`;
const ARCHIVE_ROOT =
  "/mnt/HC_Volume_105319120/aoe2-replay-archive";
const WORK_ROOT = "/tmp/aoe2war-parser-on-demand";

const SAFE_REPLAY_EXTENSIONS = new Set([
  ".aoe2record",
  ".aoe2mpgame",
  ".mgz",
  ".mgx",
  ".mgl",
]);

const SHA256_RE = /^[0-9a-f]{64}$/;

export class ReplayParserOnDemandError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ReplayParserOnDemandError";
    this.status = status;
    this.code = code;
  }
}

type WorkerExecution = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function workerDetail(execution: WorkerExecution) {
  const detail = [
    execution.stdout.trim(),
    execution.stderr.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  return detail.slice(-3000);
}

function executeWorker(args: string[]): Promise<WorkerExecution> {
  return new Promise((resolve) => {
    execFile(
      PYTHON,
      [WORKER, ...args],
      {
        cwd: API_ROOT,
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONUNBUFFERED: "1",
        },
        encoding: "utf8",
        timeout: 300_000,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          exitCode:
            error && typeof error.code === "number"
              ? error.code
              : error
                ? 1
                : 0,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
        });
      }
    );
  });
}

async function locateArchiveReplay(
  replayHash: string,
  preferredFilename: string | null
) {
  const directory = join(
    ARCHIVE_ROOT,
    replayHash.slice(0, 2),
    replayHash.slice(2, 4)
  );

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new ReplayParserOnDemandError(
      404,
      "archive_directory_missing",
      "The immutable replay archive directory could not be found."
    );
  }

  const candidates = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith(`${replayHash}.`) &&
        SAFE_REPLAY_EXTENSIONS.has(extname(entry.name).toLowerCase())
    )
    .map((entry) => join(directory, entry.name));

  if (candidates.length === 0) {
    throw new ReplayParserOnDemandError(
      404,
      "archive_replay_missing",
      "The immutable replay bytes are not present in the canonical archive."
    );
  }

  const preferredExtension = preferredFilename
    ? extname(preferredFilename).toLowerCase()
    : "";

  if (preferredExtension) {
    const preferred = candidates.find(
      (candidate) =>
        extname(candidate).toLowerCase() === preferredExtension
    );
    if (preferred) return preferred;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  throw new ReplayParserOnDemandError(
    409,
    "archive_replay_ambiguous",
    "Multiple immutable archive objects match this replay hash."
  );
}

export async function runLatestReplayParserForGame(
  prisma: PrismaClient,
  gameStatsId: number,
  requestedByUid: string
) {
  const game = await prisma.gameStats.findUnique({
    where: { id: gameStatsId },
    select: {
      id: true,
      replayHash: true,
      original_filename: true,
      replay_file: true,
    },
  });

  if (!game) {
    throw new ReplayParserOnDemandError(
      404,
      "game_not_found",
      "Replay game not found."
    );
  }

  const replayHash = String(game.replayHash || "")
    .trim()
    .toLowerCase();

  if (!SHA256_RE.test(replayHash)) {
    throw new ReplayParserOnDemandError(
      409,
      "replay_hash_unavailable",
      "This battle does not have a canonical immutable replay hash."
    );
  }

  const preferredFilename =
    game.original_filename || game.replay_file || null;

  const archivePath = await locateArchiveReplay(
    replayHash,
    preferredFilename
  );

  const archiveRelativePath = relative(
    ARCHIVE_ROOT,
    archivePath
  );

  const extension = extname(archivePath).toLowerCase();

  await mkdir(WORK_ROOT, {
    recursive: true,
    mode: 0o700,
  });
  await chmod(WORK_ROOT, 0o700);

  // Stable filename + stable contents are intentional.
  // The Engine Room then derives the same job/run identity for
  // repeated clicks against the same parser identity.
  const manifestPath = join(
    WORK_ROOT,
    `game-${gameStatsId}-${replayHash}.csv`
  );

  const manifest = [
    [
      "logical_replay_key",
      "game_stats_id",
      "replay_hash",
      "extension",
      "archive_relative_path",
    ].join(","),
    [
      csvCell(`game_stats:${gameStatsId}`),
      csvCell(gameStatsId),
      csvCell(replayHash),
      csvCell(extension),
      csvCell(archiveRelativePath),
    ].join(","),
    "",
  ].join("\n");

  await writeFile(manifestPath, manifest, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(manifestPath, 0o600);

  const beforeRuns = await prisma.replayParseRun.findMany({
    where: { gameStatsId },
    select: { id: true },
  });

  const beforeIds = new Set(
    beforeRuns.map((run) => run.id)
  );

  const commonArgs = [
    "--manifest",
    manifestPath,
    "--archive-root",
    ARCHIVE_ROOT,
    "--batch-size",
    "1",
    "--max-artifacts-this-run",
    "1",
    "--concurrency",
    "1",
    "--worker-key",
    "aoe2war-web-review",
  ];

  // Reconciliation first. Strictly read-only.
  const plan = await executeWorker([
    ...commonArgs,
    "--mode",
    "plan",
  ]);

  if (plan.exitCode !== 0) {
    throw new ReplayParserOnDemandError(
      409,
      "parser_plan_failed",
      workerDetail(plan) ||
        "The replay failed Engine Room reconciliation."
    );
  }

  // Candidate mode remains private/candidate-only by worker contract.
  const candidate = await executeWorker([
    ...commonArgs,
    "--mode",
    "candidate",
    "--requested-by-uid",
    requestedByUid,
  ]);

  const afterRuns = await prisma.replayParseRun.findMany({
    where: { gameStatsId },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    select: {
      id: true,
      runIdentityHash: true,
      parserName: true,
      parserVersion: true,
      passName: true,
      passVersion: true,
      schemaVersion: true,
      status: true,
      failureSignature: true,
      candidateOnly: true,
      affectsPublicAggregates: true,
      completedAt: true,
      createdAt: true,
    },
  });

  const createdRun =
    afterRuns.find((run) => !beforeIds.has(run.id)) ??
    null;

  const latestRun = createdRun ?? afterRuns[0] ?? null;

  // Exit 4 means the immutable parser pass was durably recorded
  // but the candidate itself failed. That is still valuable history.
  if (
    candidate.exitCode !== 0 &&
    candidate.exitCode !== 4
  ) {
    throw new ReplayParserOnDemandError(
      503,
      "parser_worker_failed",
      workerDetail(candidate) ||
        "The canonical parser worker did not complete."
    );
  }

  if (!latestRun) {
    throw new ReplayParserOnDemandError(
      500,
      "parser_run_missing",
      "The worker completed without a durable parser run."
    );
  }

  return {
    outcome: createdRun
      ? ("created" as const)
      : ("already_latest" as const),
    workerExitCode: candidate.exitCode,
    run: {
      ...latestRun,
      completedAt: latestRun.completedAt.toISOString(),
      createdAt: latestRun.createdAt.toISOString(),
    },
  };
}
