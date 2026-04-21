export type WoloChainAdminBalance = {
  key: "escrow" | "payoutSigner" | "treasury" | "dexLiquidity";
  label: string;
  address: string | null;
  amountUWolo: string | null;
  amountWolo: string | null;
  status: "ready" | "missing" | "error";
  detail: string | null;
  configSource: string | null;
};

export type WoloChainAdminChallengeRun = {
  id: number;
  title: string;
  status: string;
  displayState: string;
  statusLabel: string;
  statusDetail: string;
  challengerName: string;
  challengedName: string;
  scheduledAt: string;
  updatedAt: string;
  resultAt: string | null;
  settlementReadyAt: string | null;
  terms: {
    wagerAmountWolo: number;
    guaranteeAmountWolo: number;
    totalFundingWolo: number;
  };
  funding: {
    challengerFundedAt: string | null;
    challengedFundedAt: string | null;
    challengerFundingTxHash: string | null;
    challengedFundingTxHash: string | null;
    challengerFundingWalletAddress: string | null;
    challengedFundingWalletAddress: string | null;
  };
  checkIn: {
    challengerCheckedInAt: string | null;
    challengedCheckedInAt: string | null;
    opensAt: string;
    closesAt: string;
    state: "disabled" | "upcoming" | "open" | "closed";
  };
  disposition: {
    label: string | null;
    guarantee: string | null;
    wager: string | null;
    treasury: string | null;
  };
  linked: {
    sessionKey: string | null;
    mapName: string | null;
    winner: string | null;
  };
};

export type WoloChainAdminPayload = {
  checkedAt: string;
  chain: {
    healthy: boolean;
    chainId: string;
    chainName: string;
    statusLabel: string;
    consensusStatus: string;
    latestBlockHeight: string;
    latestBlockTime: string | null;
    lastBlockAgeSeconds: number | null;
    peers: number;
    sourceLabel: string;
  };
  settlementService: {
    checkedAt: string | null;
    settlementServiceConfigured: boolean;
    settlementAuthConfigured: boolean;
    payoutExecutionMode: string;
    localSignerFallbackEnabled: boolean;
    groupedRunCapability: string;
    escrowVerifyCapability: string;
    escrowRecentCapability: string;
    warnings: string[];
    detail: string | null;
  };
  balances: {
    escrow: WoloChainAdminBalance;
    payoutSigner: WoloChainAdminBalance;
    treasury: WoloChainAdminBalance;
    dexLiquidity: WoloChainAdminBalance | null;
  };
  challengeRuns: WoloChainAdminChallengeRun[];
  warnings: string[];
};
