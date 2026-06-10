const PUBLIC_STAKING_WEIGHT_SCALE = BigInt(1_000_000);

function readPublicStakingWeight(value: string | null | undefined) {
  if (!value || value === "0") return null;

  let raw: bigint;
  try {
    raw = BigInt(value);
  } catch {
    return null;
  }

  if (raw <= BigInt(0)) return null;

  const hundredths =
    (raw * BigInt(100) + PUBLIC_STAKING_WEIGHT_SCALE / BigInt(2)) /
    PUBLIC_STAKING_WEIGHT_SCALE;

  const whole = hundredths / BigInt(100);
  const fraction = hundredths % BigInt(100);

  return Number(whole) + Number(fraction) / 100;
}

function formatWeightNumber(value: number) {
  if (value >= 1000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: value < 10000 ? 1 : 0,
      minimumFractionDigits: 0,
    }).format(value);
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 100 ? 1 : 0,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatPublicStakingWeight(value: string | null | undefined) {
  const displayValue = readPublicStakingWeight(value);
  if (displayValue == null) return "--";

  return `${formatWeightNumber(displayValue)} weight`;
}

export function formatPublicStakingWeightStat(value: string | null | undefined) {
  const formatted = formatPublicStakingWeight(value);
  return formatted === "--" ? "0 weight" : formatted;
}
