import type {
  BetsViewMode,
} from "@/components/bets/page-shared";

export type BetsViewVersion =
  | "B1"
  | "A1"
  | "E1"
  | "E2"
  | "E3"
  | "E4";

export const BETS_VIEW_VERSIONS:
  readonly BetsViewVersion[] = [
    "B1",
    "A1",
    "E1",
    "E2",
    "E3",
    "E4",
  ];

export const LEGACY_BETS_VIEW_STORAGE_KEY =
  "aoe2hdbets.betsView.v4";

export function betsViewFamily(
  version: BetsViewVersion,
): BetsViewMode {
  if (version === "B1") return "basic";
  if (version === "A1") return "advanced";
  return "extreme";
}

export function normalizeBetsViewVersion(
  value: string | null,
): BetsViewVersion | null {
  return BETS_VIEW_VERSIONS.includes(
    value as BetsViewVersion,
  )
    ? (value as BetsViewVersion)
    : null;
}

export function legacyBetsViewToVersion(
  value: string | null,
): BetsViewVersion | null {
  if (value === "basic") return "B1";
  if (value === "advanced") return "A1";
  if (value === "extreme") return "E1";

  return null;
}
