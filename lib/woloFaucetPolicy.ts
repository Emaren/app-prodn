export type FaucetPolicyRecord = {
  claimedAtMs: number;
  cooldownEndsAtMs: number;
  txhash: string;
  address?: string;
};

export type FaucetPolicyDecision =
  | {
      action: "allow";
      hourlyConfirmedClaims: number;
      dailyConfirmedClaims: number;
    }
  | {
      action: "block";
      reason:
        | "circuit_breaker"
        | "address_cooldown"
        | "account_cooldown";
      hourlyConfirmedClaims: number;
      dailyConfirmedClaims: number;
    }
  | {
      action: "trip";
      reason:
        | "hourly_limit"
        | "daily_limit";
      hourlyConfirmedClaims: number;
      dailyConfirmedClaims: number;
    };

type FaucetPolicyInput = {
  nowMs: number;
  address: string;
  addressClaim?: FaucetPolicyRecord | null;
  accountClaim?: FaucetPolicyRecord | null;
  circuitBreakerActive: boolean;
  accountClaims: readonly FaucetPolicyRecord[];
  maxClaimsPerHour: number;
  maxClaimsPerDay: number;
  hourlyWindowMs: number;
  dailyWindowMs: number;
};

function isCoolingDown(
  record: FaucetPolicyRecord | null | undefined,
  nowMs: number
) {
  return Boolean(
    record &&
      Number.isFinite(record.cooldownEndsAtMs) &&
      nowMs < record.cooldownEndsAtMs
  );
}

function isConfirmed(record: FaucetPolicyRecord) {
  return Boolean(record.txhash?.trim());
}

function countConfirmedSince(
  records: readonly FaucetPolicyRecord[],
  sinceMs: number
) {
  return records.filter(
    (record) =>
      isConfirmed(record) &&
      Number.isFinite(record.claimedAtMs) &&
      record.claimedAtMs >= sinceMs
  ).length;
}

export function evaluateFaucetClaimPolicy(
  input: FaucetPolicyInput
): FaucetPolicyDecision {
  const hourlyConfirmedClaims =
    countConfirmedSince(
      input.accountClaims,
      input.nowMs - input.hourlyWindowMs
    );

  const dailyConfirmedClaims =
    countConfirmedSince(
      input.accountClaims,
      input.nowMs - input.dailyWindowMs
    );

  /*
   * One atomic account-ledger reservation protects both the
   * authenticated identity and its requested destination.
   *
   * This remains effective even if chain broadcast becomes
   * uncertain before the legacy address ledger can be finalized.
   */
  const activeAddressClaim =
    isCoolingDown(
      input.addressClaim,
      input.nowMs
    )
      ? input.addressClaim
      : input.accountClaims.find(
          (record) =>
            record.address === input.address &&
            isCoolingDown(
              record,
              input.nowMs
            )
        ) ?? null;

  if (input.circuitBreakerActive) {
    return {
      action: "block",
      reason: "circuit_breaker",
      hourlyConfirmedClaims,
      dailyConfirmedClaims,
    };
  }

  if (activeAddressClaim) {
    return {
      action: "block",
      reason: "address_cooldown",
      hourlyConfirmedClaims,
      dailyConfirmedClaims,
    };
  }

  if (
    isCoolingDown(
      input.accountClaim,
      input.nowMs
    )
  ) {
    return {
      action: "block",
      reason: "account_cooldown",
      hourlyConfirmedClaims,
      dailyConfirmedClaims,
    };
  }

  if (
    hourlyConfirmedClaims >=
    input.maxClaimsPerHour
  ) {
    return {
      action: "trip",
      reason: "hourly_limit",
      hourlyConfirmedClaims,
      dailyConfirmedClaims,
    };
  }

  if (
    dailyConfirmedClaims >=
    input.maxClaimsPerDay
  ) {
    return {
      action: "trip",
      reason: "daily_limit",
      hourlyConfirmedClaims,
      dailyConfirmedClaims,
    };
  }

  return {
    action: "allow",
    hourlyConfirmedClaims,
    dailyConfirmedClaims,
  };
}
