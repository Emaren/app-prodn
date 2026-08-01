export function buildBetStakeMemo(
  marketId: number
) {
  return `AoE2HDBets bet stake · market ${marketId}`;
}

export const BET_STAKE_TICKET_VERSION = 1;

export function buildBetStakeTicketMemo(
  ticketId: number,
  version = BET_STAKE_TICKET_VERSION
) {
  if (
    !Number.isSafeInteger(ticketId) ||
    ticketId <= 0
  ) {
    throw new Error(
      "Bet stake ticket id must be a positive integer."
    );
  }

  if (
    version !==
    BET_STAKE_TICKET_VERSION
  ) {
    throw new Error(
      `Unsupported bet stake ticket version ${version}.`
    );
  }

  return `AoE2HDBets bet ticket v${version} · ticket ${ticketId}`;
}
