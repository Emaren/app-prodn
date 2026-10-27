/**
 * Phase 5, STACKED HELD INTEGRATION: authenticated external-witness intake.
 * No Wolo/CometBFT proof verification is implemented in this module.
 *
 * Source trust roots MUST be independently pinned outside of caller JSON;
 * a signature over an unsupported bank statement is not an ICS23/Comet proof.
 * This module is not mounted in a production route and cannot grant funding.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { NEW_EPOCH_HD_MAINNET_ENABLED } from "./warSatchelNewEpochFinancialContracts.ts";

export const EPOCH_V3_EXECUTION_ENABLED = false as const;
export const EPOCH_V3_WITNESS_DOMAIN = "aoe2war/new-epoch-v3/witness/1" as const;
const H = /^[a-f0-9]{64}$/;
const NAT = /^(0|[1-9][0-9]{0,38})$/;
const ROLES = [
  "native_chain", "bank_vault", "bank_escrow", "custody_vault", "custody_escrow",
  "writer_fence", "owner_approval", "finance_census", "recovery"
] as const;
export type EpochWitnessRole = typeof ROLES[number];
export type EpochWitness = Readonly<{
  domain: string; role: EpochWitnessRole; epochId: string; chainId: string;
  observedAtMs: number; expiresAtMs: number; sourceCommit: string;
  evidence: Record<string, unknown>; signatureBase64: string;
}>;
export type EpochPinnedWitnessKey = Readonly<{
  role: EpochWitnessRole; publicKeySpkiPem: string; expectedKeySha256: string;
}>;
export type EpochEvidenceBundle = Readonly<{
  epochId: string; sourceCommit: string; observedAtMs: number;
  witnesses: readonly EpochWitness[];
}>;
export type EpochDiagnostic = Readonly<{
  code: string; severity: "BLOCKER"; domain: string;
  evidenceSource: string; freshness: "MISSING" | "STALE" | "INVALID" | "SOURCE_BOUND";
  owner: "Codex/Wolo" | "Owner/HEL1" | "HD/DE Finance" | "Central Command";
  recovery: string;
}>;

const EXPLAIN: Record<string, Omit<EpochDiagnostic, "code" | "freshness">> = {
  SIGNER_COLLISION: { severity:"BLOCKER", domain:"custody", evidenceSource:"native account+OS keyring witness",owner:"Codex/Wolo", recovery:"Provide independent pubkey-address derivation and exclusive OS keyring/lease inspection; no 8092 fallback" },
  RESERVE_DEFICIT: { severity:"BLOCKER",domain:"solvency",evidenceSource:"two native H/H+1 account bank witnesses",owner:"HD/DE Finance",recovery:"Quarantine this account and reconcile unique obligations; never net vault and escrow" },
  INVALID_EPOCH: { severity:"BLOCKER",domain:"epoch",evidenceSource:"immutable signed epoch+source manifest",owner:"Codex/Wolo",recovery:"Re-enrol correct epoch from actual reviewed source and real owner approval" },
  STALE_BANK_PROOF: { severity:"BLOCKER",domain:"chain",evidenceSource:"trusted native Comet header and bank commitments",owner:"Codex/Wolo",recovery:"Obtain independently verified fresh same-height root H/H+1; do not reuse stale proofs" },
  UNCERTAIN_BROADCAST: { severity:"BLOCKER",domain:"journal",evidenceSource:"durable pre-sign attempt and immutable operation lookup",owner:"Codex/Wolo",recovery:"Maintain UNKNOWN_NO_REPLAY; reconcile independently, do not re-sign" },
  WRITER_FENCE_MISSING: { severity:"BLOCKER",domain:"writers",evidenceSource:"HEL1 observer service+cron+container+external exclusion",owner:"Owner/HEL1",recovery:"Gather complete fenced writer witness without key material or destructive stop" },
  OWNER_APPROVAL_MISSING: { severity:"BLOCKER",domain:"authority",evidenceSource:"real signed transaction-scoped owner permit and nonce",owner:"Central Command",recovery:"Obtain specific owner permit independently; never manufacture extra human approvers" },
  FINANCE_CENSUS_MISSING: { severity:"BLOCKER",domain:"liabilities",evidenceSource:"unfiltered HD+DE SELECT-only and historical ambiguity inventory",owner:"HD/DE Finance",recovery:"Provide scoped reconciled unique debt set and external writer access; preserve historical UNKNOWN" },
  NATIVE_EXECUTOR_MISSING: { severity:"BLOCKER",domain:"executor",evidenceSource:"new Wolo v3 private escrow signer and return/fee native tests",owner:"Codex/Wolo",recovery:"Implement independent escrow v3 native signer, no /settlement/v1/runs or generic CLI" },
  RESTORE_UNVERIFIED: { severity:"BLOCKER",domain:"recovery",evidenceSource:"protected isolated full estate restore and writer-exclusion receipt",owner:"Central Command",recovery:"Complete reviewed safe restore and fail-closed hold; no finance restart" },
  WITNESS_INVALID: { severity:"BLOCKER",domain:"signatures",evidenceSource:"role-pinned authentic Ed25519 signatures",owner:"Owner/HEL1",recovery:"Reject synthetic packets; pin real separately controlled verification keys before any release" }
};
export function epochV3Diagnostic(code: keyof typeof EXPLAIN, freshness: EpochDiagnostic["freshness"] = "MISSING"): EpochDiagnostic {
  const d = EXPLAIN[code];
  if (!d) throw Error("EPOCH_V3_DIAGNOSTIC_UNKNOWN");
  return Object.freeze({code,...d,freshness});
}
const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const amt = (v: unknown): bigint | null =>
  typeof v === "string" && NAT.test(v) ? BigInt(v) : null;
const positiveDigest = (s: unknown): s is string => typeof s === "string" && H.test(s) && s !== "0".repeat(64);
export function v3WitnessMessage(w: EpochWitness): string {
  // Fixed top-level order. The nested evidence wire MUST be canonical JSON
  // in Wolo's eventual protocol; this draft refuses unknown native wire formats.
  return JSON.stringify([w.domain,w.role,w.epochId,w.chainId,w.observedAtMs,
    w.expiresAtMs,w.sourceCommit,w.evidence]);
}
function verifyWitness(w: EpochWitness, key: EpochPinnedWitnessKey, sourceCommit:string,
  epochId:string, now:number): boolean {
  if (!w || w.role !== key.role || w.domain !== EPOCH_V3_WITNESS_DOMAIN ||
    w.chainId !== "wolo-1" || w.epochId !== epochId || w.sourceCommit !== sourceCommit ||
    !positiveDigest(sourceCommit) || !asObject(w.evidence) ||
    !Number.isSafeInteger(w.observedAtMs) || !Number.isSafeInteger(w.expiresAtMs) ||
    w.observedAtMs > now || now - w.observedAtMs > 120_000 ||
    w.expiresAtMs <= now || w.expiresAtMs - w.observedAtMs > 120_000 ||
    typeof w.signatureBase64 !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(w.signatureBase64)) return false;
  try {
    const pub = createPublicKey(key.publicKeySpkiPem);
    if (pub.asymmetricKeyType !== "ed25519") return false;
    const der = pub.export({format:"der",type:"spki"}) as Buffer;
    if (!positiveDigest(key.expectedKeySha256) ||
      createHash("sha256").update(der).digest("hex") !== key.expectedKeySha256) return false;
    const signature = Buffer.from(w.signatureBase64,"base64");
    return signature.length === 64 &&
      signature.toString("base64") === w.signatureBase64 &&
      verify(null,Buffer.from(v3WitnessMessage(w),"utf8"),pub,signature);
  } catch { return false; }
}
/**
 * These are authenticated *signatures* only. Native bank/path proof,
 * complete money ledger and real physical custody are NOT authenticated here.
 */
export function evaluateHeldEpochV3Release(input: Readonly<{
  bundle: EpochEvidenceBundle; pinnedKeys: readonly EpochPinnedWitnessKey[];
  expectedEpochId: string; expectedSourceCommit: string; nowMs: number;
}>) {
  const findings: EpochDiagnostic[] = [];
  const add = (c: keyof typeof EXPLAIN, state: EpochDiagnostic["freshness"] = "MISSING") => {
    if (!findings.some(x=>x.code===c)) findings.push(epochV3Diagnostic(c,state));
  };
  if (!input || !Number.isSafeInteger(input.nowMs) || !input.bundle ||
    input.bundle.epochId !== input.expectedEpochId || !/^[a-z][a-z0-9_-]{11,63}$/.test(input.expectedEpochId) ||
    input.bundle.sourceCommit !== input.expectedSourceCommit ||
    !positiveDigest(input.expectedSourceCommit)) add("INVALID_EPOCH","INVALID");
  const keys = new Map<EpochWitnessRole,EpochPinnedWitnessKey>();
  const claimed = new Map<EpochWitnessRole,EpochWitness>();
  for (const k of input.pinnedKeys || []) if (k && ROLES.includes(k.role) && !keys.has(k.role)) keys.set(k.role,k);
  for (const w of input.bundle?.witnesses || []) {
    if (!w || !ROLES.includes(w.role) || claimed.has(w.role)) { add("WITNESS_INVALID","INVALID");continue; }
    claimed.set(w.role,w);
  }
  const keyFingerprints = [...keys.values()].map(k=>k.expectedKeySha256);
  if (keys.size !== ROLES.length || keyFingerprints.length!==new Set(keyFingerprints).size ||
    keyFingerprints.some(k=>!positiveDigest(k)) ||
    claimed.size!==ROLES.length) add("WITNESS_INVALID","MISSING");
  const valid = new Map<EpochWitnessRole,EpochWitness>();
  for (const role of ROLES) {
    const k = keys.get(role), w = claimed.get(role);
    if (k && w && verifyWitness(w,k,input.expectedSourceCommit,input.expectedEpochId,input.nowMs))
      valid.set(role,w);
    else add("WITNESS_INVALID",w?"INVALID":"MISSING");
  }
  const chain=valid.get("native_chain")?.evidence, vb=valid.get("bank_vault")?.evidence,
    eb=valid.get("bank_escrow")?.evidence;
  const head = amt(chain?.height), commitHeight=amt(chain?.commitHeight);
  if (!head || !commitHeight || commitHeight!==head+BigInt(1) ||
    !positiveDigest(chain?.appHash) || !positiveDigest(chain?.commitHash) ||
    chain?.nativeIcs23Verified!==true || chain?.trustedCometHeaderVerified!==true) add("STALE_BANK_PROOF","INVALID");
  for (const [role,w] of [["vault",vb],["escrow",eb]] as const) {
    const balance=amt(w?.spendableUwolo),liab=amt(w?.uniqueLiabilitiesUwolo),
      uncertainty=amt(w?.maxUnknownUwolo),gas=amt(w?.gasReserveUwolo),
      floor=amt(w?.operatingFloorUwolo),debit=amt(w?.proposedDebitUwolo);
    if (!w || w.accountRole!==role || w.height!==chain?.height ||
      w.appHash!==chain?.appHash || w.nativeBankProofVerified!==true ||
      !positiveDigest(w.accountAddressSha256)) add("STALE_BANK_PROOF","INVALID");
    if (balance===null||liab===null||uncertainty===null||gas===null||floor===null||debit===null||
      gas<=BigInt(0)||floor<=BigInt(0)||balance<liab+uncertainty+gas+floor+debit)
      add("RESERVE_DEFICIT","INVALID");
  }
  const cv=valid.get("custody_vault")?.evidence, ce=valid.get("custody_escrow")?.evidence;
  if (!cv || !ce || cv.escrowSignerExcluded!==true || ce.legacySignersExcluded!==true ||
    cv.legacySignersExcluded!==true || ce.vaultSignerExcluded!==true ||
    !positiveDigest(cv.publicKeySha256) || !positiveDigest(ce.publicKeySha256) ||
    cv.publicKeySha256===ce.publicKeySha256 ||
    !positiveDigest(cv.keyringLineageSha256) || !positiveDigest(ce.keyringLineageSha256) ||
    cv.keyringLineageSha256===ce.keyringLineageSha256 ||
    cv.nativeAddressDerived!==true || ce.nativeAddressDerived!==true)
    add("SIGNER_COLLISION","INVALID");
  const writer=valid.get("writer_fence")?.evidence;
  if (!writer || writer.allFinancialWriterSurfacesExcluded!==true ||
    writer.cronContainersExternalCovered!==true || writer.legacy8092Excluded!==true)
    add("WRITER_FENCE_MISSING","MISSING");
  const approval=valid.get("owner_approval")?.evidence;
  if (!approval || approval.explicitTransactionScope!==true || approval.offhostNonceReserved!==true ||
    !positiveDigest(approval.permitDigest)) add("OWNER_APPROVAL_MISSING","MISSING");
  const finance=valid.get("finance_census")?.evidence;
  if (!finance || finance.hdDeUnfilteredReadOnly!==true ||
    finance.oldAmbiguousLiabilitiesPreserved!==true || finance.noLegacySourceCanDebitNewAccounts!==true ||
    finance.overlappingRecordsReconciled!==true) add("FINANCE_CENSUS_MISSING","MISSING");
  const recovery=valid.get("recovery")?.evidence;
  if (!recovery || recovery.fullHdDeRestoreVerified!==true || recovery.writerFenceRevocable!==true)
    add("RESTORE_UNVERIFIED","MISSING");
  // Current Wolo #111 has no independent new-escrow v3 signer/return executor.
  // Even perfect Ed25519 synthetic witnesses MUST NOT flip a finance flag.
  add("NATIVE_EXECUTOR_MISSING","MISSING");
  return Object.freeze({
    level:"BLOCKED" as const,
    verifiedRoleSignatures:valid.size,
    findings:Object.freeze(findings),
    nativeChainProofAuthenticated:false as const,
    releaseAuthorized:false as const,
    financialExecutionEnabled: EPOCH_V3_EXECUTION_ENABLED && NEW_EPOCH_HD_MAINNET_ENABLED,
  });
}

/**
 * Port shape for eventual independently authenticated v3 read calls.
 * No GET or POST happens here; in particular there is no 8092 fallback.
 */
export type EpochV3ReadPort = Readonly<{
  protocol:"aoe2war/escrow-epoch/v3";
  operationLookupReadOnly:(operationId:string)=>Promise<unknown>;
  nativeBankObservationReadOnly:(epochId:string)=>Promise<unknown>;
}>;
export function heldEpochV3Port(): EpochV3ReadPort {
  const held=async ():Promise<never>=>{throw Error("EPOCH_V3_NATIVE_EXECUTOR_NOT_CERTIFIED");};
  return Object.freeze({protocol:"aoe2war/escrow-epoch/v3" as const,
    operationLookupReadOnly:held,nativeBankObservationReadOnly:held});
}
