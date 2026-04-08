import type { StdFee } from "@cosmjs/amino";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";

import {
  WOLO_ADDRESS_PREFIX,
  WOLO_BASE_DENOM,
  WOLO_BET_ESCROW_ADDRESS,
  WOLO_DEFAULT_GAS_PRICE,
  WOLO_REST_URL,
  WOLO_RPC_URL,
  toUwoLoAmount,
} from "@/lib/woloChain";

export type StakeVerificationResult = {
  verified: boolean;
  detail: string;
  txHash?: string;
};

export type PayoutExecutionResult = {
  txHash: string;
  amountWolo: number;
  toAddress: string;
};

const WOLO_PAYOUT_MNEMONIC = process.env.WOLO_BET_PAYOUT_MNEMONIC?.trim() || "";
const WOLO_PAYOUT_ADDRESS = process.env.WOLO_BET_PAYOUT_ADDRESS?.trim() || WOLO_BET_ESCROW_ADDRESS;
const WOLO_PAYOUT_FEE = process.env.WOLO_BET_PAYOUT_FEE?.trim() || "auto";
const WOLO_REQUIRE_ONCHAIN_STAKE = process.env.WOLO_BET_REQUIRE_ONCHAIN === "1";

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim();
}

function normalizeTxHash(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

export function isWoloBetEscrowEnabled() {
  return Boolean(WOLO_BET_ESCROW_ADDRESS);
}

export function requiresOnchainStakeProof() {
  return WOLO_REQUIRE_ONCHAIN_STAKE || isWoloBetEscrowEnabled();
}

export function hasWoloPayoutExecutionConfigured() {
  return Boolean(WOLO_PAYOUT_MNEMONIC && WOLO_PAYOUT_ADDRESS);
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

  for (const log of logs) {
    for (const event of asRecordArray(log.events)) {
      if (getStringField(event, "type") !== "transfer") continue;
      const attributes = asRecordArray(event.attributes);
      const sender = getStringField(attributes.find((attr) => getStringField(attr, "key") === "sender") || {}, "value");
      const recipient = getStringField(attributes.find((attr) => getStringField(attr, "key") === "recipient") || {}, "value");
      const amount = getStringField(attributes.find((attr) => getStringField(attr, "key") === "amount") || {}, "value");
      if (!sender || !recipient || !amount) continue;
      events.push({ sender, recipient, amount });
    }
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

export async function verifyStakeTransfer(input: {
  txHash: string;
  fromAddress: string;
  expectedAmountWolo: number;
}): Promise<StakeVerificationResult> {
  const normalizedTxHash = normalizeTxHash(input.txHash);

  if (!requiresOnchainStakeProof()) {
    return {
      verified: true,
      detail: "On-chain stake proof is not required by current env.",
      txHash: normalizedTxHash,
    };
  }

  if (!WOLO_BET_ESCROW_ADDRESS) {
    return { verified: false, detail: "WOLO_BET_ESCROW_ADDRESS is not configured." };
  }

  const addressError = validateWoloAddress(input.fromAddress);
  if (addressError) {
    return { verified: false, detail: addressError };
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
    normalizeAddress(event.recipient) === normalizeAddress(WOLO_BET_ESCROW_ADDRESS) &&
    event.amount.split(",").map((v) => v.trim()).includes(expectedAmount)
  );

  if (!matched) {
    return {
      verified: false,
      detail: `Stake tx did not show ${expectedAmount} from ${input.fromAddress} to ${WOLO_BET_ESCROW_ADDRESS}.`,
    };
  }

  return { verified: true, detail: "Stake tx verified.", txHash: normalizedTxHash };
}

export async function executeWoloPayout(input: {
  toAddress: string;
  amountWolo: number;
  memo: string;
}): Promise<PayoutExecutionResult | null> {
  if (!hasWoloPayoutExecutionConfigured()) {
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
  };
}
