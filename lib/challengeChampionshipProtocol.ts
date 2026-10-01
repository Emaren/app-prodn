/** Business projection shared by every V2 Challenge surface. No browser clock owns state. */
export const CHAMPIONSHIP_CHALLENGE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CHAMPIONSHIP_COMMISSIONER_GRACE_MS = 60 * 60 * 1000;
export const CHAMPIONSHIP_PROTOCOL_VERSION = "championship_v2";
export type ChampionshipSide = "challenger" | "defender";
export type ChampionshipParticipantProof = {
  userId: number; uid: string; name: string; side: ChampionshipSide; seat: number;
  steamId: string; accepted: boolean; funded: boolean; notified: boolean;
  fundingChallengeId: number; fundingSide: "left" | "right";
};
export type ChampionshipProjection = {
  version: 2; serverNow: string; challengeDeadline: string; commissionerGraceDeadline: string;
  phase: string; titleName: string | null; nextInstruction: string;
  defenseStartedAt: string | null; reasonCode: string | null;
  winnerSide?: string | null; resultStatus?: string; resultReplayId?: number | null;
  titleCustodyStatus?: string; custodyEpoch?: string | null; transferGroupId?: number | null;
  currentHolderNames?: string[]; currentHolderUserIds?: number[];
  titleId?: string | null; titleImageUri?: string | null; teamSize?: number; mode?: string | null;
  paymentStatus?: string; paymentTxHashes?: string[]; purseFundedWolo?: number; pursePaidWolo?: number;
  bountyStatus?: string; bountyAmountWolo?: number; bountyTxHashes?: string[];
  nftStatus?: string; nftReasonCode?: string | null;
  participants: Array<ChampionshipParticipantProof & { canAccept: boolean; canFund: boolean }>;
};
export function championshipClock(createdAt: Date) {
  const challengeDeadline = new Date(createdAt.getTime() + CHAMPIONSHIP_CHALLENGE_WINDOW_MS);
  return { challengeDeadline, commissionerGraceDeadline: new Date(challengeDeadline.getTime() + CHAMPIONSHIP_COMMISSIONER_GRACE_MS) };
}
export function championshipCountdownSeconds(deadline: string, serverNow: string, elapsedMs = 0) {
  return Math.max(0, Math.ceil((Date.parse(deadline) - Date.parse(serverNow) - elapsedMs) / 1000));
}
const TERMINAL = new Set(["completed", "defaulted", "disputed", "cancelled", "declined", "expired"]);
export function projectChampionshipChallenge(input: {
  state: string; challengeDeadline: Date; commissionerGraceDeadline: Date;
  defenseStartedAt: Date | null; titleName: string | null; reasonCode: string | null;
  participants: ChampionshipParticipantProof[];
}, now = new Date(), viewerUserId?: number | null): ChampionshipProjection {
  const open = !TERMINAL.has(input.state) && !input.defenseStartedAt && input.challengeDeadline > now && !["commissioner_review", "default_grace"].includes(input.state);
  const allAccepted = input.participants.every(p => p.accepted);
  const allFunded = input.participants.every(p => p.funded);
  const phase = input.defenseStartedAt && !TERMINAL.has(input.state) && input.state !== "commissioner_review" ? "defense_in_progress" : input.state === "open" && allAccepted && allFunded ? "ready" : input.state;
  const nextInstruction = phase === "defense_in_progress" ? (input.titleName ? "TITLE IS BEING DEFENDED" : "BATTLE IN PROGRESS")
    : phase === "default_grace" ? "TITLE DEFENSE DEFAULT — Commissioner review"
    : phase === "commissioner_review" ? "COMMISSIONER REVIEW"
    : phase === "disputed" ? "TITLE IN DISPUTE — Commissioner playoff required"
    : TERMINAL.has(phase) ? phase === "completed" ? "Result verified — inspect custody and chain payment proof" : phase === "defaulted" ? "Title default recorded — refunds require chain proof" : `Challenge ${phase}`
    : !allAccepted ? "Accept the Challenge — every warrior must confirm"
    : !allFunded ? "Challenge accepted — fund your side"
    : "Ready — start the qualifying defense before the deadline";
  return { version: 2, serverNow: now.toISOString(), challengeDeadline: input.challengeDeadline.toISOString(), commissionerGraceDeadline: input.commissionerGraceDeadline.toISOString(), phase, titleName: input.titleName, nextInstruction, defenseStartedAt: input.defenseStartedAt?.toISOString() ?? null, reasonCode: input.reasonCode,
    participants: input.participants.map(p => ({ ...p, canAccept: open && p.userId === viewerUserId && !p.accepted, canFund: open && p.userId === viewerUserId && p.accepted && !p.funded })) };
}
export type ChampionshipBattleProof = {
  id: number; sessionKey: string; startedAt: string | null; mode: string | null;
  state: "live" | "completed"; finalProofPending?: boolean; desync?: boolean;
  /** A parsed/client timestamp alone is never trusted to stop title default. */
  startProvenance?: "authenticated_live_observation" | "preserved_defense_start";
  startWatcherParticipantUids?: string[];
  watcherParticipantUids: string[];
  players: Array<{ steamId?: string | null; teamId?: string | null; winner?: boolean | null }>;
};
export function validateChampionshipBattleStart(input: {
  createdAt: Date; challengeDeadline: Date; mode: string | null; teamSize: number;
  participants: ChampionshipParticipantProof[]; battle: ChampionshipBattleProof;
}) {
  const { battle, participants } = input;
  const startedMs = battle.startedAt ? Date.parse(battle.startedAt) : NaN;
  if (!Number.isFinite(startedMs) || !battle.startProvenance) return { ok: false, code: "WATCHER_PROOF_MISSING" } as const;
  if (startedMs < input.createdAt.getTime() || startedMs >= input.challengeDeadline.getTime()) return { ok: false, code: "MATCH_NOT_STARTED_BEFORE_DEADLINE" } as const;
  if (input.mode && input.mode !== battle.mode) return { ok: false, code: "MODE_MISMATCH" } as const;
  if (participants.length !== 2 * input.teamSize || battle.players.length !== participants.length) return { ok: false, code: "TEAM_SIZE_MISMATCH" } as const;
  const expected = new Set(participants.map(p => p.steamId));
  const actual = battle.players.map(p => p.steamId || "");
  if (expected.size !== participants.length || new Set(actual).size !== actual.length || actual.some(id => !expected.has(id))) return { ok: false, code: "TEAM_ROSTER_MISMATCH" } as const;
  if (input.teamSize > 1) {
    const sideTeams = ["challenger", "defender"].map(side => new Set(participants.filter(p => p.side === side).map(p => battle.players.find(player => player.steamId === p.steamId)?.teamId)));
    if (sideTeams.some(teams => teams.size !== 1 || teams.has(null) || teams.has(undefined)) || [...sideTeams[0]!][0] === [...sideTeams[1]!][0]) return { ok: false, code: "TEAM_ROSTER_MISMATCH" } as const;
  }
  const defenders = participants.filter(p => p.side === "defender");
  if (!defenders.some(p => battle.startWatcherParticipantUids?.includes(p.uid))) return { ok: false, code: "WATCHER_PROOF_MISSING" } as const;
  if (!participants.every(p => p.accepted && p.funded)) return { ok: false, code: "CHALLENGE_NOT_FUNDED" } as const;
  return { ok: true, startedAt: new Date(startedMs) } as const;
}
export function validateChampionshipBattleFinal(input: Parameters<typeof validateChampionshipBattleStart>[0]) {
  const start = validateChampionshipBattleStart(input);
  if (!start.ok) return start;
  if (input.battle.state !== "completed" || input.battle.finalProofPending) return { ok: false, code: "RESULT_NOT_FINAL" } as const;
  if (input.battle.desync) return { ok: false, code: "MATCH_DESYNC" } as const;
  if (!input.participants.every(p => input.battle.watcherParticipantUids.includes(p.uid))) return { ok: false, code: "FULL_ROSTER_PROOF_REQUIRED" } as const;
  const winning = input.battle.players.filter(p => p.winner === true);
  const losing = input.battle.players.filter(p => p.winner === false);
  if (winning.length !== input.teamSize || losing.length !== input.teamSize) return { ok: false, code: "REPLAY_RESULT_AMBIGUOUS" } as const;
  const sides = new Set(winning.map(player => input.participants.find(p => p.steamId === player.steamId)?.side));
  if (sides.size !== 1 || sides.has(undefined)) return { ok: false, code: "REPLAY_RESULT_AMBIGUOUS" } as const;
  return { ok: true, startedAt: start.startedAt, winnerSide: [...sides][0] as ChampionshipSide } as const;
}
export function championshipDefaultDecision(input: { participants: ChampionshipParticipantProof[]; defenseStartedAt: Date | null; commissionerActionAt: Date | null; challengeDeadline: Date; commissionerGraceDeadline: Date; state: string }, now: Date) {
  if (input.defenseStartedAt || input.commissionerActionAt || TERMINAL.has(input.state) || input.state === "commissioner_review") return "hold";
  if (now < input.challengeDeadline) return "wait";
  if (now < input.commissionerGraceDeadline) return "grace";
  const challenger = input.participants.filter(p => p.side === "challenger");
  const defender = input.participants.filter(p => p.side === "defender");
  if (!challenger.length || !challenger.every(p => p.accepted && p.funded)) return "invalid_claimant";
  if (!defender.every(p => p.notified)) return "review";
  if (defender.every(p => p.accepted && p.funded)) return "review";
  return "eligible_default";
}
