export type StakerBetLedgerOutcome =
  | "won"
  | "lost"
  | "refunded"
  | "refund_queued"
  | "stake_recovery"
  | "pending";

export function resolveStakerBetLedgerOutcome(input: {
  kind: "wager" | "intent";
  status: string | null | undefined;
  payoutTxHash?: string | null;
}): StakerBetLedgerOutcome {
  const status = String(input.status || "").trim().toLowerCase();

  if (input.kind === "intent") {
    return status === "recorded" ? "pending" : "stake_recovery";
  }

  if (status === "won") return "won";
  if (status === "lost") return "lost";

  if (status === "void" || status === "refunded") {
    return input.payoutTxHash?.trim() ? "refunded" : "refund_queued";
  }

  return "pending";
}
