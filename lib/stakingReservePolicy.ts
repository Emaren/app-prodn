export const STAKING_UWOLO_PER_WOLO = BigInt(1_000_000);
export const MIN_STAKING_OPERATING_RESERVE_WOLO = 10_000;
export const MIN_STAKING_OPERATING_RESERVE_UWOLO =
  BigInt(MIN_STAKING_OPERATING_RESERVE_WOLO) * STAKING_UWOLO_PER_WOLO;

function wholeWoloToUWolo(value: number) {
  return (
    BigInt(Math.max(0, Math.floor(value || 0))) * STAKING_UWOLO_PER_WOLO
  );
}

export function resolveStakingReserveTargetUWolo(
  raw: string | null | undefined
) {
  if (!raw?.trim()) return MIN_STAKING_OPERATING_RESERVE_UWOLO;

  try {
    const parsed = BigInt(raw.trim());
    return parsed > MIN_STAKING_OPERATING_RESERVE_UWOLO
      ? parsed
      : MIN_STAKING_OPERATING_RESERVE_UWOLO;
  } catch {
    return MIN_STAKING_OPERATING_RESERVE_UWOLO;
  }
}

export function calculateStakingReservePolicy(input: {
  stakingWalletBalanceUWolo: bigint | null;
  totalConfirmedStakedWolo: number;
  reserveTargetUWolo?: bigint;
}) {
  const reserveTargetUWolo =
    input.reserveTargetUWolo ?? MIN_STAKING_OPERATING_RESERVE_UWOLO;
  const confirmedLiabilityUWolo = wholeWoloToUWolo(
    input.totalConfirmedStakedWolo
  );
  const requiredBalanceUWolo =
    confirmedLiabilityUWolo + reserveTargetUWolo;
  const operatingReserveUWolo =
    input.stakingWalletBalanceUWolo == null
      ? null
      : input.stakingWalletBalanceUWolo - confirmedLiabilityUWolo;
  const reserveSurplusUWolo =
    input.stakingWalletBalanceUWolo == null
      ? null
      : input.stakingWalletBalanceUWolo - requiredBalanceUWolo;
  const operationalReserveHealthy =
    input.stakingWalletBalanceUWolo == null
      ? null
      : input.stakingWalletBalanceUWolo >= requiredBalanceUWolo;
  const operatorTopUpNeededUWolo =
    input.stakingWalletBalanceUWolo == null ||
    input.stakingWalletBalanceUWolo >= requiredBalanceUWolo
      ? BigInt(0)
      : requiredBalanceUWolo - input.stakingWalletBalanceUWolo;

  return {
    confirmedLiabilityUWolo,
    reserveTargetUWolo,
    requiredBalanceUWolo,
    operatingReserveUWolo,
    reserveSurplusUWolo,
    operationalReserveHealthy,
    operatorTopUpNeededUWolo,
  };
}
