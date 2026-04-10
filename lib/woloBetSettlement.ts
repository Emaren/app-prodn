import { createHash } from "node:crypto";

import type { StdFee } from "@cosmjs/amino";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";

import {
  WOLO_ADDRESS_PREFIX,
  WOLO_BASE_DENOM,
  WOLO_DEFAULT_GAS_PRICE,
  WOLO_REST_URL,
  WOLO_RPC_URL,
  buildWoloRestTxLookupUrl,
  getWoloBetEscrowRuntime,
  toUwoLoAmount,
} from "@/lib/woloChain";

export type StakeVerificationResult = {
  verified: boolean;
  detail: string;
  txHash?: string;
  proofUrl?: string | null;
};

export type PayoutExecutionResult = {
  txHash: string;
  amountWolo: number;
  toAddress: string;
  requestId?: string | null;
  proofUrl?: string | null;
};

export type SettlementRunPayoutInput = {
  requestId?: string | null;
  toAddress: string;
  amountWolo: number;
  memo?: string | null;
};

export type SettlementRunPayoutResult = {
  index: number;
  requestId: string;
  attempted: boolean;
  ok: boolean;
  status: string;
  outcome: string | null;
  failureCode: string | null;
  retryable: boolean;
  idempotentReplay: boolean;
  toAddress: string | null;
  amountUWolo: string | null;
  amountWolo: string | null;
  memo: string | null;
  txHash: string | null;
  detail: string | null;
  proofUrl: string | null;
  canonicalTxLookupPublic: string | null;
  canonicalTxLookupInternal: string | null;
};

export type SettlementRunResult = {
  ok: boolean;
  dryRun: boolean;
  status: string;
  failureCode: string | null;
  retryable: boolean;
  idempotentReplay: boolean;
  settlementRunId: string;
  sourceApp: string | null;
  sourceEventId: string | null;
  note: string | null;
  memo: string | null;
  requestedPayoutCount: number;
  executedPayoutCount: number;
  confirmedPayoutCount: number;
  acceptedPayoutCount: number;
  refusedPayoutCount: number;
  replayPayoutCount: number;
  requestedTotalUWolo: string | null;
  executedTotalUWolo: string | null;
  projectedRemainingUWolo: string | null;
  estimatedFeeTotalUWolo: string | null;
  warnings: string[];
  detail: string | null;
  payouts: SettlementRunPayoutResult[];
};

export type WoloSettlementGroupedRunCapability =
  | "supported"
  | "fallback_to_singles"
  | "not_configured"
  | "auth_required"
  | "auth_failed"
  | "unknown";

export type WoloSettlementEscrowCapability =
  | "supported"
  | "not_configured"
  | "unavailable"
  | "unknown";

export type WoloSettlementExecutionMode =
  | "settlement_service"
  | "local_signer_fallback"
  | "unconfigured";

export type WoloSettlementSurfaceStatus = {
  checkedAt: string | null;
  settlementServiceConfigured: boolean;
  settlementAuthConfigured: boolean;
  payoutExecutionMode: WoloSettlementExecutionMode;
  localSignerFallbackEnabled: boolean;
  groupedRunCapability: WoloSettlementGroupedRunCapability;
  escrowVerifyCapability: WoloSettlementEscrowCapability;
  escrowRecentCapability: WoloSettlementEscrowCapability;
  warnings: string[];
  detail: string | null;
};

export type EscrowDepositRecord = {
  txHash: string;
  timestamp: string | null;
  txSuccess: boolean;
  sender: string | null;
  recipient: string | null;
  amountUWolo: string | null;
  amountWolo: string | null;
  memo: string | null;
  proofUrl: string | null;
  canonicalTxLookupPublic: string | null;
  canonicalTxLookupInternal: string | null;
};

const WOLO_PAYOUT_MNEMONIC = process.env.WOLO_BET_PAYOUT_MNEMONIC?.trim() || "";
const WOLO_PAYOUT_ADDRESS =
  process.env.WOLO_BET_PAYOUT_ADDRESS?.trim() ||
  getWoloBetEscrowRuntime().escrowAddress ||
  "";
const WOLO_PAYOUT_FEE = process.env.WOLO_BET_PAYOUT_FEE?.trim() || "auto";
const WOLO_SETTLEMENT_URL = process.env.WOLO_SETTLEMENT_URL?.trim() || "";
const WOLO_SETTLEMENT_AUTH_TOKEN = process.env.WOLO_SETTLEMENT_AUTH_TOKEN?.trim() || "";
const WOLO_LOCAL_PAYOUT_SIGNER_FALLBACK_ENABLED =
  process.env.WOLO_LOCAL_PAYOUT_SIGNER_FALLBACK?.trim() === "1";
const WOLO_SETTLEMENT_SURFACE_CACHE_TTL_MS = 60_000;

type SettlementExecutePayload = {
  ok?: boolean;
  status?: string;
  failure_code?: string;
  detail?: string;
  tx_hash?: string;
  raw_log?: string;
  request_id?: string;
  canonical_tx_lookup?: string;
  canonical_tx_lookup_preferred?: string;
  canonical_tx_lookup_internal?: string;
  canonical_tx_lookup_public?: string;
};

type SettlementRunPayload = {
  ok?: boolean;
  dry_run?: boolean;
  status?: string;
  failure_code?: string;
  retryable?: boolean;
  idempotent_replay?: boolean;
  settlement_run_id?: string;
  source_app?: string;
  source_event_id?: string;
  note?: string;
  memo?: string;
  requested_payout_count?: number;
  executed_payout_count?: number;
  confirmed_payout_count?: number;
  accepted_payout_count?: number;
  refused_payout_count?: number;
  replay_payout_count?: number;
  requested_total_uwolo?: string;
  executed_total_uwolo?: string;
  projected_remaining_uwolo?: string;
  estimated_fee_total_uwolo?: string;
  warnings?: string[];
  detail?: string;
  payouts?: Array<{
    index?: number;
    request_id?: string;
    attempted?: boolean;
    ok?: boolean;
    status?: string;
    outcome?: string;
    failure_code?: string;
    retryable?: boolean;
    idempotent_replay?: boolean;
    to_address?: string;
    amount_uwolo?: string;
    amount_wolo?: string;
    memo?: string;
    tx_hash?: string;
    detail?: string;
    canonical_tx_lookup?: string;
    canonical_tx_lookup_preferred?: string;
    canonical_tx_lookup_internal?: string;
    canonical_tx_lookup_public?: string;
  }>;
};

type SettlementEscrowVerifyPayload = {
  ok?: boolean;
  failure_code?: string;
  detail?: string;
  escrow_address?: string;
  expected_sender?: string;
  expected_amount_uwolo?: string;
  deposit_found?: boolean;
  lookup?: {
    ok?: boolean;
    failure_code?: string;
    detail?: string;
    found?: boolean;
    tx_hash?: string;
    tx_success?: boolean;
    matched_expected?: boolean;
    canonical_tx_lookup?: string;
    canonical_tx_lookup_preferred?: string;
    canonical_tx_lookup_internal?: string;
    canonical_tx_lookup_public?: string;
  };
};

type SettlementEscrowRecentPayload = {
  ok?: boolean;
  failure_code?: string;
  detail?: string;
  escrow_address?: string;
  sender_filter?: string;
  limit?: number;
  count?: number;
  deposits?: Array<{
    transfer_index?: number;
    tx_hash?: string;
    height?: string;
    timestamp?: string;
    tx_success?: boolean;
    sender?: string;
    recipient?: string;
    amount_uwolo?: string;
    amount_wolo?: string;
    memo?: string;
    canonical_tx_lookup?: string;
    canonical_tx_lookup_preferred?: string;
    canonical_tx_lookup_internal?: string;
    canonical_tx_lookup_public?: string;
  }>;
};

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim();
}

function normalizeTxHash(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function normalizeSettlementBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function shouldFallbackGroupedRun(responseStatus: number) {
  return responseStatus === 404 || responseStatus === 405;
}

function hasLocalPayoutSignerFallbackConfigured() {
  return Boolean(
    WOLO_LOCAL_PAYOUT_SIGNER_FALLBACK_ENABLED && WOLO_PAYOUT_MNEMONIC && WOLO_PAYOUT_ADDRESS
  );
}

function buildSettlementMutationHeaders() {
  return {
    "content-type": "application/json",
    ...(WOLO_SETTLEMENT_AUTH_TOKEN
      ? { authorization: `Bearer ${WOLO_SETTLEMENT_AUTH_TOKEN}` }
      : {}),
  };
}

function selectPreferredProofUrl(value: {
  canonical_tx_lookup_preferred?: string | null;
  canonical_tx_lookup_public?: string | null;
  canonical_tx_lookup_internal?: string | null;
  canonical_tx_lookup?: string | null;
}) {
  return (
    value.canonical_tx_lookup_preferred?.trim() ||
    value.canonical_tx_lookup_public?.trim() ||
    value.canonical_tx_lookup_internal?.trim() ||
    value.canonical_tx_lookup?.trim() ||
    null
  );
}

function summarizeSettlementDetail(payload: {
  detail?: string;
  failure_code?: string;
  raw_log?: string;
}) {
  return (
    payload.detail ||
    payload.failure_code ||
    payload.raw_log ||
    "WOLO settlement service returned an unexpected response."
  );
}

export function isWoloBetEscrowEnabled() {
  return getWoloBetEscrowRuntime().onchainAllowed;
}

export function requiresOnchainStakeProof() {
  return getWoloBetEscrowRuntime().onchainRequired;
}

export function hasWoloPayoutExecutionConfigured() {
  return Boolean(WOLO_SETTLEMENT_URL || hasLocalPayoutSignerFallbackConfigured());
}

function buildSettlementServiceUrl(
  path: string,
  search?: Record<string, string | null | undefined>
) {
  const baseUrl = normalizeSettlementBaseUrl(WOLO_SETTLEMENT_URL);
  const url = new URL(path, `${baseUrl}/`);
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      const normalized = (value || "").trim();
      if (normalized) {
        url.searchParams.set(key, normalized);
      }
    }
  }
  return url.toString();
}

function isStructuredEscrowVerifyPayload(
  payload: SettlementEscrowVerifyPayload | null | undefined
): payload is SettlementEscrowVerifyPayload {
  return Boolean(
    payload &&
      (typeof payload.deposit_found === "boolean" ||
        typeof payload.failure_code === "string" ||
        typeof payload.ok === "boolean")
  );
}

function isStructuredEscrowRecentPayload(
  payload: SettlementEscrowRecentPayload | null | undefined
): payload is SettlementEscrowRecentPayload {
  return Boolean(
    payload &&
      (Array.isArray(payload.deposits) ||
        typeof payload.failure_code === "string" ||
        typeof payload.ok === "boolean")
  );
}

let cachedSettlementSurfaceStatus:
  | {
      expiresAt: number;
      value: WoloSettlementSurfaceStatus;
    }
  | null = null;
let settlementSurfaceProbePromise: Promise<WoloSettlementSurfaceStatus> | null = null;

async function probeGroupedRunCapability(): Promise<{
  capability: WoloSettlementGroupedRunCapability;
  detail: string | null;
}> {
  if (!WOLO_SETTLEMENT_URL) {
    return {
      capability: "not_configured",
      detail: "WoloChain settlement service URL is not configured in this environment.",
    };
  }

  const response = await fetch(
    `${normalizeSettlementBaseUrl(WOLO_SETTLEMENT_URL)}/settlement/v1/runs/validate`,
    {
      method: "POST",
      headers: buildSettlementMutationHeaders(),
      body: JSON.stringify({
        settlement_run_id: "aoe2hdbets-capability-probe",
        source_app: "aoe2hdbets",
        source_event_id: "capability-probe",
        note: "capability-probe",
        memo: "capability-probe",
        payouts: [],
      }),
      cache: "no-store",
    }
  ).catch(() => null);

  if (!response) {
    return {
      capability: "unknown",
      detail: "Could not reach the grouped settlement validation route on the configured target.",
    };
  }

  if (shouldFallbackGroupedRun(response.status)) {
    return {
      capability: "fallback_to_singles",
      detail: "Grouped settlement validation is not live on the current WoloChain target.",
    };
  }

  const payload = (await response.json().catch(() => null)) as SettlementRunPayload | {
    detail?: string;
  } | null;

  if (response.status === 401) {
    return {
      capability: WOLO_SETTLEMENT_AUTH_TOKEN ? "auth_failed" : "auth_required",
      detail:
        payload && typeof payload === "object" && typeof payload.detail === "string"
          ? payload.detail
          : "The grouped settlement route rejected the current bearer-auth configuration.",
    };
  }

  if (
    payload &&
    typeof payload === "object" &&
    ("status" in payload || "failure_code" in payload || "ok" in payload)
  ) {
    return {
      capability: "supported",
      detail:
        "Grouped settlement validation is reachable on the current WoloChain target.",
    };
  }

  return {
    capability: "unknown",
    detail: "Grouped settlement validation returned an unstructured response.",
  };
}

async function probeEscrowVerifyCapability(): Promise<{
  capability: WoloSettlementEscrowCapability;
  detail: string | null;
}> {
  if (!WOLO_SETTLEMENT_URL) {
    return {
      capability: "not_configured",
      detail: "Escrow verification depends on a configured WoloChain settlement service URL.",
    };
  }

  const response = await fetch(
    buildSettlementServiceUrl("/settlement/v1/escrow/txs/not-a-real-hash"),
    {
      cache: "no-store",
    }
  ).catch(() => null);

  if (!response) {
    return {
      capability: "unknown",
      detail: "Could not reach the WoloChain escrow verification route.",
    };
  }

  const payload = (await response.json().catch(() => null)) as SettlementEscrowVerifyPayload | null;
  if (isStructuredEscrowVerifyPayload(payload)) {
    return {
      capability: "supported",
      detail: "Escrow verification by tx hash is reachable on the current WoloChain target.",
    };
  }

  if (response.status === 404 || response.status === 405) {
    return {
      capability: "unavailable",
      detail: "Escrow verification by tx hash is not live on the current WoloChain target.",
    };
  }

  return {
    capability: "unknown",
    detail: "Escrow verification returned an unstructured response.",
  };
}

async function probeEscrowRecentCapability(): Promise<{
  capability: WoloSettlementEscrowCapability;
  detail: string | null;
}> {
  if (!WOLO_SETTLEMENT_URL) {
    return {
      capability: "not_configured",
      detail: "Escrow deposit discovery depends on a configured WoloChain settlement service URL.",
    };
  }

  const response = await fetch(buildSettlementServiceUrl("/settlement/v1/escrow/deposits", {
    limit: "1",
  }), {
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return {
      capability: "unknown",
      detail: "Could not reach the WoloChain recent escrow deposit route.",
    };
  }

  const payload = (await response.json().catch(() => null)) as SettlementEscrowRecentPayload | null;
  if (isStructuredEscrowRecentPayload(payload)) {
    return {
      capability: "supported",
      detail: "Recent escrow deposit discovery is reachable on the current WoloChain target.",
    };
  }

  if (response.status === 404 || response.status === 405) {
    return {
      capability: "unavailable",
      detail: "Recent escrow deposit discovery is not live on the current WoloChain target.",
    };
  }

  return {
    capability: "unknown",
    detail: "Recent escrow deposit discovery returned an unstructured response.",
  };
}

export async function getWoloSettlementSurfaceStatus(): Promise<WoloSettlementSurfaceStatus> {
  const cached =
    cachedSettlementSurfaceStatus &&
    cachedSettlementSurfaceStatus.expiresAt > Date.now()
      ? cachedSettlementSurfaceStatus.value
      : null;
  if (cached) {
    return cached;
  }

  if (settlementSurfaceProbePromise) {
    return settlementSurfaceProbePromise;
  }

  settlementSurfaceProbePromise = (async () => {
    const localSignerFallbackConfigured = hasLocalPayoutSignerFallbackConfigured();

    if (!WOLO_SETTLEMENT_URL) {
      const warnings = localSignerFallbackConfigured
        ? [
            "App-local payout signer fallback is explicitly enabled here. That is weaker than consuming WoloChain settlement service directly.",
          ]
        : WOLO_LOCAL_PAYOUT_SIGNER_FALLBACK_ENABLED
          ? [
              "App-local payout signer fallback was requested, but the local signer credentials are incomplete.",
            ]
          : [
              "WoloChain settlement service is not configured here. Auto-settlement stays pending instead of falling back silently.",
            ];
      const value = {
        checkedAt: new Date().toISOString(),
        settlementServiceConfigured: false,
        settlementAuthConfigured: Boolean(WOLO_SETTLEMENT_AUTH_TOKEN),
        payoutExecutionMode: localSignerFallbackConfigured
          ? "local_signer_fallback"
          : "unconfigured",
        localSignerFallbackEnabled: WOLO_LOCAL_PAYOUT_SIGNER_FALLBACK_ENABLED,
        groupedRunCapability: "not_configured" as const,
        escrowVerifyCapability: "not_configured" as const,
        escrowRecentCapability: "not_configured" as const,
        warnings,
        detail: warnings[0] ?? null,
      } satisfies WoloSettlementSurfaceStatus;
      cachedSettlementSurfaceStatus = {
        expiresAt: Date.now() + WOLO_SETTLEMENT_SURFACE_CACHE_TTL_MS,
        value,
      };
      return value;
    }

    const [grouped, escrowVerify, escrowRecent] = await Promise.all([
      probeGroupedRunCapability(),
      probeEscrowVerifyCapability(),
      probeEscrowRecentCapability(),
    ]);

    const warnings: string[] = [];
    if (grouped.capability === "fallback_to_singles") {
      warnings.push(
        "Grouped settlement is not live on the current WoloChain target. AoE2HDBets will fall back to single payout requests."
      );
    } else if (grouped.capability === "auth_required") {
      warnings.push(
        "The current WoloChain target requires bearer auth for grouped settlement, but AoE2HDBets has no settlement auth token configured."
      );
    } else if (grouped.capability === "auth_failed") {
      warnings.push(
        "The current bearer token was rejected by the WoloChain grouped settlement route."
      );
    } else if (grouped.capability === "unknown") {
      warnings.push(
        "Grouped settlement support on the current WoloChain target could not be confirmed."
      );
    }

    if (escrowVerify.capability === "unavailable" || escrowRecent.capability === "unavailable") {
      warnings.push(
        "One or more WoloChain escrow proof/discovery routes are not live on the current target. Recovery will rely more heavily on direct WOLO REST fallback."
      );
    } else if (
      escrowVerify.capability === "unknown" ||
      escrowRecent.capability === "unknown"
    ) {
      warnings.push(
        "AoE2HDBets could not confirm every WoloChain escrow proof/discovery route on the current target."
      );
    }

    const value = {
      checkedAt: new Date().toISOString(),
      settlementServiceConfigured: true,
      settlementAuthConfigured: Boolean(WOLO_SETTLEMENT_AUTH_TOKEN),
      payoutExecutionMode: "settlement_service" as const,
      localSignerFallbackEnabled: WOLO_LOCAL_PAYOUT_SIGNER_FALLBACK_ENABLED,
      groupedRunCapability: grouped.capability,
      escrowVerifyCapability: escrowVerify.capability,
      escrowRecentCapability: escrowRecent.capability,
      warnings,
      detail:
        warnings.length > 0
          ? grouped.detail ||
            escrowVerify.detail ||
            escrowRecent.detail ||
            null
          : null,
    } satisfies WoloSettlementSurfaceStatus;
    cachedSettlementSurfaceStatus = {
      expiresAt: Date.now() + WOLO_SETTLEMENT_SURFACE_CACHE_TTL_MS,
      value,
    };
    return value;
  })().finally(() => {
    settlementSurfaceProbePromise = null;
  });

  return settlementSurfaceProbePromise;
}

export function validateWoloAddress(address: string) {
  const normalized = normalizeAddress(address);
  if (!normalized) return "Wallet address is required.";
  if (!normalized.startsWith(`${WOLO_ADDRESS_PREFIX}1`)) {
    return `Address must start with ${WOLO_ADDRESS_PREFIX}1`;
  }
  return null;
}

async function fetchTx(txHash: string) {
  const normalizedHash = normalizeTxHash(txHash);
  if (!normalizedHash) return null;

  const response = await fetch(`${WOLO_REST_URL}/cosmos/tx/v1beta1/txs/${normalizedHash}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function verifyStakeTransferViaSettlementService(input: {
  txHash: string;
  fromAddress: string;
  expectedAmountWolo: number;
}): Promise<StakeVerificationResult | null> {
  if (!WOLO_SETTLEMENT_URL) {
    return null;
  }

  const response = await fetch(
    buildSettlementServiceUrl(`/settlement/v1/escrow/txs/${normalizeTxHash(input.txHash)}`, {
      expected_sender: input.fromAddress,
      expected_amount_uwolo: toUwoLoAmount(input.expectedAmountWolo),
    }),
    {
      cache: "no-store",
    }
  ).catch(() => null);

  if (!response) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as SettlementEscrowVerifyPayload | null;
  if (!isStructuredEscrowVerifyPayload(payload)) {
    if (response.status === 404 || response.status === 405) {
      return null;
    }
    return {
      verified: false,
      detail: "WOLO settlement escrow verification returned an unexpected response.",
    };
  }

  const matchedProofUrl = selectPreferredProofUrl(payload.lookup || {});
  if (
    response.ok &&
    payload.ok &&
    payload.deposit_found &&
    payload.lookup?.found &&
    payload.lookup?.tx_success &&
    payload.lookup?.matched_expected
  ) {
    return {
      verified: true,
      detail: payload.detail?.trim() || "Stake tx verified by WoloChain escrow service.",
      txHash: payload.lookup.tx_hash?.trim() || normalizeTxHash(input.txHash),
      proofUrl: matchedProofUrl,
    };
  }

  return {
    verified: false,
    detail:
      payload.detail?.trim() ||
      payload.failure_code?.trim() ||
      payload.lookup?.detail?.trim() ||
      "Stake tx could not be verified by the WOLO settlement escrow service.",
    txHash: payload.lookup?.tx_hash?.trim() || normalizeTxHash(input.txHash),
    proofUrl: matchedProofUrl,
  };
}

export async function listRecentEscrowDeposits(input: {
  sender?: string | null;
  limit?: number;
}): Promise<EscrowDepositRecord[] | null> {
  if (!WOLO_SETTLEMENT_URL) {
    return null;
  }

  const response = await fetch(
    buildSettlementServiceUrl("/settlement/v1/escrow/deposits", {
      sender: input.sender ?? null,
      limit: String(Math.max(1, Math.min(input.limit ?? 20, 50))),
    }),
    {
      cache: "no-store",
    }
  ).catch(() => null);

  if (!response) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as SettlementEscrowRecentPayload | null;
  if (!isStructuredEscrowRecentPayload(payload)) {
    if (response.status === 404 || response.status === 405) {
      return null;
    }
    return [];
  }

  if (!response.ok || !payload.ok || !Array.isArray(payload.deposits)) {
    return [];
  }

  return payload.deposits.map((deposit) => ({
    txHash: deposit.tx_hash?.trim() || "",
    timestamp: deposit.timestamp?.trim() || null,
    txSuccess: Boolean(deposit.tx_success),
    sender: deposit.sender?.trim() || null,
    recipient: deposit.recipient?.trim() || null,
    amountUWolo: deposit.amount_uwolo?.trim() || null,
    amountWolo: deposit.amount_wolo?.trim() || null,
    memo: deposit.memo?.trim() || null,
    proofUrl: selectPreferredProofUrl(deposit),
    canonicalTxLookupPublic: deposit.canonical_tx_lookup_public?.trim() || null,
    canonicalTxLookupInternal: deposit.canonical_tx_lookup_internal?.trim() || null,
  }));
}

type TransferEvent = {
  sender: string;
  recipient: string;
  amount: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
}

function getStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function extractTransferEvents(payload: unknown): TransferEvent[] {
  const root = asRecord(payload);
  const txResponse = asRecord(root?.tx_response);
  const logs = asRecordArray(txResponse?.logs);
  const events: TransferEvent[] = [];

  const appendFromEvents = (eventEntries: Array<Record<string, unknown>>) => {
    for (const event of eventEntries) {
      if (getStringField(event, "type") !== "transfer") continue;
      const attributes = asRecordArray(event.attributes);
      const sender = getStringField(
        attributes.find((attr) => getStringField(attr, "key") === "sender") || {},
        "value"
      );
      const recipient = getStringField(
        attributes.find((attr) => getStringField(attr, "key") === "recipient") || {},
        "value"
      );
      const amount = getStringField(
        attributes.find((attr) => getStringField(attr, "key") === "amount") || {},
        "value"
      );
      if (!sender || !recipient || !amount) continue;
      events.push({ sender, recipient, amount });
    }
  };

  for (const log of logs) {
    appendFromEvents(asRecordArray(log.events));
  }

  if (events.length === 0) {
    appendFromEvents(asRecordArray(txResponse?.events));
  }

  return events;
}

function resolvePayoutFee(value: string): number | "auto" | StdFee {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "auto") {
    return "auto";
  }

  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  return "auto";
}

function buildSettlementRequestId(input: { toAddress: string; amountWolo: number; memo: string }) {
  const fingerprint = createHash("sha256")
    .update(`${normalizeAddress(input.toAddress)}|${input.amountWolo}|${input.memo.trim()}`)
    .digest("hex")
    .slice(0, 40);

  return `aoe2-payout-${fingerprint}`;
}

function toRunRequestPayload(input: {
  settlementRunId: string;
  sourceApp?: string | null;
  sourceEventId?: string | null;
  note?: string | null;
  memo?: string | null;
  payouts: SettlementRunPayoutInput[];
}) {
  return {
    settlement_run_id: input.settlementRunId,
    source_app: input.sourceApp?.trim() || undefined,
    source_event_id: input.sourceEventId?.trim() || undefined,
    note: input.note?.trim() || undefined,
    memo: input.memo?.trim() || undefined,
    payouts: input.payouts.map((payout) => ({
      request_id: payout.requestId?.trim() || undefined,
      to_address: payout.toAddress,
      amount_uwolo: toUwoLoAmount(payout.amountWolo),
      memo: payout.memo?.trim() || undefined,
    })),
  };
}

function toSettlementRunResult(
  payload: SettlementRunPayload,
  input: {
    dryRun: boolean;
    settlementRunId: string;
    sourceApp?: string | null;
    sourceEventId?: string | null;
    note?: string | null;
    memo?: string | null;
    requestedPayoutCount: number;
  }
): SettlementRunResult {
  return {
    ok: Boolean(payload.ok),
    dryRun: Boolean(payload.dry_run ?? input.dryRun),
    status: payload.status?.trim() || "unknown",
    failureCode: payload.failure_code?.trim() || null,
    retryable: Boolean(payload.retryable),
    idempotentReplay: Boolean(payload.idempotent_replay),
    settlementRunId: payload.settlement_run_id?.trim() || input.settlementRunId,
    sourceApp: payload.source_app?.trim() || input.sourceApp?.trim() || null,
    sourceEventId:
      payload.source_event_id?.trim() || input.sourceEventId?.trim() || null,
    note: payload.note?.trim() || input.note?.trim() || null,
    memo: payload.memo?.trim() || input.memo?.trim() || null,
    requestedPayoutCount: payload.requested_payout_count ?? input.requestedPayoutCount,
    executedPayoutCount: payload.executed_payout_count ?? 0,
    confirmedPayoutCount: payload.confirmed_payout_count ?? 0,
    acceptedPayoutCount: payload.accepted_payout_count ?? 0,
    refusedPayoutCount: payload.refused_payout_count ?? 0,
    replayPayoutCount: payload.replay_payout_count ?? 0,
    requestedTotalUWolo: payload.requested_total_uwolo?.trim() || null,
    executedTotalUWolo: payload.executed_total_uwolo?.trim() || null,
    projectedRemainingUWolo: payload.projected_remaining_uwolo?.trim() || null,
    estimatedFeeTotalUWolo: payload.estimated_fee_total_uwolo?.trim() || null,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    detail: payload.detail?.trim() || null,
    payouts: Array.isArray(payload.payouts)
      ? payload.payouts.map((payout, index) => ({
          index: payout.index ?? index,
          requestId: payout.request_id?.trim() || `item-${String(index + 1).padStart(3, "0")}`,
          attempted: Boolean(payout.attempted),
          ok: Boolean(payout.ok),
          status: payout.status?.trim() || "unknown",
          outcome: payout.outcome?.trim() || null,
          failureCode: payout.failure_code?.trim() || null,
          retryable: Boolean(payout.retryable),
          idempotentReplay: Boolean(payout.idempotent_replay),
          toAddress: payout.to_address?.trim() || null,
          amountUWolo: payout.amount_uwolo?.trim() || null,
          amountWolo: payout.amount_wolo?.trim() || null,
          memo: payout.memo?.trim() || null,
          txHash: payout.tx_hash?.trim() || null,
          detail: payout.detail?.trim() || null,
          proofUrl: selectPreferredProofUrl(payout),
          canonicalTxLookupPublic: payout.canonical_tx_lookup_public?.trim() || null,
          canonicalTxLookupInternal: payout.canonical_tx_lookup_internal?.trim() || null,
        }))
      : [],
  };
}

async function executeWoloPayoutViaSettlementService(input: {
  requestId?: string | null;
  toAddress: string;
  amountWolo: number;
  memo: string;
}): Promise<PayoutExecutionResult> {
  const baseUrl = normalizeSettlementBaseUrl(WOLO_SETTLEMENT_URL);
  const response = await fetch(`${baseUrl}/settlement/v1/payouts`, {
    method: "POST",
    headers: buildSettlementMutationHeaders(),
    body: JSON.stringify({
      request_id: input.requestId || buildSettlementRequestId(input),
      to_address: input.toAddress,
      amount_uwolo: toUwoLoAmount(input.amountWolo),
      memo: input.memo.slice(0, 180),
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as SettlementExecutePayload;

  if (!response.ok || !payload.ok || !payload.tx_hash) {
    throw new Error(summarizeSettlementDetail(payload));
  }

  return {
    txHash: payload.tx_hash,
    amountWolo: input.amountWolo,
    toAddress: input.toAddress,
    requestId: payload.request_id?.trim() || input.requestId || null,
    proofUrl: selectPreferredProofUrl(payload),
  };
}

async function executeWoloSettlementRunFallback(input: {
  settlementRunId: string;
  sourceApp?: string | null;
  sourceEventId?: string | null;
  note?: string | null;
  memo?: string | null;
  payouts: SettlementRunPayoutInput[];
}): Promise<SettlementRunResult> {
  const localSignerFallbackConfigured = hasLocalPayoutSignerFallbackConfigured();
  if (!WOLO_SETTLEMENT_URL && !localSignerFallbackConfigured) {
    return {
      ok: false,
      dryRun: false,
      status: "failed",
      failureCode: "SETTLEMENT_SERVICE_UNCONFIGURED",
      retryable: false,
      idempotentReplay: false,
      settlementRunId: input.settlementRunId,
      sourceApp: input.sourceApp?.trim() || null,
      sourceEventId: input.sourceEventId?.trim() || null,
      note: input.note?.trim() || null,
      memo: input.memo?.trim() || null,
      requestedPayoutCount: input.payouts.length,
      executedPayoutCount: 0,
      confirmedPayoutCount: 0,
      acceptedPayoutCount: 0,
      refusedPayoutCount: 0,
      replayPayoutCount: 0,
      requestedTotalUWolo: toUwoLoAmount(
        input.payouts.reduce((sum, payout) => sum + payout.amountWolo, 0)
      ),
      executedTotalUWolo: "0",
      projectedRemainingUWolo: null,
      estimatedFeeTotalUWolo: null,
      warnings: [
        "WoloChain settlement service is not configured here. AoE2HDBets will not execute payouts locally unless WOLO_LOCAL_PAYOUT_SIGNER_FALLBACK=1 is set explicitly.",
      ],
      detail: "Settlement execution is not configured in this environment.",
      payouts: input.payouts.map((payout, index) => ({
        index,
        requestId:
          payout.requestId?.trim() ||
          `${input.settlementRunId}:item-${String(index + 1).padStart(3, "0")}`,
        attempted: false,
        ok: false,
        status: "skipped",
        outcome: "not_configured",
        failureCode: "SETTLEMENT_SERVICE_UNCONFIGURED",
        retryable: false,
        idempotentReplay: false,
        toAddress: payout.toAddress,
        amountUWolo: toUwoLoAmount(payout.amountWolo),
        amountWolo: String(payout.amountWolo),
        memo: payout.memo?.trim() || input.memo?.trim() || null,
        txHash: null,
        detail: "Settlement execution is not configured in this environment.",
        proofUrl: null,
        canonicalTxLookupPublic: null,
        canonicalTxLookupInternal: null,
      })),
    };
  }

  const results: SettlementRunPayoutResult[] = [];
  let executedCount = 0;
  let acceptedCount = 0;
  let refusedCount = 0;
  const replayCount = 0;
  let executedTotal = 0;

  for (let index = 0; index < input.payouts.length; index += 1) {
    const payout = input.payouts[index];
    const requestId =
      payout.requestId?.trim() ||
      `${input.settlementRunId}:item-${String(index + 1).padStart(3, "0")}`;
    try {
      const result = WOLO_SETTLEMENT_URL
        ? await executeWoloPayoutViaSettlementService({
            requestId,
            toAddress: payout.toAddress,
            amountWolo: payout.amountWolo,
            memo: payout.memo?.trim() || input.memo?.trim() || `AoE2 settlement ${input.settlementRunId}`,
          })
        : await executeWoloPayout({
            toAddress: payout.toAddress,
            amountWolo: payout.amountWolo,
            memo: payout.memo?.trim() || input.memo?.trim() || `AoE2 settlement ${input.settlementRunId}`,
          });

      executedCount += 1;
      acceptedCount += 1;
      executedTotal += payout.amountWolo;
      results.push({
        index,
        requestId,
        attempted: true,
        ok: true,
        status: "confirmed",
        outcome: "executed",
        failureCode: null,
        retryable: false,
        idempotentReplay: false,
        toAddress: payout.toAddress,
        amountUWolo: toUwoLoAmount(payout.amountWolo),
        amountWolo: String(payout.amountWolo),
        memo: payout.memo?.trim() || input.memo?.trim() || null,
        txHash: result?.txHash || null,
        detail: result?.txHash ? "payout confirmed on WoloChain" : "payout executed",
        proofUrl: result?.proofUrl || buildWoloRestTxLookupUrl(result?.txHash || null),
        canonicalTxLookupPublic: null,
        canonicalTxLookupInternal: null,
      });
    } catch (error) {
      refusedCount += 1;
      const detail =
        error instanceof Error ? error.message : "WOLO payout execution failed.";
      results.push({
        index,
        requestId,
        attempted: true,
        ok: false,
        status: "refused",
        outcome: "refused",
        failureCode: null,
        retryable: true,
        idempotentReplay: false,
        toAddress: payout.toAddress,
        amountUWolo: toUwoLoAmount(payout.amountWolo),
        amountWolo: String(payout.amountWolo),
        memo: payout.memo?.trim() || input.memo?.trim() || null,
        txHash: null,
        detail,
        proofUrl: null,
        canonicalTxLookupPublic: null,
        canonicalTxLookupInternal: null,
      });
    }
  }

  const status =
    results.length === 0
      ? "failed"
      : executedCount === results.length
        ? "confirmed"
        : executedCount > 0
          ? "partial"
          : "failed";

  return {
    ok: executedCount > 0,
    dryRun: false,
    status,
    failureCode: null,
    retryable: status !== "confirmed",
    idempotentReplay: replayCount > 0,
    settlementRunId: input.settlementRunId,
    sourceApp: input.sourceApp?.trim() || null,
    sourceEventId: input.sourceEventId?.trim() || null,
    note: input.note?.trim() || null,
    memo: input.memo?.trim() || null,
    requestedPayoutCount: input.payouts.length,
    executedPayoutCount: executedCount,
    confirmedPayoutCount: executedCount,
    acceptedPayoutCount: acceptedCount,
    refusedPayoutCount: refusedCount,
    replayPayoutCount: replayCount,
    requestedTotalUWolo: toUwoLoAmount(
      input.payouts.reduce((sum, payout) => sum + payout.amountWolo, 0)
    ),
    executedTotalUWolo: toUwoLoAmount(executedTotal),
    projectedRemainingUWolo: null,
    estimatedFeeTotalUWolo: null,
    warnings: WOLO_SETTLEMENT_URL
      ? ["Grouped run route unavailable; fell back to single payout requests."]
      : ["App-local payout signer fallback is explicitly enabled in this environment."],
    detail:
      status === "confirmed"
        ? `all ${executedCount} payouts confirmed on WoloChain`
        : status === "partial"
          ? `${executedCount} of ${input.payouts.length} payouts executed; inspect per-recipient results for the remaining failures`
          : "no payouts executed successfully",
    payouts: results,
  };
}

export async function validateWoloSettlementRun(input: {
  settlementRunId: string;
  sourceApp?: string | null;
  sourceEventId?: string | null;
  note?: string | null;
  memo?: string | null;
  payouts: SettlementRunPayoutInput[];
}): Promise<SettlementRunResult | null> {
  if (!WOLO_SETTLEMENT_URL) {
    return null;
  }

  const baseUrl = normalizeSettlementBaseUrl(WOLO_SETTLEMENT_URL);
  const response = await fetch(`${baseUrl}/settlement/v1/runs/validate`, {
    method: "POST",
    headers: buildSettlementMutationHeaders(),
    body: JSON.stringify(toRunRequestPayload(input)),
    cache: "no-store",
  });

  if (shouldFallbackGroupedRun(response.status)) {
    return null;
  }

  const payload = (await response.json().catch(() => ({}))) as SettlementRunPayload;
  return toSettlementRunResult(payload, {
    dryRun: true,
    settlementRunId: input.settlementRunId,
    sourceApp: input.sourceApp,
    sourceEventId: input.sourceEventId,
    note: input.note,
    memo: input.memo,
    requestedPayoutCount: input.payouts.length,
  });
}

export async function executeWoloSettlementRun(input: {
  settlementRunId: string;
  sourceApp?: string | null;
  sourceEventId?: string | null;
  note?: string | null;
  memo?: string | null;
  payouts: SettlementRunPayoutInput[];
}): Promise<SettlementRunResult> {
  if (WOLO_SETTLEMENT_URL) {
    const baseUrl = normalizeSettlementBaseUrl(WOLO_SETTLEMENT_URL);
    const response = await fetch(`${baseUrl}/settlement/v1/runs`, {
      method: "POST",
      headers: buildSettlementMutationHeaders(),
      body: JSON.stringify(toRunRequestPayload(input)),
      cache: "no-store",
    });

    if (!shouldFallbackGroupedRun(response.status) && ![401, 403].includes(response.status)) {
      const payload = (await response.json().catch(() => ({}))) as SettlementRunPayload;
      return toSettlementRunResult(payload, {
        dryRun: false,
        settlementRunId: input.settlementRunId,
        sourceApp: input.sourceApp,
        sourceEventId: input.sourceEventId,
        note: input.note,
        memo: input.memo,
        requestedPayoutCount: input.payouts.length,
      });
    }
  }

  return executeWoloSettlementRunFallback(input);
}

export async function verifyStakeTransfer(input: {
  txHash: string;
  fromAddress: string;
  expectedAmountWolo: number;
}): Promise<StakeVerificationResult> {
  const escrowRuntime = getWoloBetEscrowRuntime();
  const normalizedTxHash = normalizeTxHash(input.txHash);

  if (!escrowRuntime.onchainAllowed && !escrowRuntime.onchainRequired) {
    return {
      verified: true,
      detail: "On-chain stake proof is not required by current env.",
      txHash: normalizedTxHash,
    };
  }

  if (!escrowRuntime.escrowAddress) {
    return {
      verified: false,
      detail:
        escrowRuntime.configError ||
        "WOLO bet escrow is required here, but the escrow address is not configured.",
    };
  }

  const addressError = validateWoloAddress(input.fromAddress);
  if (addressError) {
    return { verified: false, detail: addressError };
  }

  const settlementVerification = await verifyStakeTransferViaSettlementService(input);
  if (settlementVerification) {
    return settlementVerification;
  }

  const payload = await fetchTx(normalizedTxHash);
  if (!payload) {
    return { verified: false, detail: "Stake tx could not be loaded from the WOLO REST API." };
  }

  const txResponse = asRecord(asRecord(payload)?.tx_response);
  const codeValue = Number(txResponse?.code ?? 0);
  if (!txResponse || codeValue !== 0) {
    return {
      verified: false,
      detail: `Stake tx failed or returned code ${String(txResponse?.code ?? "unknown")}.`,
    };
  }

  const expectedAmount = `${toUwoLoAmount(input.expectedAmountWolo)}${WOLO_BASE_DENOM}`;
  const transfers = extractTransferEvents(payload);
  const matched = transfers.some((event) =>
    normalizeAddress(event.sender) === normalizeAddress(input.fromAddress) &&
    normalizeAddress(event.recipient) === normalizeAddress(escrowRuntime.escrowAddress) &&
    event.amount.split(",").map((v) => v.trim()).includes(expectedAmount)
  );

  if (!matched) {
    return {
      verified: false,
      detail: `Stake tx did not show ${expectedAmount} from ${input.fromAddress} to ${escrowRuntime.escrowAddress}.`,
    };
  }

  return {
    verified: true,
    detail: "Stake tx verified via WOLO REST fallback.",
    txHash: normalizedTxHash,
    proofUrl: buildWoloRestTxLookupUrl(normalizedTxHash),
  };
}

export async function executeWoloPayout(input: {
  toAddress: string;
  amountWolo: number;
  memo: string;
}): Promise<PayoutExecutionResult | null> {
  if (WOLO_SETTLEMENT_URL) {
    return executeWoloPayoutViaSettlementService(input);
  }

  if (!hasLocalPayoutSignerFallbackConfigured()) {
    return null;
  }

  const addressError = validateWoloAddress(input.toAddress);
  if (addressError) {
    throw new Error(addressError);
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(WOLO_PAYOUT_MNEMONIC, {
    prefix: WOLO_ADDRESS_PREFIX,
  });
  const [account] = await wallet.getAccounts();
  if (!account?.address) {
    throw new Error("WOLO payout wallet returned no address.");
  }

  if (WOLO_PAYOUT_ADDRESS && account.address !== WOLO_PAYOUT_ADDRESS) {
    throw new Error(
      `WOLO payout mnemonic resolved to ${account.address}, not ${WOLO_PAYOUT_ADDRESS}.`
    );
  }

  const client = await SigningStargateClient.connectWithSigner(WOLO_RPC_URL, wallet, {
    gasPrice: GasPrice.fromString(WOLO_DEFAULT_GAS_PRICE),
  });

  const result = await client.sendTokens(
    account.address,
    input.toAddress,
    [{ amount: toUwoLoAmount(input.amountWolo), denom: WOLO_BASE_DENOM }],
    resolvePayoutFee(WOLO_PAYOUT_FEE),
    input.memo.slice(0, 180)
  );

  return {
    txHash: result.transactionHash,
    amountWolo: input.amountWolo,
    toAddress: input.toAddress,
    proofUrl: buildWoloRestTxLookupUrl(result.transactionHash),
  };
}
