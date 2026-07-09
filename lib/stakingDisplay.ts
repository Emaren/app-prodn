export function formatPublicStakingWeight(value: bigint | number | string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "0";

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function formatPublicStakingWeightStat(value: bigint | number | string | null | undefined) {
  const formatted = formatPublicStakingWeight(value);
  return `${formatted} weight`;
}
