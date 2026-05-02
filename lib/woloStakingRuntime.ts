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
  return (
    process.env.WOLO_STAKING_ALLOW_PAYOUT_MNEMONIC_FALLBACK?.trim() === "1" &&
    Boolean(process.env.WOLO_BET_PAYOUT_MNEMONIC?.trim())
  );
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
    unstakeExecutionMode: hasStakingWalletSignerConfigured()
      ? "staking_wallet_signer"
      : "unconfigured",
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
