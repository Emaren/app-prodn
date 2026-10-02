export type EloTrophyLane = "rm" | "dm";
export type EloTrophyDivision =
  | "rising"
  | "challenger"
  | "veteran"
  | "elite"
  | "legend";

export type EloTrophyDescriptorInput = {
  trophyId: string;
  displayName?: string | null;
  tier?: string | null;
  eloBandMin?: number | null;
  eloBandMax?: number | null;
};

const DIVISION_BANDS: Record<
  EloTrophyDivision,
  { min: number | null; max: number | null }
> = {
  rising: { min: null, max: 1199 },
  challenger: { min: 1200, max: 1499 },
  veteran: { min: 1500, max: 1799 },
  elite: { min: 1800, max: 2099 },
  legend: { min: 2100, max: null },
};

function normalized(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

export function canonicalEloTrophyId(
  lane: EloTrophyLane,
  division: EloTrophyDivision,
) {
  if (lane === "rm") return `elo-${division}`;
  return division === "challenger"
    ? "dm-contender"
    : `dm-${division}`;
}

export function eloTrophyLane(
  input: EloTrophyDescriptorInput,
): EloTrophyLane {
  const text = [
    input.trophyId,
    input.displayName,
    input.tier,
  ]
    .map(normalized)
    .join(" ");

  if (/\b(dm|death match|deathmatch)\b/.test(text)) {
    return "dm";
  }

  return "rm";
}

export function eloTrophyDivision(
  input: EloTrophyDescriptorInput,
): EloTrophyDivision | null {
  const text = [
    input.trophyId,
    input.displayName,
    input.tier,
  ]
    .map(normalized)
    .join(" ");

  if (/\brising\b/.test(text)) return "rising";
  if (/\b(challenger|contender)\b/.test(text)) return "challenger";
  if (/\bveteran\b/.test(text)) return "veteran";
  if (/\belite\b/.test(text)) return "elite";
  if (/\blegend\b/.test(text)) return "legend";

  for (const [division, band] of Object.entries(DIVISION_BANDS) as Array<
    [EloTrophyDivision, { min: number | null; max: number | null }]
  >) {
    if (
      input.eloBandMin === band.min &&
      input.eloBandMax === band.max
    ) {
      return division;
    }
  }

  return null;
}

export function eloTrophyIdentity(
  input: EloTrophyDescriptorInput,
) {
  const division = eloTrophyDivision(input);
  if (!division) return null;

  const lane = eloTrophyLane(input);
  return {
    lane,
    division,
    canonicalId: canonicalEloTrophyId(lane, division),
  };
}

export function replayEloLane(
  gameType: string | null | undefined,
): EloTrophyLane | null {
  const value = normalized(gameType);
  if (!value) return null;
  if (/\b(death match|deathmatch|dm)\b/.test(value)) return "dm";

  /*
   * AoE2 HD serializes some ordinary Random Map lobbies with the
   * legacy parser token `TurboRandom<N>` (for example `TurboRandom9`).
   * The Watcher must preserve that raw parser value for evidence, but
   * championship/ELO lane policy should classify the verified game as RM.
   */
  if (
    /\b(random map|rm)\b/.test(value) ||
    /^turbo[\s_-]*random[\s_-]*\d*$/.test(value)
  ) {
    return "rm";
  }

  return null;
}
