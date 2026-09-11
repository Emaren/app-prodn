export const CHALLENGE_PROTOCOL_VERSION = "steam_wolo_v1" as const;
export const LEGACY_CHALLENGE_PROTOCOL_VERSION = "legacy" as const;

export type ChallengeProtocolVersion =
  | typeof CHALLENGE_PROTOCOL_VERSION
  | typeof LEGACY_CHALLENGE_PROTOCOL_VERSION;

export type ChallengeWinnerSide = "challenger" | "challenged";

export type ChallengeProtocolErrorCode =
  | "CHALLENGE_STEAM_IDENTITY_REQUIRED"
  | "CHALLENGE_STEAM_IDENTITY_CONFLICT"
  | "CHALLENGE_STEAM_IDENTITY_DRIFT"
  | "CHALLENGE_REPLAY_IDENTITY_MISMATCH"
  | "CHALLENGE_RESULT_IDENTITY_UNRESOLVED";

export class ChallengeProtocolError extends Error {
  readonly code: ChallengeProtocolErrorCode;
  readonly status: number;

  constructor(code: ChallengeProtocolErrorCode, message: string, status = 409) {
    super(message);
    this.name = "ChallengeProtocolError";
    this.code = code;
    this.status = status;
  }
}

const STEAM_ID64_RE = /^\d{15,20}$/u;

export function normalizeChallengeSteamId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return STEAM_ID64_RE.test(normalized) ? normalized : null;
}

export function bindChallengeSteamIdentities(input: {
  challengerSteamId: unknown;
  challengedSteamId: unknown;
}) {
  const challengerSteamIdSnapshot = normalizeChallengeSteamId(input.challengerSteamId);
  const challengedSteamIdSnapshot = normalizeChallengeSteamId(input.challengedSteamId);

  if (!challengerSteamIdSnapshot || !challengedSteamIdSnapshot) {
    throw new ChallengeProtocolError(
      "CHALLENGE_STEAM_IDENTITY_REQUIRED",
      "Both players must link a valid Steam account before a WOLO challenge can be issued.",
      422,
    );
  }
  if (challengerSteamIdSnapshot === challengedSteamIdSnapshot) {
    throw new ChallengeProtocolError(
      "CHALLENGE_STEAM_IDENTITY_CONFLICT",
      "Challenge players must be bound to different Steam accounts.",
      409,
    );
  }

  return {
    protocolVersion: CHALLENGE_PROTOCOL_VERSION,
    challengerSteamIdSnapshot,
    challengedSteamIdSnapshot,
  } as const;
}

export type ChallengeReplayParticipant = {
  name: string;
  steamId?: string | null;
  winner?: boolean | null;
};

export function sessionMatchesBoundSteamDuel(input: {
  players: readonly ChallengeReplayParticipant[];
  challengerSteamIdSnapshot: string | null | undefined;
  challengedSteamIdSnapshot: string | null | undefined;
}) {
  const left = normalizeChallengeSteamId(input.challengerSteamIdSnapshot);
  const right = normalizeChallengeSteamId(input.challengedSteamIdSnapshot);
  if (!left || !right || left === right || input.players.length !== 2) return false;

  const steamIds = input.players.map((player) => normalizeChallengeSteamId(player.steamId));
  if (steamIds.some((steamId) => !steamId)) return false;
  return new Set(steamIds).size === 2 && steamIds.includes(left) && steamIds.includes(right);
}

function normalizeWinnerName(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")
    : "";
}

export function resolveBoundSteamWinnerId(input: {
  players: readonly ChallengeReplayParticipant[];
  winnerName?: string | null;
  challengerSteamIdSnapshot: string | null | undefined;
  challengedSteamIdSnapshot: string | null | undefined;
}) {
  if (!sessionMatchesBoundSteamDuel(input)) return null;

  const explicit = input.players.filter((player) => player.winner === true);
  if (explicit.length === 1) {
    return normalizeChallengeSteamId(explicit[0]?.steamId);
  }
  if (explicit.length > 1) return null;

  const winnerName = normalizeWinnerName(input.winnerName);
  if (!winnerName) return null;
  const matching = input.players.filter(
    (player) => normalizeWinnerName(player.name) === winnerName,
  );
  return matching.length === 1 ? normalizeChallengeSteamId(matching[0]?.steamId) : null;
}

export function challengeWinnerSideFromUserId(input: {
  winnerUserId: number | null | undefined;
  challengerUserId: number;
  challengedUserId: number;
}): ChallengeWinnerSide | null {
  if (input.winnerUserId === input.challengerUserId) return "challenger";
  if (input.winnerUserId === input.challengedUserId) return "challenged";
  return null;
}

export function challengeWinnerUserIdFromSide(input: {
  winnerSide: string | null | undefined;
  challengerUserId: number;
  challengedUserId: number;
}) {
  if (input.winnerSide === "challenger") return input.challengerUserId;
  if (input.winnerSide === "challenged") return input.challengedUserId;
  return null;
}

export function challengeWinnerSideFromSteam(input: {
  winnerSteamId: string | null | undefined;
  challengerSteamIdSnapshot: string | null | undefined;
  challengedSteamIdSnapshot: string | null | undefined;
}): ChallengeWinnerSide | null {
  const winnerSteamId = normalizeChallengeSteamId(input.winnerSteamId);
  if (!winnerSteamId) return null;
  if (winnerSteamId === normalizeChallengeSteamId(input.challengerSteamIdSnapshot)) {
    return "challenger";
  }
  if (winnerSteamId === normalizeChallengeSteamId(input.challengedSteamIdSnapshot)) {
    return "challenged";
  }
  return null;
}

export function challengeWinnerUserIdFromSteam(input: {
  winnerSteamId: string | null | undefined;
  challengerUserId: number;
  challengedUserId: number;
  challengerSteamIdSnapshot: string | null | undefined;
  challengedSteamIdSnapshot: string | null | undefined;
}) {
  return challengeWinnerUserIdFromSide({
    winnerSide: challengeWinnerSideFromSteam(input),
    challengerUserId: input.challengerUserId,
    challengedUserId: input.challengedUserId,
  });
}
