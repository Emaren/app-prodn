import {
  WOLO_BET_ESCROW_ADDRESS,
  estimateWoloNetworkFeeWolo,
  shortenAddress,
} from "@/lib/woloChain";
import {
  getWoloPayoutSignerRuntime,
  hasWoloPayoutExecutionConfigured,
} from "@/lib/woloBetSettlement";

const explicitStakingWalletAddress =
  process.env.NEXT_PUBLIC_WOLO_STAKING_WALLET_ADDRESS?.trim() ||
  process.env.WOLO_STAKING_WALLET_ADDRESS?.trim() ||
  "";

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
    unstakeReady: hasWoloPayoutExecutionConfigured(),
    payoutExecutionMode: payoutRuntime.settlementServiceConfigured
      ? "settlement_service"
      : payoutRuntime.localSignerFallbackConfigured
        ? "local_signer_fallback"
        : "unconfigured",
    txFeeEstimateWolo: estimateWoloNetworkFeeWolo(),
  } as const;
}
