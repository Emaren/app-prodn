import type { StdFee } from "@cosmjs/amino";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";

import {
  WOLO_ADDRESS_PREFIX,
  WOLO_BASE_DENOM,
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

const STAKING_UNSTAKE_FEE = process.env.WOLO_STAKING_UNSTAKE_FEE?.trim() || "auto";

function getStakingWalletMnemonic() {
  const explicit = process.env.WOLO_STAKING_WALLET_MNEMONIC?.trim() || "";
  if (explicit) return explicit;

  const allowPayoutMnemonicFallback =
    process.env.WOLO_STAKING_ALLOW_PAYOUT_MNEMONIC_FALLBACK?.trim() === "1";
  if (!allowPayoutMnemonicFallback) return "";

  return process.env.WOLO_BET_PAYOUT_MNEMONIC?.trim() || "";
}

function resolveUnstakeFee(value: string): number | "auto" | StdFee {
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

export function hasWoloStakingUnstakeExecutionConfigured() {
  return Boolean(getWoloStakingRuntime().stakingWalletAddress && getStakingWalletMnemonic());
}

export function getWoloStakingUnstakeRuntime() {
  const runtime = getWoloStakingRuntime();
  const signerConfigured = Boolean(getStakingWalletMnemonic());
  return {
    stakingSignerConfigured: signerConfigured,
    unstakeExecutionMode: signerConfigured ? "staking_wallet_signer" : "unconfigured",
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
  const mnemonic = getStakingWalletMnemonic();

  if (!stakingWalletAddress) {
    throw new Error("Staking wallet address is not configured for unstaking.");
  }
  if (!mnemonic) {
    throw new Error("Staking wallet signer is not configured for unstaking.");
  }

  const addressError = validateWoloAddress(input.toAddress);
  if (addressError) {
    throw new Error(addressError);
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
