export type KingdomAgentState = "working" | "healthy" | "watch" | "blocked" | "unknown";

export function inspectionAgentState(
  state: "green" | "amber" | "red",
  fraction: number,
): KingdomAgentState {
  if (state === "red") return "blocked";
  if (state === "amber" || !Number.isFinite(fraction) || fraction < 1) return "watch";
  return "healthy";
}

export function systemAgentState(state: string, activeProcess: boolean): KingdomAgentState {
  const value = state.toUpperCase();
  if (["FAILED", "FAIL", "BLOCKED", "UNSAFE"].includes(value)) return "blocked";
  if (activeProcess && ["ACTIVE", "RUNNING", "RUNNING_CAPTURE", "RUNNING_TRANSACTION", "CLAIMED", "RESUME_REQUESTED"].includes(value)) return "working";
  if (["PASS", "READY", "HEALTHY", "CERTIFIED", "COMPLETE", "VERIFIED"].includes(value)) return "healthy";
  if (["ATTENTION", "ATTENTION_REQUIRED", "WATCH", "MAINTENANCE_DUE", "WAITING", "ACTIVE", "RUNNING"].includes(value)) return "watch";
  return "unknown";
}
