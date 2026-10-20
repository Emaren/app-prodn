/**
 * Read-only, server-owned presentation compatibility for the independent
 * funded Satchel Mecha worker. NEVER a permission to debit, sign, or broadcast.
 *
 * The legacy preview status must not stay hardcoded "shadow" after an
 * independently certified funded executor is deployed. Conversely env-only
 * claims must never advertise live wagering while the source financial bridge
 * remains held. Real execution still performs its own mandatory bank,
 * consent, owner, signed-leg, signer-health and receipt proofs.
 */
import { satchelFinancialBridgeReady } from "./warSatchelFinancialBridgeHold.ts";

export const FUNDED_MECHA_PUBLIC_LIVE_CONTROLS = Object.freeze([
  "WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED",
  "WAR_SATCHEL_FUNDED_LEDGER_ENABLED",
  "WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED",
  "WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED",
  "WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED",
  "WAR_SATCHEL_LIVE_EXECUTOR_ENABLED",
  "WAR_SATCHEL_AUTO_CONSENT_ENABLED",
  "WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED",
  "WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED",
  "WAR_SATCHEL_SIGNER_OPERATOR_APPROVED",
  "WAR_SATCHEL_SIGNER_CLIENT_ENABLED",
  // An independent live original-Watcher issuance proof and the actual
  // deployed 8094 signer/reviewer health must be explicitly certified.
  // These presentation attestation names alone are NOT finance authority.
  "WAR_SATCHEL_ORIGINAL_LIVE_WATCHER_CERTIFIED",
  "WAR_SATCHEL_SIGNER_RUNTIME_HEALTH_ATTESTED",
] as const);

export type FundedMechaPublicReadiness = Readonly<{
  ready: boolean;
  status: "CERTIFICATION_REQUIRED" | "CONFIGURED_AFTER_SOURCE_RELEASE";
  // Names only, never values, wallet secrets or operator tokens.
  unresolvedControlNames: readonly string[];
}>;

/** Only a read-only status hint. The independent worker owns authority. */
export function observeFundedMechaPublicReadiness(
  env: Record<string, string | undefined> = process.env,
): FundedMechaPublicReadiness {
  const missing = FUNDED_MECHA_PUBLIC_LIVE_CONTROLS.filter(
    name => env[name] !== "true",
  );
  if (!satchelFinancialBridgeReady()) {
    return Object.freeze({
      ready: false,
      status: "CERTIFICATION_REQUIRED" as const,
      unresolvedControlNames: Object.freeze([
        "SATCHEL_FINANCIAL_BRIDGE_UNVERIFIED_HOLD", ...missing,
      ]),
    });
  }
  const ready = missing.length === 0;
  return Object.freeze({
    ready,
    status: ready ? "CONFIGURED_AFTER_SOURCE_RELEASE" as const
      : "CERTIFICATION_REQUIRED" as const,
    unresolvedControlNames: Object.freeze([...missing]),
  });
}
