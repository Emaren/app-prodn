/** Read-only Workshop-grain receipt yield census. No apply mode exists.
 * Run with the AoE2 alias loader, explicit private receipt directory, and the
 * governed API planner checkout. Every fresh plan remains candidate evidence.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, realpath, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type ObjectRow = Record<string, any>;
const MODERN_SCHEMA = "aoe2war-watcher-final-observation/v1";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Necessary quorum conditions only. Passing this filter grants no authority;
 * the API evaluator and byte-reparsing planner make the actual decision.
 */
export function potentialModernQuorum(values: unknown[]) {
  const rows = values.filter((value): value is ObjectRow => Boolean(value && typeof value === "object" &&
    !Array.isArray(value) && (value as ObjectRow).schema === MODERN_SCHEMA));
  const distinct = (field: string) => new Set(rows.map((r) => r[field]).filter((v) => typeof v === "string" && v)).size;
  return rows.length >= 2 && distinct("uploader_uid") >= 2 && distinct("watcher_session_hash") >= 2 &&
    distinct("replay_hash") >= 2 && distinct("participant_side_hash") >= 2;
}

export function parseCensusArguments(args: string[]) {
  const options: Record<string, string> = {};
  const names = new Set(["--api-root", "--python", "--archive-dir", "--receipt-dir", "--max-plans"]);
  for (let i = 0; i < args.length; i += 2) {
    if (!names.has(args[i]) || !args[i + 1] || options[args[i]]) throw new Error("invalid_census_argument");
    options[args[i]] = args[i + 1];
  }
  for (const key of ["--api-root", "--python", "--archive-dir", "--receipt-dir"]) {
    if (!options[key] || !isAbsolute(options[key])) throw new Error("absolute_runtime_paths_required");
  }
  const maxPlans = Number(options["--max-plans"] ?? "32");
  if (!Number.isSafeInteger(maxPlans) || maxPlans < 0 || maxPlans > 256) throw new Error("max_plans_must_be_0_to_256");
  return { apiRoot: options["--api-root"], pythonExecutable: options["--python"],
    archiveDirectory: options["--archive-dir"], receiptDirectory: options["--receipt-dir"], maxPlans };
}

export function projectedYield(corpus: ObjectRow, cases: ObjectRow[]) {
  const eligible = cases.filter((row) => row.outcome === "eligible");
  const gain = eligible.filter((row) => row.rosterComplete && !row.resultEligible);
  const numerator = corpus.logicalBattleTruthComplete + gain.length;
  return { eligibleGameStatsIds: eligible.map((r) => r.gameStatsId),
    projectedFullTruthGainIds: gain.map((r) => r.gameStatsId),
    projectedCurrentPlayerGainIds: gain.filter((r) => r.registeredPlayerIds.length).map((r) => r.gameStatsId),
    projectedNumerator: numerator, projectedDenominator: corpus.uniqueLogicalBattles,
    projectedPercent: corpus.uniqueLogicalBattles ? 100 * numerator / corpus.uniqueLogicalBattles : 0,
    currentResolvedNumerator: corpus.logicalBattleTruthComplete, eligibleModernReceiptAdditions: gain.length,
    currentPercent: corpus.uniqueLogicalBattles ? 100 * corpus.logicalBattleTruthComplete / corpus.uniqueLogicalBattles : 0,
    percentagePointGain: corpus.uniqueLogicalBattles ? 100 * gain.length / corpus.uniqueLogicalBattles : 0,
    newlyResolvedGames: 0, resultAuthorityGranted: false, bettingAuthority: false,
    settlementAuthority: false, woloAuthority: false };
}

export function blockerCategory(reason: string) {
  if (/no_supported_modern_receipt|no_eligible_observations/.test(reason)) return "no_supported_modern_signed_receipt";
  if (/quorum|independent_cross_side|distinct_|same_side/.test(reason)) return "insufficient_cross_side_quorum";
  if (/roster|uploader_binding|uploader_account|participant_bound|ambiguous_uploader/.test(reason)) return "roster_identity";
  if (/topology|participant_side|winner_membership|winning_side/.test(reason)) return "topology";
  if (/platform|logical_battle|outer_receipt_identity|outer_receipt_played_on|final_target|target_game/.test(reason)) return "logical_battle_identity";
  if (/archive_|source_hash|source_archive/.test(reason)) return "archive_missing_or_mismatch";
  if (/adjudication|desync|disconnected|alias_disconnect/.test(reason)) return "preexisting_adjudication_desync_review";
  if (/expired|future_|source_snapshot_changed|inventory_changed|battle_source_changed|fresh_plan|freshness/.test(reason)) return "freshness_or_source_mutation";
  if (/parser_|fresh_receipt_claim|malformed_or_ineligible|unsupported_receipt_schema|outer_attempt|receipt_file_role/.test(reason)) return "parser_contract_or_evidence_mismatch";
  return "other";
}

export function finalizeCensusCases(cases: ObjectRow[], changedBattleIds: Set<number>) {
  return cases.map((row) =>
    row.outcome === "eligible" && changedBattleIds.has(row.gameStatsId)
      ? {
          ...row,
          outcome: "blocked",
          reason: "battle_source_changed_during_census",
          previousOutcome: "eligible",
        }
      : row,
  );
}

async function persistReport(directory: string, report: ObjectRow) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error("receipt_directory_not_private");
  const bytes = JSON.stringify(report) + "\n";
  const sha256 = digest(bytes);
  const path = join(await realpath(directory), `yield-${sha256}.json`);
  const file = await open(path, "wx", 0o400);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  const parent = await open(directory, "r");
  try { await parent.sync(); } finally { await parent.close(); }
  return { path, sha256 };
}

export async function runCensus(options: ReturnType<typeof parseCensusArguments>) {
  // Set before constructing the Prisma pool. Its PostgreSQL default is hard
  // read-only, including all later dry-run writer snapshot reads.
  process.env.AOE2WAR_PROD_DB_PREVIEW = "true";
  const [{ getPrisma }, adjudications, truth, roster, archive, identity, view, promotion] = await Promise.all([
    import("../lib/prisma.ts"), import("../lib/replayAdjudications.ts"),
    import("../lib/publicReplayTruth.ts"), import("../lib/publicReplayRosterV2.ts"),
    import("../lib/publicBattleArchiveEligibility.ts"), import("../lib/leaderboardIdentity.ts"),
    import("../lib/gameStatsView.ts"), import("../lib/watcherReceiptPromotion.ts"),
  ]);
  const prisma = getPrisma();
  const readOnly = async (db: any) => {
    const [state] = await db.$queryRawUnsafe("SELECT current_setting('transaction_read_only') AS transaction_mode, current_setting('default_transaction_read_only') AS default_mode");
    if (state?.transaction_mode !== "on" || state?.default_mode !== "on") throw new Error("database_not_read_only");
    return state;
  };
  try {
    const loadInventory = () => prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const databaseReadOnly = await readOnly(tx);
      // Same fields/order and public helpers as parserObservatory.loadCorpusRows.
      // This metric deliberately excludes raw ingestion-row census counts.
      const raw = await tx.gameStats.findMany({ where: { is_final: true },
        orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { id: "desc" }],
        select: { id: true, is_final: true, userUid: true, replay_file: true, original_filename: true,
          replayHash: true, game_type: true, game_version: true, map: true, winner: true,
          players: true, event_types: true, key_events: true, parse_source: true, parse_reason: true,
          played_on: true, timestamp: true, createdAt: true,
          replayResultAdjudications: adjudications.EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
          user: { select: { inGameName: true, steamPersonaName: true } } } });
      const users = await tx.user.findMany({ orderBy: { id: "asc" }, select: { id: true, uid: true, steamId: true, inGameName: true, steamPersonaName: true } });
      const linked = new Map(users.filter((u) => /^765\d{14}$/.test(u.steamId || "")).map((u) => [u.steamId, u]));
      const logical = truth.cleanPublicGameRows(adjudications.applyReplayAdjudicationsToGameStatsRows(raw)
        .filter(archive.isPublicBattleArchiveRow), { includeReview: true, includeLive: false });
      const modernAttempts = await tx.$queryRawUnsafe<ObjectRow[]>(`SELECT a.id, a.game_stats_id, a.evidence,
        g.key_events->>'platform_match_id' AS actual_platform_match_id
        FROM replay_parse_attempts a LEFT JOIN game_stats g ON g.id=a.game_stats_id
        WHERE a.evidence->>'schema'='${MODERN_SCHEMA}' ORDER BY a.id`);
      const corpus = { uniqueLogicalBattles: logical.length, logicalBattleTruthComplete: 0,
        unresolvedLogicalBattles: 0, logicalResultResolved: 0, logicalRosterComplete: 0,
        logicalNeedsResultOnly: 0, logicalNeedsRosterOnly: 0, logicalNeedsBoth: 0 };
      const registeredPlayers = { identityRule: "exact replay Steam ID matched to current registered account; uploader/alias alone never qualifies",
        accountCount: linked.size, logicalBattles: 0, fullTruth: 0, unresolved: 0, resultMissing: 0, rosterMissing: 0 };
      const unresolved: ObjectRow[] = [];
      for (const game of logical) {
        const resultEligible = truth.publicReplayWinnerTruth(game).statsEligible;
        const rosterComplete = roster.publicReplayRosterV2DisplayState(game.players).complete;
        const full = resultEligible && rosterComplete;
        corpus.logicalBattleTruthComplete += Number(full);
        corpus.unresolvedLogicalBattles += Number(!full);
        corpus.logicalResultResolved += Number(resultEligible);
        corpus.logicalRosterComplete += Number(rosterComplete);
        if (!full) {
          if (rosterComplete) corpus.logicalNeedsResultOnly++;
          else if (resultEligible) corpus.logicalNeedsRosterOnly++;
          else corpus.logicalNeedsBoth++;
        }
        const registeredUsers = [...new Set(view.parsePlayers(game.players).map(identity.readLeaderboardSteamId))]
          .flatMap((steam) => { const user = linked.get(steam); return user ? [{ id: user.id, uid: user.uid, name: user.inGameName || user.steamPersonaName }] : []; });
        const registeredPlayerIds = registeredUsers.map((u) => u.id);
        if (registeredPlayerIds.length) {
          registeredPlayers.logicalBattles++; registeredPlayers.fullTruth += Number(full);
          registeredPlayers.unresolved += Number(!full); registeredPlayers.resultMissing += Number(!resultEligible);
          registeredPlayers.rosterMissing += Number(!rosterComplete);
        }
        if (full) continue;
        const events = game.key_events as ObjectRow | null;
        const platform = typeof events?.platform_match_id === "string" ? events.platform_match_id : null;
        const attempts = modernAttempts.filter((a) => a.game_stats_id === game.id ||
          Boolean(platform && (a.actual_platform_match_id === platform || a.evidence?.platform_match_id === platform)));
        const caseSourceFingerprint = digest(JSON.stringify({
          game,
          attempts,
          registeredUsers,
        }));
        unresolved.push({ gameStatsId: game.id, replayHash: game.replayHash, platformMatchId: platform,
          resultEligible, rosterComplete, registeredPlayerIds, registeredUsers, modernAttemptIds: attempts.map((a) => a.id),
          potentialQuorum: potentialModernQuorum(attempts.map((a) => a.evidence)),
          caseSourceFingerprint,
          family: !rosterComplete ? "roster_evidence_required" : attempts.length ? "modern_receipt_evidence" : "no_modern_receipt_evidence" });
      }
      return { generatedAt: new Date().toISOString(), databaseReadOnly, corpus,
        sourceFingerprint: digest(JSON.stringify({ raw, users, modernAttempts })),
        registeredPlayers, modernAttemptCount: modernAttempts.length, unresolved };
    }, { timeout: 120_000 });
    const inventory = await loadInventory();
    const candidates = inventory.unresolved.filter((r) => r.modernAttemptIds.length > 0).sort((a, b) =>
      Number(Boolean(b.registeredPlayerIds.length)) - Number(Boolean(a.registeredPlayerIds.length)) || a.gameStatsId - b.gameStatsId);
    const cases: ObjectRow[] = inventory.unresolved.filter((r) => !r.modernAttemptIds.length)
      .map((row) => ({ ...row, outcome: "blocked", reason: "no_supported_modern_receipt", plannerInvoked: false }));
    for (const row of candidates.slice(0, options.maxPlans)) {
      try {
        const before = await promotion.loadWatcherReceiptSnapshot(prisma, row.gameStatsId);
        // Hard-coded false, never copied from arguments or saved evidence.
        const result = await promotion.reconcileWatcherReceiptPromotion(prisma,
          { ...options, gameStatsId: row.gameStatsId, apply: false });
        const after = await promotion.loadWatcherReceiptSnapshot(prisma, row.gameStatsId);
        if (before !== after) throw new Error("source_snapshot_changed_during_evaluation");
        if (result.outcome === "eligible") {
          const plan = JSON.parse(await readFile(join(options.receiptDirectory, result.receiptStorageKey), "utf8"));
          const verification = spawnSync(options.pythonExecutable,
            [join(options.apiRoot, "scripts/plan_watcher_receipt_promotion.py"), "--verify", "--archive-dir", options.archiveDirectory],
            { cwd: options.apiRoot, input: JSON.stringify({ plan }), encoding: "utf8", timeout: 10_000,
              maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PGOPTIONS: "-c default_transaction_read_only=on" } });
          if (verification.error || verification.status !== 0) throw new Error("fresh_plan_verification_failed");
          const verified = JSON.parse(verification.stdout);
          if (verified.valid !== true || verified.plan_sha256 !== result.planSha256) throw new Error("fresh_plan_verification_failed");
        }
        cases.push({ ...row, ...result, sourceSnapshotSha256: digest(before), plannerInvoked: true });
      } catch (error) {
        cases.push({ ...row, outcome: "blocked", plannerInvoked: true, reason: error instanceof Error ? error.message : "census_planner_failed" });
      }
    }
    await readOnly(prisma);
    const afterInventory = await loadInventory();
    const inventoryChanged = inventory.sourceFingerprint !== afterInventory.sourceFingerprint;
    const afterByGame = new Map(
      afterInventory.unresolved.map((row: ObjectRow) => [row.gameStatsId, row.caseSourceFingerprint]),
    );
    const changedBattleIds = new Set<number>(
      inventory.unresolved
        .filter((row: ObjectRow) => afterByGame.get(row.gameStatsId) !== row.caseSourceFingerprint)
        .map((row: ObjectRow) => row.gameStatsId),
    );
    const finalCases = finalizeCensusCases(cases, changedBattleIds);
    const reasons: Record<string, number> = {};
    const blockers: Record<string, number> = {};
    for (const row of finalCases) {
      reasons[row.reason] = (reasons[row.reason] || 0) + 1;
      if (row.outcome !== "eligible") {
        const category = blockerCategory(row.reason);
        blockers[category] = (blockers[category] || 0) + 1;
      }
    }
    const sourceFiles = ["scripts/census-watcher-receipt-yield.mts", "lib/watcherReceiptPromotion.ts",
      "lib/parserObservatory.ts", "lib/publicReplayTruth.ts", "lib/publicReplayRosterV2.ts",
      "lib/publicBattleArchiveEligibility.ts", "lib/replayAdjudications.ts", "lib/teamResolution.ts",
      "lib/unresolvedWatcherResult.ts", "lib/leaderboardIdentity.ts", "lib/gameStatsView.ts"];
    const sourceFingerprints = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) =>
      [file, digest(await readFile(new URL("../" + file, import.meta.url), "utf8"))])));
    const gitIdentity = (cwd: string) => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(); } catch { return null; } };
    const report = { schema: 1, kind: "aoe2war-watcher-receipt-yield-census", createdAt: new Date().toISOString(),
      countingGrain: "Workshop canonical public logical battles; winner authority and complete public roster",
      observationTimestamp: inventory.generatedAt,
      inventory, inventoryAfter: afterInventory, inventoryChanged,
      changedBattleIds: [...changedBattleIds].sort((a, b) => a - b), sourceFingerprints,
      appSourceCommit: gitIdentity(new URL("..", import.meta.url).pathname) || process.env.AOE2WAR_CENSUS_APP_SOURCE || null, apiSourceCommit: gitIdentity(options.apiRoot) || process.env.AOE2WAR_CENSUS_API_SOURCE || null,
      serialPlannerLimit: options.maxPlans, potentialQuorumCases: candidates.filter((r) => r.potentialQuorum).length,
      modernBearingCases: candidates.length, inspectedUnresolvedBattles: finalCases.length,
      examinedCases: Math.min(candidates.length, options.maxPlans),
      unexaminedModernCaseIds: candidates.slice(options.maxPlans).map((r) => r.gameStatsId),
      censusCompleteAtObservation: options.maxPlans >= candidates.length,
      globalInventoryChangedAfterObservation: inventoryChanged,
      reasons, blockers, cases: finalCases,
      projectedYield: projectedYield(inventory.corpus, finalCases),
      eligibleCurrentPlayers: finalCases.filter((r) => r.outcome === "eligible" && r.registeredPlayerIds.length)
        .map((r) => ({ gameStatsId: r.gameStatsId, users: r.registeredUsers })),
      candidateEvidenceOnly: true, databaseWrites: 0, nativeSimulationRuns: 0 };
    const receipt = await persistReport(options.receiptDirectory, report);
    return { ...report, receipt };
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCensus(parseCensusArguments(process.argv.slice(2))).then((report) => {
    const { inventory, inventoryAfter, cases, ...summary } = report;
    console.log(JSON.stringify({ ...summary, corpus: inventory.corpus,
      registeredPlayers: inventory.registeredPlayers, modernAttemptCount: inventory.modernAttemptCount }, null, 2));
  }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
