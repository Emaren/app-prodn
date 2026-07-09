export function formatPublicStakingWeight(value: bigint | number | string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "0") return "--";

  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return "--";

  const abs = Math.abs(numeric);
  const units = [
    { threshold: 1_000_000_000_000_000, suffix: "Q" },
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];

  const unit = units.find((item) => abs >= item.threshold);
  if (!unit) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numeric);
  }

  const scaled = numeric / unit.threshold;
  const maxDecimals = Math.abs(scaled) < 10 ? 2 : Math.abs(scaled) < 100 ? 1 : 0;

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(scaled)}${unit.suffix}`;
}

export function formatPublicStakingWeightStat(value: bigint | number | string | null | undefined) {
  const formatted = formatPublicStakingWeight(value);
  return formatted === "--" ? "0 weight" : `${formatted} weight`;
}

export function formatPublicStakingWeightTile(value: bigint | number | string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "0") return "0 weight";

  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0 weight";

  const abs = Math.abs(numeric);
  const units = [
    { threshold: 1_000_000_000_000_000, suffix: "Q" },
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];

  const unit = units.find((item) => abs >= item.threshold);
  if (!unit) {
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numeric)} weight`;
  }

  const scaled = numeric / unit.threshold;

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(scaled)}${unit.suffix} weight`;
}
