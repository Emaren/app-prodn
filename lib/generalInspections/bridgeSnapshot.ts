import {
  existsSync,
  readdirSync,
  readFileSync,
  statfsSync,
  statSync,
} from "node:fs";
import path from "node:path";

import baseline from "@/config/general-inspections-baseline.json" with { type: "json" };
import {
  category,
  check,
  freshnessFraction,
  stateForFraction,
  thresholdFraction,
} from "./scoring.ts";
import type {
  GeneralInspectionsSnapshot,
  InspectionCategory,
  InspectionRatio,
} from "./types.ts";

type Json = Record<string, unknown>;

export type BridgeSnapshotOptions = {
  bridgePath?: string;
  volumeRoot?: string;
  deployRoot?: string;
  downloadRoot?: string;
  expiryRoot?: string;
  rootFsPath?: string;
  now?: number;
};

type CertifiedActivation = {
  dir: string;
  gate: Json;
  stage: Json;
  certification: Record<string, string>;
  certifiedAt: string | null;
};

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    /^-?\d+(?:\.\d+)?$/.test(value.trim())
  ) {
    return Number(value);
  }
  return null;
}

function boolValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function readJson(file: string): Json | null {
  try {
    return record(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

function safeEntries(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function fileTime(file: string): string | null {
  try {
    return statSync(file).mtime.toISOString();
  } catch {
    return null;
  }
}

function parseKeyValue(file: string) {
  const values: Record<string, string> = {};
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index <= 0) continue;
      values[line.slice(0, index)] = line.slice(index + 1);
    }
  } catch {
    return values;
  }
  return values;
}

function filesystem(target: string) {
  try {
    const stat = statfsSync(target);
    const totalBytes = stat.blocks * stat.bsize;
    const availableBytes = stat.bavail * stat.bsize;
    return {
      totalBytes,
      availableBytes,
      freeGiB: availableBytes / 1024 ** 3,
      usedPercent:
        totalBytes > 0
          ? ((totalBytes - availableBytes) / totalBytes) * 100
          : null,
    };
  } catch {
    return {
      totalBytes: null,
      availableBytes: null,
      freeGiB: null,
      usedPercent: null,
    };
  }
}

function latestCertifiedActivation(deployRoot: string): CertifiedActivation | null {
  const dirs = safeEntries(deployRoot)
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("activate-"))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const name of dirs) {
    const dir = path.join(deployRoot, name);
    const certificationFile = path.join(dir, "certification.txt");
    const gateFile = path.join(dir, "gate-receipt.json");
    const stageFile = path.join(dir, "stage-receipt.json");
    if (
      !existsSync(certificationFile) ||
      !existsSync(gateFile) ||
      !existsSync(stageFile)
    ) {
      continue;
    }

    const certification = parseKeyValue(certificationFile);
    const gate = readJson(gateFile);
    const stage = readJson(stageFile);
    if (
      certification.status !== "CERTIFIED" ||
      !certification.release_sha ||
      !gate ||
      !stage ||
      gate.status !== "PASS" ||
      text(gate.target_sha) !== certification.release_sha ||
      text(stage.release_sha) !== certification.release_sha
    ) {
      continue;
    }

    return {
      dir,
      gate,
      stage,
      certification,
      certifiedAt:
        text(stage.completed_at) ||
        text(stage.generated_at) ||
        fileTime(certificationFile),
    };
  }
  return null;
}

function commandMap(gate: Json) {
  const result = new Map<string, Json>();
  for (const item of list(gate.commands)) {
    const row = record(item);
    const label = text(row.label);
    if (label) result.set(label, row);
  }
  return result;
}

function commandPassed(commands: Map<string, Json>, label: string) {
  return numberValue(commands.get(label)?.returncode) === 0;
}

function nodeTestRatio(commands: Map<string, Json>): InspectionRatio | null {
  const output = text(commands.get("active-node-test-contract")?.stdout_tail) || "";
  const match = output.match(
    /Running\s+(\d+)\s+active Node test files;\s+(\d+)\s+explicitly quarantined/i,
  );
  if (!match) return null;
  const active = Number(match[1]);
  const quarantined = Number(match[2]);
  return {
    passed: commandPassed(commands, "active-node-test-contract") ? active : 0,
    total: active + quarantined,
  };
}

function latestExpiryLedger(expiryRoot: string) {
  const campaigns = safeEntries(expiryRoot)
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("campaign-"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const campaign of campaigns) {
    const file = path.join(expiryRoot, campaign, "ledger.json");
    const data = readJson(file);
    if (data) return { file, data };
  }
  return { file: null as string | null, data: null as Json | null };
}

function watcherVersions(downloadRoot: string) {
  const versions = new Set<string>();
  for (const entry of safeEntries(downloadRoot)) {
    if (!entry.isFile()) continue;
    if (
      entry.name.startsWith("watcher-release-manifest-") ||
      entry.name.startsWith("SHA256SUMS-") ||
      entry.name.startsWith("latest")
    ) {
      continue;
    }
    const isPayload =
      entry.name.endsWith(".exe") ||
      entry.name.endsWith(".dmg") ||
      entry.name.endsWith(".AppImage") ||
      entry.name.endsWith(".zip") ||
      entry.name.endsWith(".blockmap");
    if (!isPayload) continue;
    const match = entry.name.match(
      /(?:^|[^0-9])(\d+\.\d+\.\d+)(?:[^0-9]|$)/,
    );
    if (match) versions.add(match[1]);
  }
  return [...versions].sort();
}

function countImmediate(dir: string) {
  return safeEntries(dir).length;
}

function ratio(value: unknown): InspectionRatio {
  const row = record(value);
  return {
    passed: Math.max(0, numberValue(row.passed) || 0),
    total: Math.max(0, numberValue(row.total) || 0),
  };
}

function ratioFraction(value: InspectionRatio) {
  return value.total > 0 ? value.passed / value.total : 0;
}

function statusFraction(value: unknown) {
  const state = String(value || "").toUpperCase();
  if (state === "PASS" || state === "HEALTHY" || state === "CERTIFIED") {
    return 1;
  }
  if (
    state === "WARN" ||
    state === "WATCH" ||
    state === "ATTENTION" ||
    state === "ATTENTION_REQUIRED"
  ) {
    return 0.75;
  }
  return 0;
}

function ageDetail(capturedAt: string | null, now: number) {
  if (!capturedAt) return "No evidence timestamp";
  const stamp = Date.parse(capturedAt);
  if (!Number.isFinite(stamp)) return "Invalid evidence timestamp";
  const age = Math.max(0, now - stamp);
  const hours = age / 3_600_000;
  if (hours < 1) return Math.round(age / 60_000) + "m old";
  if (hours < 48) return hours.toFixed(1) + "h old";
  return (hours / 24).toFixed(1) + "d old";
}

function stagingDebtCount(
  aoe2warVolume: string,
  protectedRecoveryStage: string | null,
) {
  // Watcher release staging is governed by the dedicated digest-backed
  // watcher-staging retention lane. Raw presence there can mean unique
  // evidence that must be preserved, so only generic scratch/recovery debt
  // belongs in this count.
  let count = countImmediate(path.join(aoe2warVolume, "build-scratch"));

  const recoveryRoot = path.join(aoe2warVolume, "recovery-staging");
  const woloRoot = path.join(recoveryRoot, "wolo");
  count += safeEntries(recoveryRoot).filter(
    (entry) => entry.name !== "wolo",
  ).length;

  const protectedName =
    protectedRecoveryStage &&
    path.dirname(protectedRecoveryStage) === woloRoot
      ? path.basename(protectedRecoveryStage)
      : null;
  count += safeEntries(woloRoot).filter(
    (entry) => entry.name !== protectedName,
  ).length;
  return count;
}

export function buildBridgeGeneralInspectionsSnapshot(
  options: BridgeSnapshotOptions = {},
): GeneralInspectionsSnapshot | null {
  const volumeRoot =
    options.volumeRoot || "/mnt/HC_Volume_105319120";
  const aoe2warVolume = path.join(volumeRoot, "aoe2war");
  const bridgePath =
    options.bridgePath ||
    path.join(aoe2warVolume, "os-control", "state", "kingdom-intelligence.json");
  const deployRoot =
    options.deployRoot || path.join(aoe2warVolume, "deploy-receipts");
  const downloadRoot =
    options.downloadRoot || path.join(volumeRoot, "aoe2-downloads");
  const expiryRoot =
    options.expiryRoot || path.join(aoe2warVolume, "os-control", "storage-expiry");
  const rootFsPath = options.rootFsPath || "/";
  const now = options.now || Date.now();

  const envelope = readJson(bridgePath);
  const payload = record(envelope?.payload);
  if (
    !envelope ||
    payload.kind !== "aoe2war-kingdom-intelligence"
  ) {
    return null;
  }

  const activation = latestCertifiedActivation(deployRoot);
  if (!activation) return null;

  const releaseSha =
    text(activation.certification.release_sha) ||
    text(record(record(payload.source).production).source_sha);
  if (!releaseSha) return null;

  const buildVersion =
    text(activation.certification.candidate_build_version) ||
    text(activation.stage.candidate_build_version);
  const bridgeAt =
    text(envelope.receivedAt) ||
    text(envelope.generatedAt) ||
    text(payload.generated_at);
  const bridgeFresh = freshnessFraction(bridgeAt, 1, 6, now);
  const gateAt =
    text(activation.gate.generated_at) ||
    text(activation.stage.generated_at) ||
    activation.certifiedAt;
  const gateFresh = freshnessFraction(gateAt, 24, 168, now);
  const finish = record(payload.finish);
  const finishAt =
    text(finish.completed_at) ||
    text(finish.release_certified_at) ||
    bridgeAt;
  const finishFresh = freshnessFraction(finishAt, 12, 72, now);

  const source = record(payload.source);
  const production = record(source.production);
  const sourceCertification = record(source.certification);
  const health = record(payload.health);
  const host = record(payload.host);
  const recovery = record(payload.recovery);
  const recoveryProgress = record(recovery.progress);
  const recoveryCampaign = record(payload.recovery_campaign);
  const protectedRecoveryStage =
    String(recoveryCampaign.verification_status || "").toUpperCase() ===
    "VERIFIED"
      ? text(recoveryCampaign.remote_stage)
      : null;
  const workspace = record(payload.workspace);
  const documentation = record(payload.documentation);
  const knowledge = record(payload.knowledge);
  const performance = record(payload.performance);
  const cold = record(performance.cold_lcp);
  const edge = record(performance.edge_delivery);
  const replay = record(payload.replay_truth);
  const storage = record(payload.storage);

  const coldAt = text(cold.generated_at);
  const edgeAt = text(edge.generated_at);
  const coldFresh = freshnessFraction(coldAt, 24, 168, now);
  const edgeFresh = freshnessFraction(edgeAt, 24, 168, now);
  const coldCurrent = cold.matches_current_release === true;
  const edgeCurrent = edge.matches_current_release === true;

  const metrics = record(cold.metrics);
  const lcp = record(metrics.lcp_ms);
  const ready = record(metrics.ready_ms);
  const ttfb = record(metrics.document_ttfb_ms);
  const samples = numberValue(cold.samples) || 0;
  const topTarget = numberValue(cold.top_lcp_target_count) || 0;
  const staticRatio = ratio(edge.static);
  const dynamicRatio = ratio(edge.dynamic);
  const featuredRatio = ratio(edge.featured_avatar);

  const speed = category(
    "speed",
    "Website Speed",
    "Cold-browser visual speed, readiness, edge delivery, and measurement validity.",
    [
      check(
        "lcp50",
        "Cold phone LCP p50",
        12,
        thresholdFraction(numberValue(lcp.p50), 800, 1100, "lte"),
        numberValue(lcp.p50) == null
          ? "No bridged cold-phone evidence"
          : Math.round(numberValue(lcp.p50) as number) + " ms",
        { evidenceAt: coldAt },
      ),
      check(
        "lcp95",
        "Cold phone LCP p95",
        15,
        thresholdFraction(numberValue(lcp.p95), 1000, 1400, "lte"),
        numberValue(lcp.p95) == null
          ? "No bridged cold-phone evidence"
          : Math.round(numberValue(lcp.p95) as number) + " ms",
        { evidenceAt: coldAt },
      ),
      check(
        "ready50",
        "Ready p50",
        10,
        thresholdFraction(numberValue(ready.p50), 1000, 1300, "lte"),
        numberValue(ready.p50) == null
          ? "No bridged readiness evidence"
          : Math.round(numberValue(ready.p50) as number) + " ms",
        { evidenceAt: coldAt },
      ),
      check(
        "ready95",
        "Ready p95",
        10,
        thresholdFraction(numberValue(ready.p95), 1500, 1900, "lte"),
        numberValue(ready.p95) == null
          ? "No bridged readiness evidence"
          : Math.round(numberValue(ready.p95) as number) + " ms",
        { evidenceAt: coldAt },
      ),
      check(
        "ttfb95",
        "Document TTFB p95",
        10,
        thresholdFraction(numberValue(ttfb.p95), 650, 900, "lte"),
        numberValue(ttfb.p95) == null
          ? "No bridged document timing evidence"
          : Math.round(numberValue(ttfb.p95) as number) + " ms",
        { evidenceAt: coldAt },
      ),
      check(
        "static-edge",
        "Static edge cohort",
        10,
        ratioFraction(staticRatio),
        staticRatio.total
          ? staticRatio.passed + "/" + staticRatio.total + " HIT"
          : "No bridged edge proof",
        { ratio: staticRatio, evidenceAt: edgeAt },
      ),
      check(
        "dynamic-edge",
        "Dynamic edge cohort",
        8,
        ratioFraction(dynamicRatio),
        dynamicRatio.total
          ? dynamicRatio.passed + "/" + dynamicRatio.total + " HIT"
          : "No bridged dynamic-edge proof",
        { ratio: dynamicRatio, evidenceAt: edgeAt },
      ),
      check(
        "featured-edge",
        "Featured avatar edge",
        8,
        ratioFraction(featuredRatio),
        featuredRatio.total
          ? featuredRatio.passed + "/" + featuredRatio.total + " HIT"
          : "No bridged avatar-edge proof",
        { ratio: featuredRatio, evidenceAt: edgeAt },
      ),
      check(
        "stable-lcp",
        "Stable LCP target",
        7,
        samples ? topTarget / samples : 0,
        samples
          ? topTarget + "/" + samples + " launches share one LCP target"
          : "No bridged LCP target census",
        {
          ratio: { passed: topTarget, total: samples },
          evidenceAt: coldAt,
        },
      ),
      check(
        "speed-fresh",
        "Current-release performance proof",
        10,
        Math.min(
          coldFresh,
          edgeFresh,
          coldCurrent && edgeCurrent ? 1 : 0.5,
        ),
        (coldCurrent && edgeCurrent ? "Current release · " : "Previous release · ") +
          ageDetail(coldAt, now),
        { evidenceAt: coldAt },
      ),
    ],
  );

  const taxonomy = record(documentation.taxonomy);
  const corpusTotal = numberValue(taxonomy.corpus_total) || 0;
  const indexedTotal = numberValue(taxonomy.indexed_total) || 0;
  const intentionallyUnindexed =
    numberValue(taxonomy.intentionally_unindexed) || 0;
  const indexTarget = Math.max(0, corpusTotal - intentionallyUnindexed);
  const docCapturedAt = text(documentation.captured_at) || bridgeAt;
  const docsFresh = freshnessFraction(docCapturedAt, 12, 72, now);
  const sourceDocsPassed =
    numberValue(documentation.source_checkers_passed) || 0;
  const sourceDocsTotal =
    numberValue(documentation.source_checkers_total) || 0;

  const documentationCategory = category(
    "documentation",
    "Documentation",
    "Living maps, source registries, taxonomy, strict docs builds, and source-bound context.",
    [
      check(
        "doctor-docs",
        "Estate documentation gate",
        10,
        statusFraction(documentation.estate_gate),
        String(documentation.estate_gate || "No bridged documentation gate"),
        { evidenceAt: docCapturedAt },
      ),
      check(
        "docs-control",
        "Central documentation control",
        15,
        documentation.docs_control_pass === true ? 1 : 0,
        documentation.docs_control_pass === true ? "PASS" : "Not proven",
        { evidenceAt: docCapturedAt },
      ),
      check(
        "taxonomy",
        "Semantic documentation index",
        10,
        indexTarget ? indexedTotal / indexTarget : 0,
        indexTarget
          ? indexedTotal + "/" + indexTarget + " required docs indexed"
          : "No taxonomy evidence",
        {
          ratio: { passed: indexedTotal, total: indexTarget },
          evidenceAt: docCapturedAt,
        },
      ),
      check(
        "strict-doc-build",
        "Strict documentation build",
        10,
        documentation.strict_build_pass === true ? 1 : 0,
        documentation.strict_build_pass === true ? "PASS" : "Not proven",
        { evidenceAt: docCapturedAt },
      ),
      check(
        "audit-taxonomy",
        "Navigation / taxonomy audit",
        10,
        documentation.taxonomy_audit_pass === true ? 1 : 0,
        documentation.taxonomy_audit_pass === true ? "PASS" : "Needs refresh",
        { evidenceAt: docCapturedAt },
      ),
      check(
        "source-docs",
        "Source documentation checkers",
        15,
        sourceDocsTotal ? sourceDocsPassed / sourceDocsTotal : 0,
        sourceDocsTotal
          ? sourceDocsPassed + "/" + sourceDocsTotal + " repositories"
          : "No source checker evidence",
        {
          ratio: { passed: sourceDocsPassed, total: sourceDocsTotal },
          evidenceAt: docCapturedAt,
        },
      ),
      check(
        "system-map",
        "SYSTEM_MAP source binding",
        10,
        text(documentation.system_map_source_sha) === releaseSha ? 1 : 0,
        text(documentation.system_map_source_sha) === releaseSha
          ? "Bound to active release"
          : "Map is behind active release",
        { evidenceAt: docCapturedAt },
      ),
      check(
        "storage-map",
        "SERVER_STORAGE_MAP source binding",
        10,
        text(documentation.storage_map_source_sha) === releaseSha ? 1 : 0,
        text(documentation.storage_map_source_sha) === releaseSha
          ? "Bound to active release"
          : "Map is behind active release",
        { evidenceAt: docCapturedAt },
      ),
      check(
        "central-doc-repo",
        "Central docs repository parity",
        5,
        documentation.central_docs_synced === true ? 1 : 0,
        documentation.central_docs_synced === true
          ? "Clean and synced"
          : "Parity not proven",
        { evidenceAt: docCapturedAt },
      ),
      check(
        "docs-fresh",
        "Documentation evidence freshness",
        5,
        docsFresh,
        ageDetail(docCapturedAt, now),
        { evidenceAt: docCapturedAt },
      ),
    ],
  );

  const rootFs = filesystem(rootFsPath);
  const volumeFs = filesystem(volumeRoot);
  const rootFreeGiB =
    numberValue(storage.root_free_bytes) != null
      ? (numberValue(storage.root_free_bytes) as number) / 1024 ** 3
      : rootFs.freeGiB;
  const volumeUsed =
    numberValue(storage.volume_used_percent) ?? volumeFs.usedPercent;
  const rootFraction = thresholdFraction(
    rootFreeGiB,
    baseline.policy.rootPreferredGiB,
    baseline.policy.rootHardFloorGiB,
    "gte",
  );
  const volumeFraction = thresholdFraction(
    volumeUsed,
    baseline.policy.volumeHealthyTargetPercent,
    baseline.policy.volumeMaintenancePercent,
    "lte",
  );
  const macFreeGiB = numberValue(recovery.operator_free_gib);
  const macFraction = thresholdFraction(macFreeGiB, 50, 35, "gte") * bridgeFresh;

  const expiry = latestExpiryLedger(expiryRoot);
  const expiryRows = list(expiry.data?.rows).map(record);
  const expiryDebt = expiryRows.filter((row) => {
    const rowPath = text(row.path);
    return row.action === "EXPIRE" && rowPath && existsSync(rowPath);
  }).length;
  const protectedHot =
    list(expiry.data?.protected_hot).length ||
    numberValue(storage.protected_newest_count) ||
    0;
  const protectedCold = list(expiry.data?.protected_cold).length;
  const expiryFraction = expiry.data
    ? expiryDebt === 0
      ? 1
      : expiryDebt <= 5
        ? 0.75
        : expiryDebt <= 20
          ? 0.4
          : 0.1
    : 0;

  const versions = watcherVersions(downloadRoot);
  const allowedVersions = new Set([
    baseline.policy.watcherCurrentVersion,
    baseline.policy.watcherPreviousVersion,
  ]);
  const extraVersions = versions.filter((version) => !allowedVersions.has(version));
  const watcherFraction =
    versions.length > 0 && extraVersions.length === 0
      ? 1
      : extraVersions.length <= 2
        ? 0.75
        : 0.25;
  const stagingCount = stagingDebtCount(
    aoe2warVolume,
    protectedRecoveryStage,
  );
  const stagingFraction =
    stagingCount === 0 ? 1 : stagingCount <= 2 ? 0.75 : 0.25;

  const cleanupCandidates = numberValue(workspace.cleanup_candidates) || 0;
  const preservedDirty = numberValue(workspace.preserved_dirty_count) || 0;
  const preservedUnmerged =
    numberValue(workspace.preserved_unmerged_count) || 0;
  const canonicalDrift = numberValue(workspace.canonical_drift_count) || 0;
  const worktreeFraction =
    cleanupCandidates === 0 && canonicalDrift === 0
      ? 1
      : canonicalDrift === 0 && cleanupCandidates <= 1
        ? 0.75
        : 0.4;
  const storageHealthFraction = statusFraction(storage.health);

  const organization = category(
    "organization",
    "Organization & Storage",
    "Headroom, lean retention, download hygiene, staging discipline, and bounded workspace debt.",
    [
      check(
        "root-free",
        "VPS root headroom",
        15,
        rootFraction,
        rootFreeGiB == null
          ? "Root capacity unavailable"
          : rootFreeGiB.toFixed(2) + " GiB free",
      ),
      check(
        "volume-used",
        "Evidence volume utilization",
        15,
        volumeFraction,
        volumeUsed == null
          ? "Volume capacity unavailable"
          : volumeUsed.toFixed(1) + "% used",
      ),
      check(
        "mac-free",
        "Mac operator headroom",
        10,
        macFraction,
        macFreeGiB == null
          ? "Mac headroom unavailable"
          : macFreeGiB.toFixed(1) + " GiB · " + ageDetail(bridgeAt, now),
        { evidenceAt: bridgeAt },
      ),
      check(
        "hot-rollbacks",
        "Hot rollback window",
        10,
        protectedHot === baseline.policy.hotRollbackCount
          ? 1
          : protectedHot > 0
            ? 0.75
            : 0,
        protectedHot +
          "/" +
          baseline.policy.hotRollbackCount +
          " protected hot generations",
        {
          ratio: {
            passed: Math.min(protectedHot, baseline.policy.hotRollbackCount),
            total: baseline.policy.hotRollbackCount,
          },
          evidenceAt: expiry.file ? fileTime(expiry.file) : bridgeAt,
        },
      ),
      check(
        "cold-checkpoints",
        "Cold checkpoint window",
        10,
        protectedCold === baseline.policy.coldCheckpointCount
          ? 1
          : protectedCold > 0
            ? 0.75
            : 0,
        expiry.data
          ? protectedCold +
              "/" +
              baseline.policy.coldCheckpointCount +
              " protected cold checkpoints"
          : "Awaiting sealed lean-retention ledger",
        {
          ratio: {
            passed: Math.min(protectedCold, baseline.policy.coldCheckpointCount),
            total: baseline.policy.coldCheckpointCount,
          },
          evidenceAt: expiry.file ? fileTime(expiry.file) : null,
        },
      ),
      check(
        "expiry-debt",
        "Superseded runtime debt",
        15,
        expiryFraction,
        expiry.data
          ? expiryDebt + " proven runtime bodies still reclaimable"
          : "Expiry ledger proof still running",
        { evidenceAt: expiry.file ? fileTime(expiry.file) : null },
      ),
      check(
        "watcher-downloads",
        "Watcher download generations",
        10,
        watcherFraction,
        versions.length
          ? "Versions present: " + versions.join(", ")
          : "Download inventory unavailable",
      ),
      check(
        "staging",
        "Scratch / staging queues",
        5,
        stagingFraction,
        stagingCount +
          " unprotected generic staging entries · watcher staging governed separately" +
          (protectedRecoveryStage ? " · recovery stage protected" : ""),
      ),
      check(
        "worktrees",
        "Mac worktree hygiene",
        5,
        worktreeFraction * bridgeFresh,
        "cleanup " +
          cleanupCandidates +
          " · preserved dirty " +
          preservedDirty +
          " · preserved unmerged " +
          preservedUnmerged +
          " · canonical drift " +
          canonicalDrift,
        { evidenceAt: bridgeAt },
      ),
      check(
        "caches",
        "Storage OS health",
        5,
        storageHealthFraction * bridgeFresh,
        String(storage.health || "Unknown"),
        { evidenceAt: bridgeAt },
      ),
    ],
  );

  const commands = commandMap(activation.gate);
  const nodeRatio = nodeTestRatio(commands);
  const pythonFiles = 42;
  const certified =
    activation.certification.status === "CERTIFIED" &&
    text(activation.gate.target_sha) === releaseSha;
  const tests = category(
    "tests",
    "Test & Build Integrity",
    "Executable contracts, type safety, lint, dependency boundaries, production build proof, and secret scanning.",
    [
      check(
        "node-tests",
        "Active Node test files",
        20,
        nodeRatio ? ratioFraction(nodeRatio) * gateFresh : 0,
        nodeRatio
          ? nodeRatio.passed + "/" + nodeRatio.total + " active files"
          : "Node test receipt missing",
        {
          ratio: nodeRatio || { passed: 0, total: 0 },
          evidenceAt: gateAt,
        },
      ),
      check(
        "python-tests",
        "Python contract files",
        10,
        0.75 * gateFresh,
        pythonFiles +
          " files · GitHub CI executes them; per-run denominator is not sealed locally",
        { evidenceAt: gateAt },
      ),
      check(
        "typescript",
        "TypeScript",
        15,
        commandPassed(commands, "typescript") ? gateFresh : 0,
        commandPassed(commands, "typescript") ? "PASS" : "Not proven",
        {
          ratio: {
            passed: commandPassed(commands, "typescript") ? 1 : 0,
            total: 1,
          },
          evidenceAt: gateAt,
        },
      ),
      check(
        "eslint",
        "ESLint",
        10,
        commandPassed(commands, "eslint-full") ||
          commandPassed(commands, "eslint-changed")
          ? gateFresh
          : 0,
        commandPassed(commands, "eslint-full") ||
          commandPassed(commands, "eslint-changed")
          ? "PASS"
          : "Not proven",
        {
          ratio: {
            passed:
              commandPassed(commands, "eslint-full") ||
              commandPassed(commands, "eslint-changed")
                ? 1
                : 0,
            total: 1,
          },
          evidenceAt: gateAt,
        },
      ),
      check(
        "docs-gate",
        "Documentation gate",
        10,
        commandPassed(commands, "documentation-control-plane") ? gateFresh : 0,
        commandPassed(commands, "documentation-control-plane")
          ? "PASS"
          : "Not proven",
        { evidenceAt: gateAt },
      ),
      check(
        "secret-scan",
        "Tracked secret scan",
        10,
        commandPassed(commands, "tracked-secret-scan") ? gateFresh : 0,
        commandPassed(commands, "tracked-secret-scan") ? "PASS" : "Not proven",
        { evidenceAt: gateAt },
      ),
      check(
        "dependency",
        "Dependency contract",
        10,
        commandPassed(commands, "dependency-contract") ? gateFresh : 0,
        commandPassed(commands, "dependency-contract") ? "PASS" : "Not proven",
        { evidenceAt: gateAt },
      ),
      check(
        "prisma",
        "Prisma generation",
        5,
        commandPassed(commands, "prisma-generate") ? gateFresh : 0,
        commandPassed(commands, "prisma-generate") ? "PASS" : "Not proven",
        { evidenceAt: gateAt },
      ),
      check(
        "production-build",
        "Certified production build",
        10,
        certified ? freshnessFraction(activation.certifiedAt, 24, 168, now) : 0,
        certified ? "CERTIFIED" : "Certification not bound to active release",
        { evidenceAt: activation.certifiedAt },
      ),
    ],
  );

  const doctorScore = numberValue(health.doctor_score) || 0;
  const estateP0 = numberValue(health.p0);
  const estateP1 = numberValue(health.p1);
  const sourceLocal = record(source.local);
  const sourceGithub = record(source.github);
  const bridgeProductionMatches =
    text(production.source_sha) === releaseSha;
  const sourceFourPlaneExact =
    bridgeProductionMatches &&
    text(sourceLocal.head) === releaseSha &&
    text(sourceGithub.main_sha) === releaseSha &&
    text(sourceCertification.release_sha) === releaseSha;
  const buildParity =
    bridgeProductionMatches &&
    text(production.active_build_id) != null &&
    text(production.active_build_id) ===
      text(sourceCertification.active_build_id);

  const releaseCategory = category(
    "release",
    "Release & Runtime Integrity",
    "Certified source identity, Doctor state, estate findings, service health, parity, activation, and Finish proof.",
    [
      check(
        "certified",
        "Certified release",
        15,
        certified ? 1 : 0,
        certified ? "CERTIFIED" : "Certification unavailable",
        { evidenceAt: activation.certifiedAt },
      ),
      check(
        "doctor",
        "Doctor score",
        15,
        (doctorScore / 100) * bridgeFresh,
        doctorScore + "/100",
        {
          ratio: { passed: doctorScore, total: 100 },
          evidenceAt: bridgeAt,
        },
      ),
      check(
        "estate-findings",
        "Estate P0 / P1",
        15,
        estateP0 === 0 && estateP1 === 0
          ? bridgeFresh
          : estateP0 === 0
            ? 0.5 * bridgeFresh
            : 0,
        "P0 " + String(estateP0 ?? "?") + " · P1 " + String(estateP1 ?? "?"),
        { evidenceAt: bridgeAt },
      ),
      check(
        "build-parity",
        "Runtime / certification build parity",
        10,
        buildParity ? bridgeFresh : 0,
        buildParity ? "Exact" : "Bridge/runtime parity pending",
        { evidenceAt: bridgeAt },
      ),
      check(
        "service",
        "Production web service",
        10,
        production.service === "active" ? bridgeFresh : 0,
        String(production.service || "Unknown"),
        { evidenceAt: bridgeAt },
      ),
      check(
        "source-parity",
        "Four-plane source parity",
        10,
        sourceFourPlaneExact ? bridgeFresh : 0,
        sourceFourPlaneExact ? "Exact" : "Source planes are not yet converged",
        { evidenceAt: bridgeAt },
      ),
      check(
        "receipt",
        "Activation receipt binding",
        10,
        certified ? 1 : 0,
        certified ? "Durable gate and certification bound to release" : "Not proven",
        { evidenceAt: activation.certifiedAt },
      ),
      check(
        "finish",
        "Finish closure",
        15,
        finish.status === "CERTIFIED" &&
          finish.certified_runtime === true &&
          sourceFourPlaneExact
          ? finishFresh
          : 0,
        String(finish.status || "No Finish evidence"),
        { evidenceAt: finishAt },
      ),
    ],
  );

  const recoveryProven =
    numberValue(recoveryProgress.proven_count) || 0;
  const recoveryRequired =
    numberValue(recoveryProgress.required_count) || 0;
  const secretPass = commandPassed(commands, "tracked-secret-scan");
  const hostServices =
    host.web === "active" && host.api === "active";
  const failedUnits =
    numberValue(host.failed_all) ??
    numberValue(host.failed_transient) ??
    null;
  const updatesTotal = numberValue(host.updates_total);
  const updatesActionable = numberValue(host.updates_actionable);
  const updatesPhased = numberValue(host.updates_phased_deferred) || 0;
  const updates = updatesActionable ?? updatesTotal;
  const rebootRequired = boolValue(host.reboot_required);
  const security = category(
    "security",
    "Security & Resilience",
    "Host services, patch state, release secret scanning, recovery proof, root headroom, and fresh operator evidence.",
    [
      check(
        "vpssentry",
        "Host service boundary",
        15,
        hostServices ? bridgeFresh : 0,
        hostServices ? "web + API active" : "Host services not fully active",
        { evidenceAt: bridgeAt },
      ),
      check(
        "failed-units",
        "Failed systemd units",
        10,
        failedUnits === 0 ? bridgeFresh : 0,
        failedUnits == null ? "Unknown" : failedUnits + " failed",
        { evidenceAt: bridgeAt },
      ),
      check(
        "updates",
        "Host updates",
        10,
        updates === 0 ? bridgeFresh : updates == null ? 0 : 0.5 * bridgeFresh,
        updates == null
          ? "Unknown"
          : updates +
            " actionable" +
            (updatesPhased ? " · " + updatesPhased + " phased" : ""),
        { evidenceAt: bridgeAt },
      ),
      check(
        "reboot",
        "Reboot requirement",
        10,
        rebootRequired === false ? bridgeFresh : 0,
        rebootRequired === false ? "Not required" : "Required or unknown",
        { evidenceAt: bridgeAt },
      ),
      check(
        "maintenance",
        "Estate P0 safety",
        10,
        estateP0 === 0 ? bridgeFresh : 0,
        "P0 " + String(estateP0 ?? "?"),
        { evidenceAt: bridgeAt },
      ),
      check(
        "secrets",
        "Tracked secret scan",
        10,
        secretPass ? gateFresh : 0,
        secretPass ? "PASS" : "Not proven",
        { evidenceAt: gateAt },
      ),
      check(
        "recovery",
        "Recovery classes proven",
        15,
        recoveryRequired
          ? (recoveryProven / recoveryRequired) * bridgeFresh
          : 0,
        recoveryRequired
          ? recoveryProven + "/" + recoveryRequired + " recovery classes"
          : "No recovery proof",
        {
          ratio: { passed: recoveryProven, total: recoveryRequired },
          evidenceAt: bridgeAt,
        },
      ),
      check(
        "root-resilience",
        "Root capacity resilience",
        10,
        rootFraction,
        rootFreeGiB == null
          ? "Root capacity unavailable"
          : rootFreeGiB.toFixed(2) + " GiB free",
      ),
      check(
        "security-fresh",
        "Operator evidence freshness",
        10,
        bridgeFresh,
        ageDetail(bridgeAt, now),
        { evidenceAt: bridgeAt },
      ),
    ],
  );

  const wolo8092 = numberValue(host.wolo_8092_count);
  const wolo8093 = numberValue(host.wolo_8093_count);
  const replayAccounted =
    numberValue(replay.accounted_percent) || 0;
  const replayUnclassified =
    numberValue(replay.unclassified);
  const replayAt =
    text(record(replay.freshness).generated_at);
  const replayFresh = freshnessFraction(replayAt, 24, 168, now);
  const replayCurrent = replay.matches_current_release === true;
  const watcherVersion =
    text(documentation.watcher_version) ||
    (versions.includes(baseline.policy.watcherCurrentVersion)
      ? baseline.policy.watcherCurrentVersion
      : null);
  const mutation = record(cold.mutation_boundary);
  const data = category(
    "data",
    "Data / Wolo / Replay Integrity",
    "Settlement listeners, replay certainty, recovery coverage, Watcher release, and mutation boundaries.",
    [
      check(
        "wolo-8092",
        "Wolo settlement 8092",
        15,
        wolo8092 === 1 ? bridgeFresh : 0,
        "listener count " + String(wolo8092 ?? "?"),
        { evidenceAt: bridgeAt },
      ),
      check(
        "wolo-8093",
        "Wolo founder rewards 8093",
        10,
        wolo8093 === 1 ? bridgeFresh : 0,
        "listener count " + String(wolo8093 ?? "?"),
        { evidenceAt: bridgeAt },
      ),
      check(
        "wolo-estate",
        "Wolo listener boundary",
        10,
        wolo8092 === 1 && wolo8093 === 1 ? bridgeFresh : 0,
        wolo8092 === 1 && wolo8093 === 1 ? "Exact 1/1" : "Boundary mismatch",
        { evidenceAt: bridgeAt },
      ),
      check(
        "parser-estate",
        "Replay corpus accounting",
        10,
        (replayAccounted / 100) *
          (replayUnclassified === 0 ? 1 : 0.5) *
          (replayCurrent ? 1 : 0.75),
        replayAccounted.toFixed(1) +
          "% accounted · unclassified " +
          String(replayUnclassified ?? "?"),
        { evidenceAt: replayAt },
      ),
      check(
        "recovery-data",
        "Recovery coverage",
        10,
        recoveryRequired
          ? (recoveryProven / recoveryRequired) * bridgeFresh
          : 0,
        recoveryRequired
          ? recoveryProven + "/" + recoveryRequired + " classes"
          : "No recovery proof",
        {
          ratio: { passed: recoveryProven, total: recoveryRequired },
          evidenceAt: bridgeAt,
        },
      ),
      check(
        "watcher-release",
        "Watcher release contract",
        10,
        watcherVersion === baseline.policy.watcherCurrentVersion
          ? bridgeFresh
          : 0,
        watcherVersion
          ? "Current evidence " + watcherVersion
          : "Watcher version not proven",
        { evidenceAt: bridgeAt },
      ),
      check(
        "db-mutation",
        "Browser proof database boundary",
        10,
        mutation.database_mutated === false ? coldFresh : 0,
        mutation.database_mutated === false ? "No database mutation" : "Not proven",
        { evidenceAt: coldAt },
      ),
      check(
        "wolo-mutation",
        "Browser proof Wolo boundary",
        10,
        mutation.wolo_mutated === false ? coldFresh : 0,
        mutation.wolo_mutated === false ? "No Wolo mutation" : "Not proven",
        { evidenceAt: coldAt },
      ),
      check(
        "data-fresh",
        "Replay truth freshness",
        5,
        replayFresh,
        ageDetail(replayAt, now),
        { evidenceAt: replayAt },
      ),
      check(
        "evidence",
        "Protected evidence / recovery authority",
        10,
        recovery.status === "VERIFIED" ||
          recoveryProgress.status === "COMPLETE"
          ? bridgeFresh
          : 0,
        String(recoveryProgress.status || recovery.status || "Not proven"),
        { evidenceAt: bridgeAt },
      ),
    ],
  );

  const categories: InspectionCategory[] = [
    speed,
    documentationCategory,
    organization,
    tests,
    releaseCategory,
    security,
    data,
  ];
  const overallScore = Math.round(
    categories.reduce((sum, item) => sum + item.score, 0) / categories.length,
  );

  const notes: string[] = [];
  if (!expiry.data) {
    notes.push(
      "Storage Expiry proof is still running; cold-checkpoint and reclaim-debt marks remain conservative.",
    );
  }
  if (extraVersions.length) {
    notes.push(
      "Watcher download store still contains legacy payload generations: " +
        extraVersions.join(", ") +
        ".",
    );
  }
  if (!coldCurrent || !edgeCurrent) {
    notes.push(
      "Fresh SpeedOS browser/edge proof is from the previous production release; rerun the bounded speed proof after deployment.",
    );
  }
  if (preservedDirty || preservedUnmerged) {
    notes.push(
      "A preserved dirty/unmerged non-agent workspace remains under review; its code is intentionally not deleted for cosmetic cleanliness.",
    );
  }
  if (numberValue(knowledge.docs_due_7d)) {
    notes.push(
      String(numberValue(knowledge.docs_due_7d)) +
        " documentation review(s) are due within seven days.",
    );
  }
  notes.push(
    "Python CI executes " +
      pythonFiles +
      " discovered contract files, but the per-run Python denominator is not yet sealed into the local release receipt.",
  );

  return {
    schema: 1,
    generatedAt: new Date(now).toISOString(),
    releaseSha,
    buildVersion,
    overallScore,
    overallState: stateForFraction(overallScore / 100),
    categories,
    notes,
  };
}
