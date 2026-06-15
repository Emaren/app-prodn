export type ChampionshipEvaluationGameResult = {
  gameStatsId?: number | null;
  winnerName?: string | null;
  loserNames?: string[];
  playedAt?: string | Date | null;
  players?: unknown;
  metrics?: Record<string, unknown>;
};

export type ChampionshipTransferCandidate = {
  titleId: string;
  reason: string;
  winnerName: string;
  sourceGameStatsId?: number | null;
  metricValue?: string | number | null;
};

export type ChampionAssignmentInput = {
  titleId: string;
  holderName: string;
  sourceGameStatsId?: number | null;
  takenFromName?: string | null;
  heldSince?: string | Date | null;
  recordValue?: string | number | null;
  proofUrl?: string | null;
};

export async function evaluateChampionshipTransfers(
  gameResult: ChampionshipEvaluationGameResult
): Promise<ChampionshipTransferCandidate[]> {
  void gameResult;
  return [];
}

export async function evaluateDesignationTransfers(
  gameResult: ChampionshipEvaluationGameResult
): Promise<ChampionshipTransferCandidate[]> {
  void gameResult;
  return [];
}

export async function assignTitleHolder(input: ChampionAssignmentInput) {
  void input;
  return {
    ok: false,
    detail: "Title assignment persistence is scaffolded in AoE2HDBets and awaits the parser/admin storage pass.",
  };
}

export async function assignArtifactHolder(input: ChampionAssignmentInput) {
  void input;
  return {
    ok: false,
    detail: "Artifact assignment persistence is scaffolded in AoE2HDBets and awaits the parser/admin storage pass.",
  };
}
