/**
 * WAR SATCHEL — OFFLINE ACCOUNTING RESEARCH CONTRACT ONLY.
 *
 * Input events MUST be independently authenticated by a future chain-finality,
 * owner-binding and ticket verifier. This module DOES NOT verify receipts,
 * authorize users, execute transfers or expose live funds. Never wire its
 * deposit event directly to client-submitted data or the current live executor.
 *
 * Amounts use canonical integer uwolo strings, not JavaScript money numbers.
 */
export const WAR_SATCHEL_CHAIN_ID = "wolo-1" as const;
export const WAR_SATCHEL_DENOM = "uwolo" as const;
export const WAR_SATCHEL_MAX_GAME_UWOLO = BigInt(1_000_000_000);

type EventRoot = { id: string; ownerUid: string };
type ChainReceipt = { receiptId: string; chainId: string; denom: string };
export type WarSatchelResearchEvent =
  | (EventRoot & ChainReceipt & { kind: "verified_deposit"; amountUwolo: string })
  | (EventRoot & { kind: "reserve"; reservationId: string; gameId: string; policyVersion: number; amountUwolo: string })
  | (EventRoot & { kind: "release"; reservationId: string; reason: "unmatched" | "void" | "market_closed" | "cancelled" })
  | (EventRoot & { kind: "commit"; reservationId: string; acceptedTicketId: string })
  | (EventRoot & ChainReceipt & { kind: "verified_refund"; acceptedTicketId: string; amountUwolo: string })
  | (EventRoot & { kind: "withdraw_hold"; withdrawalId: string; amountUwolo: string })
  | (EventRoot & ChainReceipt & { kind: "withdraw_confirmed"; withdrawalId: string })
  | (EventRoot & { kind: "withdraw_cancelled"; withdrawalId: string });

type Reservation = { amount: bigint; gameId: string; state: "reserved" | "released" | "committed" };
type Withdrawal = { amount: bigint; state: "pending" | "cancelled" | "confirmed" };
type Ticket = { amount: bigint; refunded: bigint };

function requireId(value: string, label: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:._/-]{1,160}$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function positiveUwolo(value: string): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,76}$/.test(value)) {
    throw new Error("An amount must be a positive canonical integer uwolo string");
  }
  return BigInt(value);
}

function chainProof(event: ChainReceipt, seen: Set<string>) {
  if (event.chainId !== WAR_SATCHEL_CHAIN_ID || event.denom !== WAR_SATCHEL_DENOM) {
    throw new Error("Wrong chain or token denomination");
  }
  const ref = requireId(event.receiptId, "chain receipt");
  const key = `${event.chainId}:${ref}`;
  if (seen.has(key)) throw new Error("Chain receipt has already been consumed");
  seen.add(key);
}

/**
 * A pure, deterministic conservation oracle for future independently VERIFIED
 * events. Inserting this projection into an API does not supply custody proof.
 */
export function projectWarSatchelResearch(ownerUid: string, events: readonly WarSatchelResearchEvent[]) {
  requireId(ownerUid, "owner");
  let available = BigInt(0);
  let reserved = BigInt(0);
  let withdrawing = BigInt(0);
  let committed = BigInt(0);
  let withdrawn = BigInt(0);
  let deposited = BigInt(0);
  const seenIds = new Map<string, string>();
  const receipts = new Set<string>();
  const reservations = new Map<string, Reservation>();
  const gameVersions = new Set<string>();
  const activeGames = new Set<string>();
  const committedGames = new Set<string>();
  const withdrawals = new Map<string, Withdrawal>();
  const tickets = new Map<string, Ticket>();

  for (const event of events) {
    if (event.ownerUid !== ownerUid) throw new Error("Cross-owner ledger event");
    requireId(event.id, "event ID");
    const serialization = JSON.stringify(event);
    const prior = seenIds.get(event.id);
    if (prior !== undefined) {
      if (prior !== serialization) throw new Error("Event ID collision with different payload");
      continue; // byte-identical event retry is idempotent
    }
    seenIds.set(event.id, serialization);

    switch (event.kind) {
      case "verified_deposit": {
        const amount = positiveUwolo(event.amountUwolo);
        chainProof(event, receipts); // proof has to be independently validated first
        available += amount;
        deposited += amount;
        break;
      }
      case "reserve": {
        const amount = positiveUwolo(event.amountUwolo);
        if (amount > WAR_SATCHEL_MAX_GAME_UWOLO) throw new Error("Per-game cap exceeded");
        const reservationId = requireId(event.reservationId, "reservation");
        const gameId = requireId(event.gameId, "canonical game");
        if (!Number.isSafeInteger(event.policyVersion) || event.policyVersion < 1) throw new Error("Invalid policy version");
        const gameVersion = JSON.stringify([gameId, event.policyVersion]);
        if (reservations.has(reservationId) || gameVersions.has(gameVersion) || activeGames.has(gameId) || committedGames.has(gameId)) {
          throw new Error("Duplicate reservation or canonical game commitment");
        }
        if (available < amount) throw new Error("Insufficient available satchel WOLO");
        available -= amount;
        reserved += amount;
        reservations.set(reservationId, { amount, gameId, state: "reserved" });
        gameVersions.add(gameVersion);
        activeGames.add(gameId);
        break;
      }
      case "release": {
        if (!["unmatched", "void", "market_closed", "cancelled"].includes(event.reason)) {
          throw new Error("Unknown release reason");
        }
        const reservation = reservations.get(requireId(event.reservationId, "reservation"));
        if (reservation?.state !== "reserved") throw new Error("Reservation is not available to release");
        reservation.state = "released";
        activeGames.delete(reservation.gameId);
        reserved -= reservation.amount;
        available += reservation.amount; // unmatched returns 100%, no 2% fee
        break;
      }
      case "commit": {
        const reservation = reservations.get(requireId(event.reservationId, "reservation"));
        if (reservation?.state !== "reserved") throw new Error("Reservation is not available to commit");
        const ticketId = requireId(event.acceptedTicketId, "accepted ticket");
        if (tickets.has(ticketId)) throw new Error("Duplicate accepted ticket");
        reservation.state = "committed";
        activeGames.delete(reservation.gameId);
        committedGames.add(reservation.gameId);
        reserved -= reservation.amount;
        committed += reservation.amount;
        tickets.set(ticketId, { amount: reservation.amount, refunded: BigInt(0) });
        break;
      }
      case "verified_refund": {
        const amount = positiveUwolo(event.amountUwolo);
        const ticket = tickets.get(requireId(event.acceptedTicketId, "accepted ticket"));
        if (!ticket || ticket.refunded + amount > ticket.amount) throw new Error("Refund exceeds committed ticket");
        chainProof(event, receipts); // settlement/refund verification is external
        ticket.refunded += amount;
        committed -= amount;
        available += amount;
        break;
      }
      case "withdraw_hold": {
        const amount = positiveUwolo(event.amountUwolo);
        const withdrawalId = requireId(event.withdrawalId, "withdrawal");
        if (withdrawals.has(withdrawalId)) throw new Error("Duplicate withdrawal request");
        if (available < amount) throw new Error("Insufficient available satchel WOLO");
        available -= amount;
        withdrawing += amount;
        withdrawals.set(withdrawalId, { amount, state: "pending" });
        break;
      }
      case "withdraw_confirmed": {
        const withdrawal = withdrawals.get(requireId(event.withdrawalId, "withdrawal"));
        if (withdrawal?.state !== "pending") throw new Error("Withdrawal is not pending");
        chainProof(event, receipts); // requires independently proven bank send
        withdrawal.state = "confirmed";
        withdrawing -= withdrawal.amount;
        withdrawn += withdrawal.amount;
        break;
      }
      case "withdraw_cancelled": {
        const withdrawal = withdrawals.get(requireId(event.withdrawalId, "withdrawal"));
        if (withdrawal?.state !== "pending") throw new Error("Withdrawal is not pending");
        withdrawal.state = "cancelled";
        withdrawing -= withdrawal.amount;
        available += withdrawal.amount;
        break;
      }
    }
    if (available < BigInt(0) || reserved < BigInt(0) || withdrawing < BigInt(0) || committed < BigInt(0) || withdrawn < BigInt(0)) {
      throw new Error("Negative satchel category");
    }
    if (available + reserved + withdrawing + committed + withdrawn !== deposited) {
      throw new Error("Satchel conservation invariant violated");
    }
  }
  return Object.freeze({
    ownerUid,
    availableUwolo: available.toString(),
    reservedUwolo: reserved.toString(),
    withdrawalPendingUwolo: withdrawing.toString(),
    committedUwolo: committed.toString(),
    withdrawnUwolo: withdrawn.toString(),
    lifetimeVerifiedDepositUwolo: deposited.toString(),
    uniqueEventCount: seenIds.size,
  });
}
