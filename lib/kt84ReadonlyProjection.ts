/**
 * KT84 WE3 → WE2 read-only PUBLIC-PROJECTION verifier.
 * Source proposal only: no producer key or private telemetry is installed.
 * The website holds a PUBLIC Ed25519 key and consumes a root-owned, sanitized
 * projection file. It cannot open original UID501/650 SQLite or issue orders.
 */
import { createPublicKey, verify as verifyEd25519 } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";

export const KT84_SOURCE_SHA = "ad376120dd012c396898f15915a9e0c0b2e760cb";
export const KT84_STUDY_SHA = "0662f9da7be5d8e14e2fb48762872bd96f79c637fc7eb79781373086e14ff44f";
export const KT84_PAYLOAD_SCHEMA = "KT84_STELLAR_ONE_BOT_PRIVATE_READONLY_TELEMETRY_V1";
export const KT84_SIGNED_SCHEMA = "aoe2war.kt84.we3-sanitized-ed25519.v1";
export const KT84_ENVELOPE_PATH = "/var/lib/aoe2war-kt-readonly/kt84-public-projection-v1.json";
export const KT84_DOMAIN = "AOE2WAR:KT84:WE3:SANITIZED:READONLY:V1\0";
const MAX_BYTES = 128 * 1024;
const HEX64 = /^[a-f0-9]{64}$/;
const SOURCE_CODES = ["stellar-classic", "soroswap-amm", "aquarius", "sushi", "comet", "soroswap-aggregator"] as const;
const SOURCE_NAMES = ["Stellar Classic native DEX", "Soroswap AMM", "Aquarius", "Sushi on Stellar", "Comet", "Soroswap Aggregator"] as const;
const SUMMARY_VALUE = "99.999845443923960000";

export type Kt84SafeProvider = {
  id: string; title: string; role: string; sourceStatus: string;
  quotedAtUTC: string | null; dataAgeSeconds: number | null;
  sourceLedger: number | null; independentLiquiditySource: boolean;
  executionAdmitted: false;
};
export type Kt84SafeView = {
  schema: "aoe2war.kt84.we2-projected-history.v1";
  sourceKind: "SIGNED_WE3_HISTORICAL_ONLY";
  originalSourceSha: string;
  sourceObservedAtUTC: string;
  signedAtUTC: string;
  studyReceiptSHA256: string;
  historicalBot: {
    botId: string; state: "HISTORICAL_HALTED";
    cashUSDC: string; inventoryXLM: string;
    feesUSDC: string; realizedPaperPnLUSDC: string;
    financeHead: string; operatorHead: string;
  };
  newAccount: null;
  worker: {status: "NOT_RUNNING_NOT_INSTALLED"; verifiedHeartbeat: false};
  providers: Kt84SafeProvider[];
  opportunities: {route: string; decision: string; reason: string}[];
  fleet: {capacity: 100; pageSize: 10; entries: {slot: number; status: string}[]};
  wallet: {status: "WATCH_ONLY_NOT_CONNECTED"; address: null; fundingAdmitted: false};
  microBudget: {totalUSD: "10"; status: "HOLD"; reserves: null; fees: null; executionAdmitted: false};
};

function record(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x)) throw Error("KT84_INVALID_OBJECT");
  return x as Record<string, unknown>;
}
function validClock(x: unknown): number {
  if (typeof x !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(x)) throw Error("KT84_INVALID_UTC_CLOCK");
  const n = Date.parse(x);
  if (!Number.isFinite(n)) throw Error("KT84_INVALID_UTC_CLOCK");
  return n;
}
function money(x: unknown, max = 32): string {
  if (typeof x !== "string" || x.length > max || !/^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,18})?$/.test(x)) throw Error("KT84_INVALID_AMOUNT");
  return x;
}
function textValue(x: unknown, max = 180): string {
  if (typeof x !== "string" || x.length === 0 || x.length > max || /[\u0000-\u001f]/.test(x)) throw Error("KT84_INVALID_TEXT");
  return x;
}
function pin(x: unknown, length = 64): string {
  if (typeof x !== "string" || x.length !== length || !new RegExp("^[a-f0-9]{"+length+"}$").test(x)) throw Error("KT84_INVALID_PIN");
  return x;
}
export function kt84Canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(kt84Canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + kt84Canonical(v[k])).join(",") + "}";
  }
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  throw Error("KT84_UNCANONICAL_SOURCE");
}
function project(payload: unknown, originalSourceSha: string, signedAtUTC: string): Kt84SafeView {
  const p = record(payload), bot = record(p.bot), worker = record(p.worker);
  if (p.schema !== KT84_PAYLOAD_SCHEMA || p.sourceOwner !== "WE3_PRODUCT_READ_ONLY" ||
      p.authenticationRequiredByHost !== true || p.noBotWritersOrPrivateKeys !== true ||
      p.exportIsHistorical !== true || p.currentlyLive !== false ||
      p.currentRuntimeVerified !== false || p.realOrders !== 0 || p.fundedAuthority !== false ||
      p.studyReceiptSHA256 !== KT84_STUDY_SHA ||
      worker.status !== "NOT_RUNNING_NOT_INSTALLED" ||
      worker.lastSignedCommand !== null || worker.originalControlCryptographicallySigned !== false)
    throw Error("KT84_PROVENANCE_OR_WORKER_HOLD");
  if (bot.status !== "HISTORICAL_HALTED" || bot.botId !== "stellar-paper-001" ||
      bot.cashUSDC !== SUMMARY_VALUE || bot.inventoryXLM !== "0" ||
      bot.profitIsHypothetical !== true) throw Error("KT84_ORIGINAL_HISTORY_MISMATCH");
  const financeHead = pin(bot.moneyJournalSHA256Head);
  const operatorHead = pin(bot.originalControlSHA256Head);
  const researchAt = p.observedAtUTC as unknown;
  validClock(researchAt);
  const list = p.providers;
  if (!Array.isArray(list) || list.length !== 6) throw Error("KT84_SIX_PROVIDER_HOLD");
  const providers: Kt84SafeProvider[] = list.map((raw, i) => {
    const v = record(raw);
    if (v.id !== SOURCE_CODES[i] || v.title !== SOURCE_NAMES[i] ||
        v.executionAdmitted !== false || v.fundedTradesAdmitted !== false ||
        v.dataFresh !== false || v.researchOnly !== true ||
        v.independentLiquiditySource !== (i !== 5) ||
        v.notToCountTwice !== (i === 5) || v.roundtripAllCost !== null ||
        v.sorobanResourceFee !== null) throw Error("KT84_PROVIDER_ROLE_OR_ADMISSION_HOLD");
    if (i >= 2 && i <= 4 &&
      (v.sourceLedger !== null || v.liquidityUSDC !== null ||
       v.liquidityXLM !== null)) throw Error("KT84_UNOBSERVED_PROVIDER_FAKE_DATA");
    if (i === 5 && (v.liquidityUSDC !== null || v.liquidityXLM !== null ||
      v.sourceLedger !== null)) throw Error("KT84_ROUTER_DOUBLE_COUNT");
    const at = v.quoteObservedAtUTC === null ? null : textValue(v.quoteObservedAtUTC);
    if (at !== null) validClock(at);
    const ledger = v.sourceLedger;
    if (!(ledger === null || (Number.isSafeInteger(ledger) && (ledger as number) > 0))) throw Error("KT84_BAD_LEDGER");
    const age = v.dataAgeSeconds;
    if (!(age === null || (Number.isSafeInteger(age) && (age as number) >= 0))) throw Error("KT84_BAD_SOURCE_AGE");
    return {
      id: SOURCE_CODES[i], title: SOURCE_NAMES[i], role: textValue(v.type, 35),
      sourceStatus: textValue(v.sourceStatus, 80), quotedAtUTC: at,
      dataAgeSeconds: age as number | null, sourceLedger: ledger as number | null,
      independentLiquiditySource: i !== 5, executionAdmitted: false,
    };
  });
  const research = p.opportunities;
  if (!Array.isArray(research) || research.length !== 10) throw Error("KT84_RESEARCH_ROW_HOLD");
  const opportunities = research.map(raw => {
    const x = record(raw);
    if (x.realOrders !== 0 || x.eligibleForPaper !== false ||
      x.allCostProfitUSDC !== null || x.sourceReceiptSHA256 !== KT84_STUDY_SHA ||
      typeof x.decision !== "string" || !x.decision.startsWith("REJECT")) throw Error("KT84_RESEARCH_REJECT_HOLD");
    return {route: textValue(x.route, 120), decision: textValue(x.decision, 80), reason: textValue(x.reason, 180)};
  });
  const f = record(p.fleet);
  if (f.capacity !== 100 || f.pageSize !== 10 || f.commissionedNow !== 0 ||
      !Array.isArray(f.entries) || f.entries.length !== 100) throw Error("KT84_FLEET_HOLD");
  const entries = f.entries.map((raw, index) => {
    const x = record(raw);
    if (x.slot !== index + 1 || x.status !== (index === 0 ? "HISTORICAL_HALTED" : "UNCOMMISSIONED") ||
        x.realOrders !== 0 || x.signedOperatorPresent !== false)
      throw Error("KT84_FLEET_FALSE_RUNNING");
    return {slot: index + 1, status: x.status as string};
  });
  const wallet = record(p.wallet), budget = record(p.microBudget);
  if (wallet.role !== "WATCH_ONLY_NOT_CONNECTED" || wallet.address !== null ||
      wallet.fundedTradingAdmitted !== false || budget.targetTotalUSD !== "10" ||
      budget.fundedTradingAdmitted !== false || budget.budgetFeasible !== null ||
      budget.signer !== null) throw Error("KT84_FUNDED_OR_WALLET_HOLD");
  return {
    schema: "aoe2war.kt84.we2-projected-history.v1",
    sourceKind: "SIGNED_WE3_HISTORICAL_ONLY",
    originalSourceSha,
    sourceObservedAtUTC: researchAt as string,
    signedAtUTC,
    studyReceiptSHA256: KT84_STUDY_SHA,
    historicalBot: {
      botId: "stellar-paper-001", state: "HISTORICAL_HALTED",
      cashUSDC: money(bot.cashUSDC), inventoryXLM: money(bot.inventoryXLM),
      feesUSDC: money(bot.feesUSDC), realizedPaperPnLUSDC: money(bot.realizedPaperPnLUSDC),
      financeHead, operatorHead,
    },
    newAccount: null, // KT83 PAUSED needs a separate independently signed account receipt.
    worker: {status: "NOT_RUNNING_NOT_INSTALLED", verifiedHeartbeat: false},
    providers, opportunities,
    fleet: {capacity: 100, pageSize: 10, entries},
    wallet: {status: "WATCH_ONLY_NOT_CONNECTED", address: null, fundingAdmitted: false},
    microBudget: {totalUSD: "10", status: "HOLD", reserves: null, fees: null, executionAdmitted: false},
  };
}

/** A WE3 signer must explicitly sign the metadata + exact original payload. */
export function verifyKt84Envelope(envelope: unknown, publicPem: string, clock = new Date()): Kt84SafeView {
  if (!publicPem.startsWith("-----BEGIN PUBLIC KEY-----") || publicPem.includes("PRIVATE KEY"))
    throw Error("KT84_PUBLIC_VERIFIER_UNAVAILABLE");
  const root = record(envelope);
  if (root.schema !== KT84_SIGNED_SCHEMA || root.sourceSha !== KT84_SOURCE_SHA)
    throw Error("KT84_SOURCE_VERSION_HOLD");
  const issued = validClock(root.signedAtUTC);
  const expires = validClock(root.expiresAtUTC);
  const now = clock.getTime();
  if (issued > now + 60_000 || now - issued > 24 * 3600_000 ||
      expires <= now || expires <= issued || expires - issued > 24 * 3600_000)
    throw Error("KT84_SIGNED_RECEIPT_EXPIRED");
  const b64 = root.signatureBase64;
  if (typeof b64 !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(b64))
    throw Error("KT84_SIGNATURE_MISSING");
  const signature = Buffer.from(b64, "base64");
  if (signature.byteLength !== 64 || signature.toString("base64") !== b64) throw Error("KT84_SIGNATURE_BYTES");
  const signed = {
    schema: root.schema, sourceSha: root.sourceSha,
    signedAtUTC: root.signedAtUTC, expiresAtUTC: root.expiresAtUTC,
    payload: root.payload,
  };
  const key = createPublicKey(publicPem);
  if (key.asymmetricKeyType !== "ed25519") throw Error("KT84_WRONG_KEY_TYPE");
  const exactBytes = Buffer.from(KT84_DOMAIN + kt84Canonical(signed), "utf8");
  if (!verifyEd25519(null, exactBytes, key, signature)) throw Error("KT84_AUTHENTICITY_FAILED");
  return project(root.payload, root.sourceSha as string, root.signedAtUTC as string);
}

/** Existing website has only public verifier. Unsigned source is never served. */
export async function readKt84ProductionProjection(): Promise<Kt84SafeView> {
  const publicPem = process.env.KT84_WE3_TELEMETRY_PUBLIC_PEM;
  if (!publicPem) throw Error("KT84_PUBLIC_VERIFIER_NOT_ENROLLED");
  const location = KT84_ENVELOPE_PATH;
  const parent = await fs.lstat("/var/lib/aoe2war-kt-readonly");
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== 0 ||
      (parent.mode & 0o022) !== 0) throw Error("KT84_UNTRUSTED_ROOT_DIRECTORY");
  const before = await fs.lstat(location);
  if (!before.isFile() || before.isSymbolicLink() || before.uid !== 0 ||
      before.nlink !== 1 || before.size <= 0 || before.size > MAX_BYTES ||
      (before.mode & 0o022) !== 0) throw Error("KT84_UNTRUSTED_ROOT_FILE");
  const handle = await fs.open(location, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const actual = await handle.stat();
    if (actual.dev !== before.dev || actual.ino !== before.ino ||
        actual.size !== before.size || actual.mtimeMs !== before.mtimeMs)
      throw Error("KT84_FILE_CHANGED_BEFORE_READ");
    const buffer = await handle.readFile();
    if (buffer.byteLength !== before.size || buffer.byteLength > MAX_BYTES)
      throw Error("KT84_FILE_LENGTH_CHANGED");
    const after = await handle.stat();
    if (after.dev !== actual.dev || after.ino !== actual.ino ||
        after.mtimeMs !== actual.mtimeMs || after.size !== actual.size)
      throw Error("KT84_FILE_CHANGED_DURING_READ");
    return verifyKt84Envelope(JSON.parse(buffer.toString("utf8")), publicPem);
  } finally {
    await handle.close();
  }
}
