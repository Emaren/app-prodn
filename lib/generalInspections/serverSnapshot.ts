import "server-only";

import {
  existsSync,
  readdirSync,
  readFileSync,
  statfsSync,
  statSync,
} from "node:fs";
import path from "node:path";

import baseline from "@/config/general-inspections-baseline.json";
import { WATCHER_RELEASE } from "@/lib/watcherRelease";
import { buildBridgeGeneralInspectionsSnapshot } from "./bridgeSnapshot.ts";
import {
  category,
  check,
  freshnessFraction,
  stateForFraction,
  thresholdFraction,
} from "./scoring.ts";
import type { GeneralInspectionsSnapshot, InspectionCategory } from "./types.ts";

type Json = Record<string, unknown>;

const APP_ROOT = process.env.GENERAL_INSPECTIONS_APP_ROOT || process.cwd();
const RELEASE_ROOT = path.join(APP_ROOT, ".aoe2war-release");
const VOLUME_ROOT = "/mnt/HC_Volume_105319120";
const AOE2WAR_VOLUME = path.join(VOLUME_ROOT, "aoe2war");
const DOWNLOAD_ROOT = path.join(VOLUME_ROOT, "aoe2-downloads");
const STORAGE_EXPIRY_ROOT = path.join(AOE2WAR_VOLUME, "os-control", "storage-expiry");

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return null;
}

function nested(root: unknown, keys: string[]): unknown {
  let current: unknown = root;
  for (const key of keys) current = record(current)[key];
  return current;
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

function latestFile(
  dir: string,
  predicate: (name: string) => boolean,
): string | null {
  const names = safeEntries(dir)
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  return names[0] ? path.join(dir, names[0]) : null;
}

function latestJson(dir: string, predicate: (name: string) => boolean) {
  const file = latestFile(dir, predicate);
  return { file, data: file ? readJson(file) : null };
}

function fileTime(file: string | null): string | null {
  if (!file) return null;
  try {
    return statSync(file).mtime.toISOString();
  } catch {
    return null;
  }
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
      usedPercent: totalBytes > 0 ? ((totalBytes - availableBytes) / totalBytes) * 100 : null,
    };
  } catch {
    return { totalBytes: null, availableBytes: null, freeGiB: null, usedPercent: null };
  }
}

function currentRelease(finish: Json | null) {
  const doctor = record(finish?.doctor);
  const doctorInfo = record(doctor.info);
  const estate = record(doctorInfo.estate);
  const estateInfo = record(estate.info);
  const release = record(estateInfo.release);
  const certification = record(release.certification);
  return {
    sha:
      text(release.production_source) ||
      text(certification.release_sha) ||
      text(nested(finish, ["certified_release", "release_sha"])),
    buildVersion:
      text(release.public_build_version) ||
      text(certification.build_version) ||
      text(nested(finish, ["certified_release", "build_version"])),
    state: text(release.state) || text(certification.status) || text(finish?.status),
    doctor,
    doctorInfo,
    estate,
    estateInfo,
    release,
  };
}

function latestColdReceipt(releaseSha: string | null) {
  if (!releaseSha) return { file: null, data: null as Json | null };
  const short = releaseSha.slice(0, 12);
  const dirs = safeEntries(path.join(RELEASE_ROOT, "performance-cold-lcp"))
    .filter((entry) => entry.isDirectory() && entry.name.includes(short) && entry.name.endsWith("-phone"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const dir of dirs) {
    const file = path.join(RELEASE_ROOT, "performance-cold-lcp", dir, "receipt.json");
    const data = readJson(file);
    if (data) return { file, data };
  }
  return { file: null, data: null as Json | null };
}

function latestFeaturedReceipt(releaseSha: string | null) {
  const dir = path.join(RELEASE_ROOT, "performance-edge-receipts");
  const names = safeEntries(dir)
    .filter((entry) => entry.isFile() && entry.name.endsWith("cloudflare-featured-avatar-apply.json"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const name of names) {
    const file = path.join(dir, name);
    const data = readJson(file);
    if (!data) continue;
    if (!releaseSha || text(nested(data, ["avatar_plan", "release_sha"])) === releaseSha) {
      return { file, data };
    }
  }
  return { file: null, data: null as Json | null };
}

function latestGate(releaseSha: string | null) {
  const dir = path.join(RELEASE_ROOT, "gates");
  const prefix = releaseSha ? releaseSha.slice(0, 12) + "-" : "";
  return latestJson(dir, (name) => name.endsWith(".json") && (!prefix || name.startsWith(prefix)));
}

function latestExpiryLedger() {
  const campaigns = safeEntries(STORAGE_EXPIRY_ROOT)
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("campaign-"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const campaign of campaigns) {
    const file = path.join(STORAGE_EXPIRY_ROOT, campaign, "ledger.json");
    const data = readJson(file);
    if (data) return { file, data };
  }
  return { file: null, data: null as Json | null };
}

function ratioFromRows(rows: unknown[], statusKey = "cf_cache_status", expected = "HIT") {
  const total = rows.length;
  const passed = rows.filter((row) => text(record(record(row).final)[statusKey]) === expected).length;
  return { passed, total };
}

function commandMap(gate: Json | null) {
  const map = new Map<string, Json>();
  for (const item of list(gate?.commands)) {
    const row = record(item);
    const label = text(row.label);
    if (label) map.set(label, row);
  }
  return map;
}

function commandPassed(commands: Map<string, Json>, label: string) {
  return integer(commands.get(label)?.returncode) === 0;
}

function nodeTestRatio(commands: Map<string, Json>) {
  const output = text(commands.get("active-node-test-contract")?.stdout_tail) || "";
  const match = output.match(/Running\s+(\d+)\s+active Node test files;\s+(\d+)\s+explicitly quarantined/i);
  if (!match) return null;
  const active = Number(match[1]);
  const quarantined = Number(match[2]);
  return { passed: commandPassed(commands, "active-node-test-contract") ? active : 0, total: active + quarantined };
}

function pythonTestRatio(commands: Map<string, Json>) {
  const output = text(commands.get("active-python-test-contract")?.stdout_tail) || "";
  const match = output.match(/Running\s+(\d+)\s+active Python contract files;\s+(\d+)\s+explicitly quarantined/i);
  if (!match) return null;
  const active = Number(match[1]);
  const quarantined = Number(match[2]);
  return { passed: commandPassed(commands, "active-python-test-contract") ? active : 0, total: active + quarantined };
}

function latestBuildSummary(cold: Json | null, key: string) {
  const summary = record(cold?.summary);
  const metric = record(summary[key]);
  return {
    p50: integer(metric.p50),
    p75: integer(metric.p75),
    p95: integer(metric.p95),
    max: integer(metric.max),
  };
}

function countImmediate(dir: string) {
  return safeEntries(dir).length;
}

function watcherVersions() {
  const versions = new Set<string>();
  const source = existsSync(DOWNLOAD_ROOT) ? DOWNLOAD_ROOT : path.join(APP_ROOT, "public", "downloads");
  for (const entry of safeEntries(source)) {
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
    const match = entry.name.match(/(?:^|[^0-9])(\d+\.\d+\.\d+)(?:[^0-9]|$)/);
    if (match) versions.add(match[1]);
  }
  return [...versions].sort();
}

function ageDetail(capturedAt: string | null) {
  if (!capturedAt) return "No sealed evidence timestamp";
  const age = Math.max(0, Date.now() - Date.parse(capturedAt));
  const hours = age / 3_600_000;
  if (hours < 1) return Math.round(age / 60_000) + "m old";
  if (hours < 48) return hours.toFixed(1) + "h old";
  return (hours / 24).toFixed(1) + "d old";
}

function buildLocalGeneralInspectionsSnapshot(): GeneralInspectionsSnapshot {
  const finishReceipt = latestJson(path.join(RELEASE_ROOT, "finish-receipts"), (name) => name.endsWith(".json"));
  const finish = finishReceipt.data;
  const release = currentRelease(finish);
  const releaseSha = release.sha;
  const finishAt =
    text(finish?.completed_at) || text(finish?.generated_at) || fileTime(finishReceipt.file);

  const gateReceipt = latestGate(releaseSha);
  const gate = gateReceipt.data;
  const gateAt = text(gate?.generated_at) || fileTime(gateReceipt.file);
  const commands = commandMap(gate);

  const coldReceipt = latestColdReceipt(releaseSha);
  const cold = coldReceipt.data;
  const coldAt =
    text(cold?.completedAt) || text(cold?.generatedAt) || text(cold?.createdAt) || fileTime(coldReceipt.file);
  const lcp = latestBuildSummary(cold, "lcpMs");
  const ready = latestBuildSummary(cold, "readyMs");
  const ttfb = latestBuildSummary(cold, "documentTtfbMs");
  const coldSummary = record(cold?.summary);
  const targetCounts = list(coldSummary.lcpTargets).map(record);
  const coldSamples = integer(cold?.samples) || 0;
  const topTarget = targetCounts.reduce(
    (max, value) => Math.max(max, integer(value.count) || 0),
    0,
  );

  const featuredReceipt = latestFeaturedReceipt(releaseSha);
  const featured = featuredReceipt.data;
  const featuredAt = fileTime(featuredReceipt.file);
  const verification = record(featured?.verification);
  const featuredRatio = ratioFromRows(list(verification.featured_avatar_rows));
  const staticRatio = ratioFromRows(list(verification.static_cohort));
  const dynamicRatio = ratioFromRows(list(verification.dynamic_cohort));

  const rootFs = filesystem("/");
  const volumeFs = filesystem(VOLUME_ROOT);
  const expiry = latestExpiryLedger();
  const expiryRows = list(expiry.data?.rows).map(record);
  const expiryDebt = expiryRows.filter((row) => row.action === "EXPIRE" && text(row.path) && existsSync(text(row.path) as string)).length;
  const protectedHot = list(expiry.data?.protected_hot).length;
  const protectedCold = list(expiry.data?.protected_cold).length;
  const versions = watcherVersions();
  const allowedVersions = new Set<string>([WATCHER_RELEASE.version]);
  if (WATCHER_RELEASE.previousVersion) {
    allowedVersions.add(WATCHER_RELEASE.previousVersion);
  }
  const extraVersions = versions.filter((version) => !allowedVersions.has(version));
  // Watcher release staging is governed by the dedicated digest-backed
  // watcher-staging retention lane. Raw presence can be protected unique
  // evidence, so the local fallback counts only generic staging debt.
  const stagingCount = [
    "build-scratch",
    "recovery-staging",
  ].reduce((sum, name) => sum + countImmediate(path.join(AOE2WAR_VOLUME, name)), 0);

  const doctor = release.doctor;
  const doctorInfo = release.doctorInfo;
  const estate = release.estate;
  const estateInfo = release.estateInfo;
  const host = record(doctorInfo.host);
  const maintenance = record(doctorInfo.maintenance_safety);
  const recovery = record(doctorInfo.offsite_evidence);
  const recoveryProgress = record(recovery.progress);
  const quality = record(estateInfo.central_quality_gates);
  const sourceCheckers = record(estateInfo.source_documentation_checkers);
  const maps = record(estateInfo.estate_maps);
  const centralRepo = record(estateInfo.central_repository);
  const sourceRepos = record(estateInfo.source_repositories);
  const taxonomy = record(estateInfo.taxonomy);
  const areas = record(estate.areas);

  const finishFresh = freshnessFraction(finishAt, 12, 72);
  const performanceFresh = freshnessFraction(coldAt, 24, 168);
  const edgeFresh = freshnessFraction(featuredAt, 24, 168);
  const gateFresh = freshnessFraction(gateAt, 24, 168);
  const macFresh = freshnessFraction(baseline.capturedAt, 48, 336);

  const speed = category(
    "speed",
    "Website Speed",
    "Cold-browser visual speed, readiness, edge delivery, and measurement validity.",
    [
      check("lcp50", "Cold phone LCP p50", 12, thresholdFraction(lcp.p50, 800, 1100, "lte"), lcp.p50 == null ? "No current cold-phone evidence" : Math.round(lcp.p50) + " ms", { evidenceAt: coldAt }),
      check("lcp95", "Cold phone LCP p95", 15, thresholdFraction(lcp.p95, 1000, 1400, "lte"), lcp.p95 == null ? "No current cold-phone evidence" : Math.round(lcp.p95) + " ms", { evidenceAt: coldAt }),
      check("ready50", "Ready p50", 10, thresholdFraction(ready.p50, 1000, 1300, "lte"), ready.p50 == null ? "No current readiness evidence" : Math.round(ready.p50) + " ms", { evidenceAt: coldAt }),
      check("ready95", "Ready p95", 10, thresholdFraction(ready.p95, 1500, 1900, "lte"), ready.p95 == null ? "No current readiness evidence" : Math.round(ready.p95) + " ms", { evidenceAt: coldAt }),
      check("ttfb95", "Document TTFB p95", 10, thresholdFraction(ttfb.p95, 650, 900, "lte"), ttfb.p95 == null ? "No current document timing evidence" : Math.round(ttfb.p95) + " ms", { evidenceAt: coldAt }),
      check("static-edge", "Static edge cohort", 10, staticRatio.total ? staticRatio.passed / staticRatio.total : 0, staticRatio.total ? staticRatio.passed + "/" + staticRatio.total + " HIT" : "No current edge receipt", { ratio: staticRatio, evidenceAt: featuredAt }),
      check("dynamic-edge", "Dynamic edge cohort", 8, dynamicRatio.total ? dynamicRatio.passed / dynamicRatio.total : 0, dynamicRatio.total ? dynamicRatio.passed + "/" + dynamicRatio.total + " HIT" : "No current dynamic-edge receipt", { ratio: dynamicRatio, evidenceAt: featuredAt }),
      check("featured-edge", "Featured avatar edge", 8, featuredRatio.total ? featuredRatio.passed / featuredRatio.total : 0, featuredRatio.total ? featuredRatio.passed + "/" + featuredRatio.total + " HIT" : "No current avatar-edge receipt", { ratio: featuredRatio, evidenceAt: featuredAt }),
      check("stable-lcp", "Stable LCP target", 7, coldSamples ? topTarget / coldSamples : 0, coldSamples ? topTarget + "/" + coldSamples + " launches share one LCP target" : "No current LCP target census", { ratio: { passed: topTarget, total: coldSamples }, evidenceAt: coldAt }),
      check("speed-fresh", "Performance evidence freshness", 10, Math.min(performanceFresh, edgeFresh), ageDetail(coldAt), { evidenceAt: coldAt }),
    ],
  );

  const docsCheckerRows = Object.values(sourceCheckers).map(record);
  const docsCheckerPassed = docsCheckerRows.filter((row) => integer(row.rc) === 0).length;
  const corpusTotal = integer(taxonomy.corpus_total) || 0;
  const intentionallyUnindexed = integer(taxonomy.intentionally_unindexed_count) || 0;
  const indexedTotal = integer(taxonomy.semantic_index_total) || 0;
  const indexTarget = Math.max(0, corpusTotal - intentionallyUnindexed);
  const systemMap = record(maps.SYSTEM_MAP);
  const storageMap = record(maps.SERVER_STORAGE_MAP);
  const docsCheck = record(quality["docs-check"]);
  const strictBuild = record(quality["strict-build"]);
  const taxonomyGate = record(quality["audit-taxonomy"]);
  const centralSynced = text(centralRepo.head) && text(centralRepo.head) === text(centralRepo.remote);

  const documentation = category(
    "documentation",
    "Documentation",
    "Living maps, source registries, taxonomy, strict docs builds, and source-bound context.",
    [
      check("doctor-docs", "Estate documentation gate", 10, areas.Documentation === "PASS" ? 1 : 0, String(areas.Documentation || "No current estate evidence"), { evidenceAt: finishAt }),
      check("docs-control", "Central documentation control", 15, integer(docsCheck.rc) === 0 ? 1 : 0, integer(docsCheck.rc) === 0 ? "PASS" : "Not proven", { evidenceAt: finishAt }),
      check("taxonomy", "Semantic documentation index", 10, indexTarget ? indexedTotal / indexTarget : 0, indexTarget ? indexedTotal + "/" + indexTarget + " required docs indexed" : "No taxonomy evidence", { ratio: { passed: indexedTotal, total: indexTarget }, evidenceAt: finishAt }),
      check("strict-doc-build", "Strict documentation build", 10, integer(strictBuild.rc) === 0 ? 1 : 0, integer(strictBuild.rc) === 0 ? "PASS" : "Not proven", { evidenceAt: finishAt }),
      check("audit-taxonomy", "Navigation / taxonomy audit", 10, integer(taxonomyGate.rc) === 0 ? 1 : 0, integer(taxonomyGate.rc) === 0 ? "PASS" : "Not proven", { evidenceAt: finishAt }),
      check("source-docs", "Source documentation checkers", 15, docsCheckerRows.length ? docsCheckerPassed / docsCheckerRows.length : 0, docsCheckerRows.length ? docsCheckerPassed + "/" + docsCheckerRows.length + " repositories" : "No source checker evidence", { ratio: { passed: docsCheckerPassed, total: docsCheckerRows.length }, evidenceAt: finishAt }),
      check("system-map", "SYSTEM_MAP source binding", 10, releaseSha && text(systemMap.current_source_sha) === releaseSha ? 1 : 0, text(systemMap.current_source_sha) === releaseSha ? "Bound to current source" : "Map is behind current source", { evidenceAt: finishAt }),
      check("storage-map", "SERVER_STORAGE_MAP source binding", 10, releaseSha && text(storageMap.current_source_sha) === releaseSha ? 1 : 0, text(storageMap.current_source_sha) === releaseSha ? "Bound to current source" : "Map is behind current source", { evidenceAt: finishAt }),
      check("central-doc-repo", "Central docs repository parity", 5, centralSynced ? 1 : 0, centralSynced ? "main = remote, clean at last audit" : "Central docs parity not proven", { evidenceAt: finishAt }),
      check("docs-fresh", "Documentation evidence freshness", 5, finishFresh, ageDetail(finishAt), { evidenceAt: finishAt }),
    ],
  );

  const rootFraction = thresholdFraction(rootFs.freeGiB, baseline.policy.rootPreferredGiB, baseline.policy.rootHardFloorGiB, "gte");
  const volumeFraction = thresholdFraction(volumeFs.usedPercent, baseline.policy.volumeHealthyTargetPercent, baseline.policy.volumeMaintenancePercent, "lte");
  const macFreeGiB = baseline.mac.availableKb / 1024 / 1024;
  const expiryFraction = expiryDebt === 0 ? 1 : expiryDebt <= 5 ? 0.75 : expiryDebt <= 20 ? 0.4 : 0.1;
  const watcherFraction = versions.length > 0 && extraVersions.length === 0 ? 1 : extraVersions.length <= 2 ? 0.75 : 0.25;
  const stagingFraction = stagingCount === 0 ? 1 : stagingCount <= 2 ? 0.75 : 0.25;

  const organization = category(
    "organization",
    "Organization & Storage",
    "Headroom, lean retention, download hygiene, staging discipline, and bounded local caches.",
    [
      check("root-free", "VPS root headroom", 15, rootFraction, rootFs.freeGiB == null ? "Root filesystem unavailable" : rootFs.freeGiB.toFixed(2) + " GiB free"),
      check("volume-used", "Evidence volume utilization", 15, volumeFraction, volumeFs.usedPercent == null ? "Volume filesystem unavailable" : volumeFs.usedPercent.toFixed(1) + "% used"),
      check("mac-free", "Mac operator headroom", 10, thresholdFraction(macFreeGiB, 50, 35, "gte") * macFresh, macFreeGiB.toFixed(1) + " GiB at last capture · " + ageDetail(baseline.capturedAt), { evidenceAt: baseline.capturedAt }),
      check("hot-rollbacks", "Hot rollback window", 10, protectedHot === baseline.policy.hotRollbackCount ? 1 : protectedHot > 0 ? 0.75 : 0, protectedHot + "/" + baseline.policy.hotRollbackCount + " protected hot generations", { ratio: { passed: Math.min(protectedHot, baseline.policy.hotRollbackCount), total: baseline.policy.hotRollbackCount }, evidenceAt: fileTime(expiry.file) }),
      check("cold-checkpoints", "Cold checkpoint window", 10, protectedCold === baseline.policy.coldCheckpointCount ? 1 : protectedCold > 0 ? 0.75 : 0, protectedCold + "/" + baseline.policy.coldCheckpointCount + " protected cold checkpoints", { ratio: { passed: Math.min(protectedCold, baseline.policy.coldCheckpointCount), total: baseline.policy.coldCheckpointCount }, evidenceAt: fileTime(expiry.file) }),
      check("expiry-debt", "Superseded runtime debt", 15, expiryFraction, expiry.data ? expiryDebt + " proven runtime bodies still reclaimable" : "No current lean-retention ledger", { evidenceAt: fileTime(expiry.file) }),
      check("watcher-downloads", "Watcher download generations", 10, watcherFraction, versions.length ? "Versions present: " + versions.join(", ") : "Download inventory unavailable"),
      check("staging", "Scratch / staging queues", 5, stagingFraction, stagingCount + " generic staging entries · watcher staging governed separately"),
      check("worktrees", "Mac worktree hygiene", 5, baseline.mac.worktreesClean ? macFresh : 0, baseline.mac.worktreesClean ? "Clean at last Mac capture · " + ageDetail(baseline.capturedAt) : "Mac worktree hygiene not proven", { evidenceAt: baseline.capturedAt }),
      check("caches", "Regenerable cache hygiene", 5, baseline.mac.regenerableCachesCleared ? macFresh : 0, baseline.mac.regenerableCachesCleared ? "Mac build/npm caches cleared at last capture" : "Cache cleanup not proven", { evidenceAt: baseline.capturedAt }),
    ],
  );

  const nodeRatio = nodeTestRatio(commands);
  const pythonRatio = pythonTestRatio(commands);
  const tests = category(
    "tests",
    "Test & Build Integrity",
    "Executable contracts, type safety, lint, dependency boundaries, production build proof, and secret scanning.",
    [
      check("node-tests", "Active Node test files", 20, nodeRatio ? nodeRatio.passed / nodeRatio.total : 0, nodeRatio ? nodeRatio.passed + "/" + nodeRatio.total + " active files" : "Node test receipt missing", { ratio: nodeRatio || { passed: 0, total: 0 }, evidenceAt: gateAt }),
      check("python-tests", "Python contract files", 10, pythonRatio ? (pythonRatio.passed / pythonRatio.total) * gateFresh : 0, pythonRatio ? pythonRatio.passed + "/" + pythonRatio.total + " active files" : "Python test receipt missing", { ratio: pythonRatio || { passed: 0, total: 0 }, evidenceAt: gateAt }),
      check("typescript", "TypeScript", 15, commandPassed(commands, "typescript") ? gateFresh : 0, commandPassed(commands, "typescript") ? "PASS" : "Current local gate not proven", { ratio: { passed: commandPassed(commands, "typescript") ? 1 : 0, total: 1 }, evidenceAt: gateAt }),
      check("eslint", "ESLint", 10, commandPassed(commands, "eslint-full") || commandPassed(commands, "eslint-changed") ? gateFresh : 0, commandPassed(commands, "eslint-full") || commandPassed(commands, "eslint-changed") ? "PASS" : "Current lint gate not proven", { ratio: { passed: commandPassed(commands, "eslint-full") || commandPassed(commands, "eslint-changed") ? 1 : 0, total: 1 }, evidenceAt: gateAt }),
      check("docs-gate", "Documentation gate", 10, commandPassed(commands, "documentation-control-plane") ? gateFresh : 0, commandPassed(commands, "documentation-control-plane") ? "PASS" : "Not proven", { ratio: { passed: commandPassed(commands, "documentation-control-plane") ? 1 : 0, total: 1 }, evidenceAt: gateAt }),
      check("secret-scan", "Tracked secret scan", 10, commandPassed(commands, "tracked-secret-scan") ? gateFresh : 0, commandPassed(commands, "tracked-secret-scan") ? "PASS" : "Not proven", { ratio: { passed: commandPassed(commands, "tracked-secret-scan") ? 1 : 0, total: 1 }, evidenceAt: gateAt }),
      check("dependency", "Dependency contract", 10, commandPassed(commands, "dependency-contract") ? gateFresh : 0, commandPassed(commands, "dependency-contract") ? "PASS" : "Not proven", { ratio: { passed: commandPassed(commands, "dependency-contract") ? 1 : 0, total: 1 }, evidenceAt: gateAt }),
      check("prisma", "Prisma generation", 5, commandPassed(commands, "prisma-generate") ? gateFresh : 0, commandPassed(commands, "prisma-generate") ? "PASS" : "Not proven for current gate", { ratio: { passed: commandPassed(commands, "prisma-generate") ? 1 : 0, total: 1 }, evidenceAt: gateAt }),
      check("production-build", "Certified production build", 10, release.state === "CERTIFIED" ? finishFresh : 0, release.state || "No certified release evidence", { ratio: { passed: release.state === "CERTIFIED" ? 1 : 0, total: 1 }, evidenceAt: finishAt }),
    ],
  );

  const estateP0 = integer(estate.p0);
  const estateP1 = integer(estate.p1);
  const releaseInfo = release.release;
  const certification = record(releaseInfo.certification);
  const buildParity = text(releaseInfo.public_build_version) && text(releaseInfo.public_build_version) === text(releaseInfo.internal_build_version);
  const sourceReposRows = Object.values(sourceRepos).map(record);
  const cleanSources = sourceReposRows.filter((row) => integer(row.dirty_count) === 0 && text(row.head) === text(row.remote)).length;
  const doctorCategories = Object.values(record(doctor.categories));
  const doctorPasses = doctorCategories.filter((value) => value === "PASS").length;
  const doctorBlockers = integer(doctor.blockers) || 0;
  const explicitDoctorScore = integer(doctor.score);
  const derivedDoctorScore = doctorCategories.length
    ? Math.max(
        0,
        Math.round((doctorPasses / doctorCategories.length) * 100) - doctorBlockers * 25,
      )
    : 0;
  const doctorScore = explicitDoctorScore ?? derivedDoctorScore;

  const releaseCategory = category(
    "release",
    "Release & Runtime Integrity",
    "Certified source identity, Doctor state, estate findings, service health, parity, rollback, and Finish proof.",
    [
      check("certified", "Certified release", 15, release.state === "CERTIFIED" ? finishFresh : 0, release.state || "No current certification", { evidenceAt: finishAt }),
      check("doctor", "Doctor score", 15, (doctorScore / 100) * finishFresh, doctorScore + "/100", { ratio: { passed: doctorScore, total: 100 }, evidenceAt: finishAt }),
      check("estate-findings", "Estate P0 / P1", 15, estateP0 === 0 && estateP1 === 0 ? finishFresh : estateP0 === 0 ? 0.5 * finishFresh : 0, "P0 " + String(estateP0 ?? "?") + " · P1 " + String(estateP1 ?? "?"), { evidenceAt: finishAt }),
      check("build-parity", "Public / internal build parity", 10, buildParity ? finishFresh : 0, buildParity ? "Exact" : "Parity not proven", { evidenceAt: finishAt }),
      check("service", "Production web service", 10, text(host.service) === "active" ? finishFresh : 0, text(host.service) || "Unknown", { evidenceAt: finishAt }),
      check("source-parity", "Source repository parity", 10, sourceReposRows.length ? cleanSources / sourceReposRows.length * finishFresh : 0, sourceReposRows.length ? cleanSources + "/" + sourceReposRows.length + " repositories clean and synced" : "No source repository census", { ratio: { passed: cleanSources, total: sourceReposRows.length }, evidenceAt: finishAt }),
      check("receipt", "Activation receipt binding", 10, text(certification.receipt_path) && text(certification.release_sha) === releaseSha ? finishFresh : 0, text(certification.receipt_path) ? "Receipt bound to current source" : "No bound activation receipt", { evidenceAt: finishAt }),
      check("finish", "Finish closure", 15, text(finish?.status) === "CERTIFIED" ? finishFresh : 0, text(finish?.status) || "No Finish receipt", { evidenceAt: finishAt }),
    ],
  );

  const recoveryProven = integer(recoveryProgress.proven_count) || 0;
  const recoveryRequired = integer(recoveryProgress.required_count) || 0;
  const maintenanceProblems = list(maintenance.problems).length;
  const secretPass = commandPassed(commands, "tracked-secret-scan");
  const hostUpdatesTotal = integer(host.updates_total);
  const hostUpdatesActionable = integer(host.updates_actionable);
  const hostUpdatesPhased = integer(host.updates_phased_deferred) || 0;
  const hostUpdates = hostUpdatesActionable ?? hostUpdatesTotal;

  const security = category(
    "security",
    "Security & Resilience",
    "VPSSentry, host patch state, firewall/maintenance posture, recovery evidence, secret scanning, and capacity resilience.",
    [
      check("vpssentry", "VPSSentry criticals", 15, integer(host.vpssentry_probe_ok) === 1 && integer(host.vpssentry_critical_count) === 0 ? finishFresh : 0, "criticals " + String(integer(host.vpssentry_critical_count) ?? "?"), { evidenceAt: finishAt }),
      check("failed-units", "Failed systemd units", 10, integer(host.failed_units) === 0 ? finishFresh : 0, String(integer(host.failed_units) ?? "?") + " failed", { evidenceAt: finishAt }),
      check("updates", "Host updates", 10, hostUpdates === 0 ? finishFresh : hostUpdates == null ? 0 : 0.5 * finishFresh, hostUpdates == null ? "Unknown" : hostUpdates + " actionable" + (hostUpdatesPhased ? " · " + hostUpdatesPhased + " phased" : ""), { evidenceAt: finishAt }),
      check("reboot", "Reboot requirement", 10, integer(host.reboot_required) === 0 ? finishFresh : 0, integer(host.reboot_required) === 0 ? "Not required" : "Required", { evidenceAt: finishAt }),
      check("maintenance", "Maintenance safety rail", 10, maintenanceProblems === 0 ? finishFresh : 0, maintenanceProblems === 0 ? "No maintenance-safety problems" : maintenanceProblems + " problem(s)", { evidenceAt: finishAt }),
      check("secrets", "Tracked secret scan", 10, secretPass ? gateFresh : 0, secretPass ? "PASS" : "Not proven", { ratio: { passed: secretPass ? 1 : 0, total: 1 }, evidenceAt: gateAt }),
      check("recovery", "Recovery classes proven", 15, recoveryRequired ? recoveryProven / recoveryRequired * finishFresh : 0, recoveryRequired ? recoveryProven + "/" + recoveryRequired + " recovery classes" : "No recovery proof", { ratio: { passed: recoveryProven, total: recoveryRequired }, evidenceAt: finishAt }),
      check("root-resilience", "Root capacity resilience", 10, rootFraction, rootFs.freeGiB == null ? "Root filesystem unavailable" : rootFs.freeGiB.toFixed(2) + " GiB free"),
      check("security-fresh", "Security evidence freshness", 10, finishFresh, ageDetail(finishAt), { evidenceAt: finishAt }),
    ],
  );

  const watcherChecker = record(sourceCheckers["aoe2-watcher"]);
  const watcherCurrent = (text(watcherChecker.summary) || "").includes(WATCHER_RELEASE.version);
  const data = category(
    "data",
    "Data / Wolo / Replay Integrity",
    "Settlement boundaries, Wolo services, replay/parser truth, recovery coverage, Watcher release, and protected evidence.",
    [
      check("wolo-8092", "Wolo settlement 8092", 15, text(host.wolo8092) === "1" ? finishFresh : 0, "listener count " + String(text(host.wolo8092) || "?"), { evidenceAt: finishAt }),
      check("wolo-8093", "Wolo founder rewards 8093", 10, text(host.wolo8093) === "1" ? finishFresh : 0, "listener count " + String(text(host.wolo8093) || "?"), { evidenceAt: finishAt }),
      check("wolo-estate", "WoloChain estate", 10, areas.WoloChain === "PASS" ? finishFresh : 0, String(areas.WoloChain || "Not proven"), { evidenceAt: finishAt }),
      check("parser-estate", "API / Parser estate", 10, areas["API / Parser"] === "PASS" ? finishFresh : 0, String(areas["API / Parser"] || "Not proven"), { evidenceAt: finishAt }),
      check("recovery-data", "Recovery coverage", 10, recoveryRequired ? recoveryProven / recoveryRequired * finishFresh : 0, recoveryRequired ? recoveryProven + "/" + recoveryRequired + " classes" : "No recovery proof", { ratio: { passed: recoveryProven, total: recoveryRequired }, evidenceAt: finishAt }),
      check("watcher-release", "Watcher release contract", 10, watcherCurrent ? finishFresh : 0, watcherCurrent ? "Current " + WATCHER_RELEASE.version : "Watcher release checker behind", { evidenceAt: finishAt }),
      check("db-mutation", "Finish database mutation boundary", 10, finish?.database_mutated === false ? finishFresh : 0, finish?.database_mutated === false ? "No database mutation" : "Mutation boundary not clean", { evidenceAt: finishAt }),
      check("wolo-mutation", "Finish Wolo mutation boundary", 10, finish?.wolo_mutated_by_finish === false ? finishFresh : 0, finish?.wolo_mutated_by_finish === false ? "No Wolo mutation" : "Mutation boundary not clean", { evidenceAt: finishAt }),
      check("data-fresh", "Data truth freshness", 5, finishFresh, ageDetail(finishAt), { evidenceAt: finishAt }),
      check("evidence", "Protected evidence / recovery authority", 10, text(recovery.status) === "VERIFIED" || text(recoveryProgress.status) === "COMPLETE" ? finishFresh : 0, text(recoveryProgress.status) || text(recovery.status) || "Recovery authority not proven", { evidenceAt: finishAt }),
    ],
  );

  const categories: InspectionCategory[] = [
    speed,
    documentation,
    organization,
    tests,
    releaseCategory,
    security,
    data,
  ];
  const overallScore = Math.round(categories.reduce((sum, item) => sum + item.score, 0) / categories.length);

  const notes: string[] = [];
  if (!expiry.data) notes.push("No current Storage Expiry ledger is sealed yet; Organization score stays conservative.");
  if (extraVersions.length) notes.push("Watcher download store still contains legacy generations: " + extraVersions.join(", ") + ".");
  if (!pythonRatio) notes.push("Python contract proof is missing from the certified release receipt; Test & Build Integrity remains fail-closed.");

  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    releaseSha,
    buildVersion: release.buildVersion,
    overallScore,
    overallState: stateForFraction(overallScore / 100),
    categories,
    notes,
  };
}

export function buildGeneralInspectionsSnapshot(): GeneralInspectionsSnapshot {
  return (
    buildBridgeGeneralInspectionsSnapshot() ||
    buildLocalGeneralInspectionsSnapshot()
  );
}
