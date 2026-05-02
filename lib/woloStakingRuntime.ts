import {
  WOLO_BET_ESCROW_ADDRESS,
  estimateWoloNetworkFeeWolo,
  shortenAddress,
} from "@/lib/woloChain";
import {
  getWoloPayoutSignerRuntime,
} from "@/lib/woloBetSettlement";

const explicitStakingWalletAddress =
  process.env.NEXT_PUBLIC_WOLO_STAKING_WALLET_ADDRESS?.trim() ||
  process.env.WOLO_STAKING_WALLET_ADDRESS?.trim() ||
  "";

function hasStakingWalletSignerConfigured() {
  if (process.env.WOLO_STAKING_WALLET_MNEMONIC?.trim()) return true;
  if (
    process.env.WOLO_STAKING_ALLOW_PAYOUT_MNEMONIC_FALLBACK?.trim() === "1" &&
    process.env.WOLO_BET_PAYOUT_MNEMONIC?.trim()
  ) {
    return true;
  }
  if (process.env.WOLO_STAKING_DISABLE_KEYRING_SIGNER?.trim() === "1") {
    return false;
  }
  return Boolean(
    (process.env.WOLO_STAKING_CLI?.trim() || process.env.WOLO_FAUCET_CLI?.trim()) &&
      (process.env.WOLO_STAKING_HOME?.trim() || process.env.WOLO_FAUCET_HOME?.trim()) &&
      (process.env.WOLO_STAKING_KEY_NAME?.trim() || "staking")
  );
}

function getStakingUnstakeExecutionMode() {
  if (process.env.WOLO_STAKING_WALLET_MNEMONIC?.trim()) return "staking_wallet_mnemonic";
  if (
    process.env.WOLO_STAKING_ALLOW_PAYOUT_MNEMONIC_FALLBACK?.trim() === "1" &&
    process.env.WOLO_BET_PAYOUT_MNEMONIC?.trim()
  ) {
    return "staking_wallet_mnemonic_fallback";
  }
  if (hasStakingWalletSignerConfigured()) return "staking_keyring";
  return "unconfigured";
}

export function getWoloStakingRuntime() {
  const payoutRuntime = getWoloPayoutSignerRuntime();
  const payoutAddress = payoutRuntime.payoutAddress?.trim() || "";
  const stakingWalletAddress =
    explicitStakingWalletAddress || payoutAddress || WOLO_BET_ESCROW_ADDRESS || "";
  const walletSource = explicitStakingWalletAddress
    ? "staking"
    : payoutAddress
      ? "payout"
      : WOLO_BET_ESCROW_ADDRESS
        ? "escrow"
        : "missing";

  return {
    stakingWalletAddress,
    stakingWalletShortAddress: stakingWalletAddress
      ? shortenAddress(stakingWalletAddress, 10, 6)
      : "Wallet pending",
    walletSource,
    stakeReady: Boolean(stakingWalletAddress),
    unstakeReady: Boolean(stakingWalletAddress && hasStakingWalletSignerConfigured()),
    unstakeExecutionMode: getStakingUnstakeExecutionMode(),
    unstakeReadyDetail: hasStakingWalletSignerConfigured()
      ? "Staking wallet signer ready."
      : "Staking wallet signer is not configured.",
    payoutExecutionMode: payoutRuntime.settlementServiceConfigured
      ? "settlement_service"
      : payoutRuntime.localSignerFallbackConfigured
        ? "local_signer_fallback"
        : "unconfigured",
    txFeeEstimateWolo: estimateWoloNetworkFeeWolo(),
  } as const;
}
