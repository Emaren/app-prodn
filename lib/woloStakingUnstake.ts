import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { StdFee } from "@cosmjs/amino";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";

import {
  WOLO_ADDRESS_PREFIX,
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_DEFAULT_GAS_PRICE,
  WOLO_RPC_URL,
  buildWoloRestTxLookupUrl,
  toUwoLoAmount,
} from "@/lib/woloChain";
import { validateWoloAddress } from "@/lib/woloBetSettlement";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";

type StakingUnstakeExecutionResult = {
  txHash: string;
  amountWolo: number;
  toAddress: string;
  proofUrl?: string | null;
};

const execFileAsync = promisify(execFile);

const STAKING_UNSTAKE_FEE =
  process.env.WOLO_STAKING_UNSTAKE_FEE?.trim() || "5000uwolo";

const STAKING_CLI =
  process.env.WOLO_STAKING_CLI?.trim() ||
  process.env.WOLO_FAUCET_CLI?.trim() ||
  "";

const STAKING_HOME =
  process.env.WOLO_STAKING_HOME?.trim() ||
  process.env.WOLO_FAUCET_HOME?.trim() ||
  "";

const STAKING_KEY_NAME =
  process.env.WOLO_STAKING_KEY_NAME?.trim() || "staking";

const STAKING_KEYRING_BACKEND =
  process.env.WOLO_STAKING_KEYRING_BACKEND?.trim() ||
  process.env.WOLO_FAUCET_KEYRING_BACKEND?.trim() ||
  "test";

const STAKING_CHAIN_ID =
  process.env.WOLO_STAKING_CHAIN_ID?.trim() ||
  process.env.WOLO_FAUCET_CHAIN_ID?.trim() ||
  WOLO_CHAIN_ID;

const STAKING_NODE_RPC =
  process.env.WOLO_STAKING_NODE_RPC?.trim() ||
  process.env.WOLO_FAUCET_NODE_RPC?.trim() ||
  process.env.WOLO_INTERNAL_RPC_URL?.trim() ||
  WOLO_RPC_URL;

function getStakingWalletMnemonic() {
  const explicit = process.env.WOLO_STAKING_WALLET_MNEMONIC?.trim() || "";
  if (explicit) return explicit;

  const allowPayoutMnemonicFallback =
    process.env.WOLO_STAKING_ALLOW_PAYOUT_MNEMONIC_FALLBACK?.trim() === "1";
  if (!allowPayoutMnemonicFallback) return "";

  return process.env.WOLO_BET_PAYOUT_MNEMONIC?.trim() || "";
}

function hasStakingKeyringSignerConfig() {
  if (process.env.WOLO_STAKING_DISABLE_KEYRING_SIGNER?.trim() === "1") {
    return false;
  }

  return Boolean(
    STAKING_CLI &&
      STAKING_HOME &&
      STAKING_KEY_NAME &&
      STAKING_KEYRING_BACKEND &&
      STAKING_CHAIN_ID &&
      STAKING_NODE_RPC
  );
}

function resolveUnstakeFee(value: string): number | "auto" | StdFee {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "auto") {
    return "auto";
  }

  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric) && numeric > 0 && /^\d+$/.test(normalized)) {
    return numeric;
  }

  return "auto";
}

function parseCliTxHash(stdout: string, stderr: string) {
  let payload: Record<string, unknown> | null = null;

  try {
    payload = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw new Error(
      `WoloChain staking keyring send returned non-JSON output: ${
        stdout.trim() || stderr.trim() || "empty output"
      }`
    );
  }

  const code = Number(payload.code ?? 0);
  if (Number.isFinite(code) && code !== 0) {
    const detail =
      String(payload.raw_log || "").trim() ||
      String(payload.log || "").trim() ||
      String(payload.codespace || "").trim() ||
      stderr.trim() ||
      `WoloChain tx failed with code ${code}.`;
    throw new Error(detail);
  }

  const hash =
    String(payload.txhash || "").trim() ||
    String(payload.tx_hash || "").trim() ||
    String(payload.txHash || "").trim();

  if (!hash) {
    throw new Error(
      `WoloChain staking keyring send did not return a tx hash: ${
        stdout.trim() || stderr.trim() || "empty output"
      }`
    );
  }

  return hash.toUpperCase();
}

async function executeWoloStakingUnstakeViaKeyring(input: {
  toAddress: string;
  amountWolo: number;
  memo: string;
}): Promise<StakingUnstakeExecutionResult> {
  if (!hasStakingKeyringSignerConfig()) {
    throw new Error("Staking keyring signer is not configured for unstaking.");
  }

  const amount = `${toUwoLoAmount(input.amountWolo)}${WOLO_BASE_DENOM}`;

  const args = [
    "tx",
    "bank",
    "send",
    STAKING_KEY_NAME,
    input.toAddress,
    amount,
    "--home",
    STAKING_HOME,
    "--keyring-backend",
    STAKING_KEYRING_BACKEND,
    "--chain-id",
    STAKING_CHAIN_ID,
    "--node",
    STAKING_NODE_RPC,
    "--fees",
    STAKING_UNSTAKE_FEE,
    "--note",
    input.memo.slice(0, 180),
    "--yes",
    "--output",
    "json",
    "--broadcast-mode",
    "sync",
  ];

  const { stdout, stderr } = await execFileAsync(STAKING_CLI, args, {
    timeout: 45_000,
    maxBuffer: 1024 * 1024,
  });

  const txHash = parseCliTxHash(stdout, stderr);

  return {
    txHash,
    amountWolo: input.amountWolo,
    toAddress: input.toAddress,
    proofUrl: buildWoloRestTxLookupUrl(txHash),
  };
}

async function executeWoloStakingUnstakeViaMnemonic(input: {
  toAddress: string;
  amountWolo: number;
  memo: string;
}): Promise<StakingUnstakeExecutionResult> {
  const stakingRuntime = getWoloStakingRuntime();
  const stakingWalletAddress = stakingRuntime.stakingWalletAddress?.trim() || "";
  const mnemonic = getStakingWalletMnemonic();

  if (!stakingWalletAddress) {
    throw new Error("Staking wallet address is not configured for unstaking.");
  }
  if (!mnemonic) {
    throw new Error("Staking wallet signer is not configured for unstaking.");
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: WOLO_ADDRESS_PREFIX,
  });
  const [account] = await wallet.getAccounts();
  if (!account?.address) {
    throw new Error("Staking wallet signer returned no address.");
  }

  if (account.address !== stakingWalletAddress) {
    throw new Error(
      `Staking wallet signer resolved to ${account.address}, not ${stakingWalletAddress}.`
    );
  }

  const client = await SigningStargateClient.connectWithSigner(WOLO_RPC_URL, wallet, {
    gasPrice: GasPrice.fromString(WOLO_DEFAULT_GAS_PRICE),
  });

  try {
    const result = await client.sendTokens(
      account.address,
      input.toAddress,
      [{ amount: toUwoLoAmount(input.amountWolo), denom: WOLO_BASE_DENOM }],
      resolveUnstakeFee(STAKING_UNSTAKE_FEE),
      input.memo.slice(0, 180)
    );

    return {
      txHash: result.transactionHash,
      amountWolo: input.amountWolo,
      toAddress: input.toAddress,
      proofUrl: buildWoloRestTxLookupUrl(result.transactionHash),
    };
  } finally {
    client.disconnect();
  }
}

export function hasWoloStakingUnstakeExecutionConfigured() {
  return Boolean(
    getWoloStakingRuntime().stakingWalletAddress &&
      (getStakingWalletMnemonic() || hasStakingKeyringSignerConfig())
  );
}

export function getWoloStakingUnstakeRuntime() {
  const runtime = getWoloStakingRuntime();
  const mnemonicConfigured = Boolean(getStakingWalletMnemonic());
  const keyringConfigured = hasStakingKeyringSignerConfig();
  const signerConfigured = Boolean(mnemonicConfigured || keyringConfigured);

  return {
    stakingSignerConfigured: signerConfigured,
    unstakeExecutionMode: mnemonicConfigured
      ? "staking_wallet_mnemonic"
      : keyringConfigured
        ? "staking_keyring"
        : "unconfigured",
    unstakeReady: Boolean(runtime.stakingWalletAddress && signerConfigured),
  } as const;
}

export async function executeWoloStakingUnstake(input: {
  toAddress: string;
  amountWolo: number;
  memo: string;
}): Promise<StakingUnstakeExecutionResult | null> {
  const stakingRuntime = getWoloStakingRuntime();
  const stakingWalletAddress = stakingRuntime.stakingWalletAddress?.trim() || "";

  if (!stakingWalletAddress) {
    throw new Error("Staking wallet address is not configured for unstaking.");
  }

  const addressError = validateWoloAddress(input.toAddress);
  if (addressError) {
    throw new Error(addressError);
  }

  if (getStakingWalletMnemonic()) {
    return executeWoloStakingUnstakeViaMnemonic(input);
  }

  if (hasStakingKeyringSignerConfig()) {
    return executeWoloStakingUnstakeViaKeyring(input);
  }

  throw new Error("Staking wallet signer is not configured for unstaking.");
}
