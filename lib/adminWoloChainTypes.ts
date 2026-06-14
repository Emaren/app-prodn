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

export type WoloDuplicateTxClassification =
  | "MAINNET_VERIFIED_MULTI_PAYOUT"
  | "MAINNET_SUSPICIOUS_DUPLICATE"
  | "LEGACY_TESTNET_SINGLE_SEND_DUPLICATE"
  | "REST_NOT_FOUND";

export type WoloDuplicateTxClaimRow = {
  claimId: number;
  player: string;
  wallet: string | null;
  amountWolo: number;
  marketId: number | null;
  gameId: number | null;
  proofUrl: string | null;
  txHash: string;
  status: string;
  claimKind: string;
  errorState: string | null;
  note: string | null;
};

export type WoloDuplicateTxDiagnostics = {
  checkedAt: string;
  mainnetRestUrl: string;
  legacyTestnetRestUrl: string;
  duplicateGroupCount: number;
  suspiciousMainnetCount: number;
  legacyTestnetCount: number;
  verifiedMultiPayoutCount: number;
  restNotFoundCount: number;
  indexedTransferGapCount: number;
  groups: Array<{
    txHash: string;
    classification: WoloDuplicateTxClassification;
    detail: string;
    mainnetFound: boolean;
    testnetFound: boolean;
    mainnetMsgSendCount: number;
    testnetMsgSendCount: number;
    indexedTransferCount: number;
    claimCount: number;
    claims: WoloDuplicateTxClaimRow[];
  }>;
  indexedTransferGaps: Array<{
    txHash: string;
    claimIds: number[];
    playerNames: string[];
    wallets: string[];
    amountWolo: number;
    mainnetProofUrl: string | null;
    mainnetMsgSendCount: number;
    detail: string;
  }>;
};

export type AdminWatcherDiagnosticsPayload = {
  checkedAt: string;
  windowDays: number;
  userCount: number;
  rows: Array<{
    key: string;
    userId: number | null;
    userUid: string | null;
    displayName: string;
    appVersion: string | null;
    platform: string | null;
    artifact: string | null;
    lastHeartbeatAt: string | null;
    lastEventAt: string | null;
    replayFiles: number;
    replayHashes: number;
    parsedFinals: number;
    unparsedFinals: number;
    uploadFailed: number;
    parseFailed: number;
    replayRollups: Array<{
      key: string;
      replayFile: string | null;
      replayHash: string | null;
      lastSeenAt: string | null;
      eventCount: number;
      parseAttemptCount: number;
      parsedGameStatsIds: number[];
      statuses: string[];
      failureDetails: string[];
    }>;
  }>;
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
    settlementHealthOk: boolean | null;
    settlementHealthStatus: string | null;
    settlementHealthFailureCode: string | null;
    settlementHealthDetail: string | null;
    settlementHealthChainId: string | null;
    settlementHealthRuntimeChainId: string | null;
    settlementPayoutAddress: string | null;
    settlementPayoutBalanceWolo: number | null;
    settlementMinPayoutBalanceWolo: number | null;
    settlementEscrowAddress: string | null;
    settlementEscrowBalanceWolo: number | null;
    payoutReady: boolean;
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
  duplicateTxDiagnostics: WoloDuplicateTxDiagnostics;
  watcherDiagnostics: AdminWatcherDiagnosticsPayload;
  warnings: string[];
};
