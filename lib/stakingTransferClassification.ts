export type StakingTransferClassification =
  | "stake_deposit"
  | "operational_reserve"
  | "other";

const CANONICAL_STAKING_DEPOSIT_MEMO = "aoe2hdbets staking deposit";
const CANONICAL_RESERVE_MEMO =
  /^staking-wallet-(?:operating-)?reserve-top-up:(\d+(?:\.\d{1,6})?)wolo:(\d{8})$/i;
const LEGACY_RESERVE_MEMOS = [
  /^staking wallet\s*[—–-]\s*top up(?:\s+#\d+)?$/i,
  /^top up\s+#\d+\s*[—–-]\s*staking wallet reserve top-up$/i,
];

function normalizeMemo(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ");
}

export function isOperationalStakingReserveMemo(
  memo: string | null | undefined
) {
  const normalized = normalizeMemo(memo);
  if (!normalized) return false;
  return (
    CANONICAL_RESERVE_MEMO.test(normalized) ||
    LEGACY_RESERVE_MEMOS.some((pattern) => pattern.test(normalized))
  );
}

export function isOperationalStakingReserveTransfer(input: {
  memo: string | null | undefined;
  senderAddress?: string | null;
  operationalSourceAddresses?: readonly string[];
}) {
  if (!isOperationalStakingReserveMemo(input.memo)) return false;
  if (!input.operationalSourceAddresses?.length) return true;
  const senderAddress = (input.senderAddress || "").trim().toLowerCase();
  return input.operationalSourceAddresses.some(
    (address) => address.trim().toLowerCase() === senderAddress
  );
}

export function classifyStakingTransferWithOperationalGuard(input: {
  memo: string | null | undefined;
  senderAddress?: string | null;
  operationalSourceAddresses?: readonly string[];
}): StakingTransferClassification {
  if (isOperationalStakingReserveTransfer(input)) {
    return "operational_reserve";
  }
  if (isOperationalStakingReserveMemo(input.memo)) {
    return "other";
  }
  return classifyStakingTransferMemo(input.memo);
}

export function classifyStakingTransferMemo(
  memo: string | null | undefined
): StakingTransferClassification {
  const normalized = normalizeMemo(memo);
  if (isOperationalStakingReserveMemo(normalized)) {
    return "operational_reserve";
  }
  if (normalized.toLowerCase() === CANONICAL_STAKING_DEPOSIT_MEMO) {
    return "stake_deposit";
  }
  return "other";
}

export function classifyStakingWalletInboundTransfer(input: {
  memo?: string | null;
  senderAddress?: string | null;
  recipientAddress: string | null | undefined;
  stakingWalletAddress: string | null | undefined;
  operationalSourceAddresses?: readonly string[];
}): StakingTransferClassification {
  const recipientAddress = (input.recipientAddress || "").trim().toLowerCase();
  const stakingWalletAddress = (input.stakingWalletAddress || "")
    .trim()
    .toLowerCase();
  if (!recipientAddress || recipientAddress !== stakingWalletAddress) {
    return "other";
  }
  return classifyStakingTransferWithOperationalGuard({
    memo: input.memo,
    senderAddress: input.senderAddress,
    operationalSourceAddresses: input.operationalSourceAddresses,
  });
}

export function stakingTransferLedgerPresentation(
  classification: StakingTransferClassification,
  amountLabel: string
) {
  if (classification === "operational_reserve") {
    return {
      eventType: "RESERVE",
      label: `${amountLabel} operating reserve funding`,
      detailPrefix: "Admin operational funding",
      tone: "sky",
    } as const;
  }

  return {
    eventType: "DIRECT",
    label: `${amountLabel} direct transfer`,
    detailPrefix: null,
    tone: "emerald",
  } as const;
}

export function canInspectOperationalReserveActivity(input: {
  isAdmin: boolean;
  selectedFilter: string | null | undefined;
}) {
  return input.isAdmin && input.selectedFilter === "reserve";
}

export function canExposePublicStakingActivityEvent(eventType?: string | null) {
  const normalizedEventType = String(eventType || "").trim().toUpperCase();
  return normalizedEventType !== "FAUCET" && normalizedEventType !== "RESERVE";
}
