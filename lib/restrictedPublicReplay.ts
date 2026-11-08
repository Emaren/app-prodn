import type { Prisma } from "./generated/prisma";

/**
 * The R25 web database role has SELECT on game_stats, not on the private
 * adjudication, War Engine, tournament, payout or normalized-stat relations.
 *
 * This is deliberately scalar-only. Never extend it with a relation or
 * financial field to "repair" a permission-denied public page.
 */
export const RESTRICTED_PUBLIC_REPLAY_SELECT = {
  id: true,
  is_final: true,
  players: true,
  map: true,
  played_on: true,
  timestamp: true,
  createdAt: true,
  game_type: true,
  game_version: true,
  duration: true,
  game_duration: true,
  winner: true,
} as const satisfies Prisma.GameStatsSelect;
