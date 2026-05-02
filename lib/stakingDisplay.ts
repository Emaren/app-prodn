const PUBLIC_STAKING_WEIGHT_SCALE = BigInt(1_000_000);

export function formatPublicStakingWeight(value: string | null | undefined) {
  if (!value || value === "0") return "--";

  let raw: bigint;
  try {
    raw = BigInt(value);
  } catch {
    return "--";
  }

  if (raw <= BigInt(0)) return "--";

  const hundredths =
    (raw * BigInt(100) + PUBLIC_STAKING_WEIGHT_SCALE / BigInt(2)) /
    PUBLIC_STAKING_WEIGHT_SCALE;
  const whole = hundredths / BigInt(100);
  const fraction = hundredths % BigInt(100);
  const decimals = fraction === BigInt(0) ? 0 : fraction % BigInt(10) === BigInt(0) ? 1 : 2;
  const displayValue = Number(whole) + Number(fraction) / 100;

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(displayValue)} weight`;
}

export function formatPublicStakingWeightStat(value: string | null | undefined) {
  const formatted = formatPublicStakingWeight(value);
  return formatted === "--" ? "0 weight" : formatted;
}
