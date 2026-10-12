/**
 * Operator-identified screenshot cohort (Oct 12, 2026), not an
 * independently proved attacker attribution. Never infer this from rank.
 * These are public wolo-1 addresses whose exact checksums were validated.
 * Keep aggregate faucet-claim counts inside internal security reports.
 */
export const WOLO_OPERATOR_REPORTED_FAUCET_COHORT = [
  "wolo13rqrfu32utrzhmn4nhyy5un2ymgu28m90xzx60",
  "wolo19ytgwhsx2654m4cufxgs0sgguj4qzaqqnyzh75",
  "wolo1l03tagtc6ufp2hpumw3kyjpgckqtdt85l77stj",
  "wolo1l9qmhaydjr4h9y4f79plxg9xvdtxjnal80lxlz",
  "wolo1nmtnuzt2payhtqt7xhsrktkduc5hrgdgel83fn",
  "wolo1nupy8m44aq6wvw3geffc3dnx5q5ezl5uqkjhrh",
  "wolo1psp9lzvq6d0f56zmg66dd65kgy7024awmuxfz5",
  "wolo1rf2gxwhtnxhnd7w9kywjkcrlwhcrvt6mnd8v4x",
] as const;

const COHORT = new Set<string>(WOLO_OPERATOR_REPORTED_FAUCET_COHORT);

export function isOperatorReportedFaucetCohortAddress(address: string) {
  return COHORT.has(address.toLowerCase());
}

export const WOLO_FAUCET_COHORT_PUBLIC_LABEL = "August 2026 faucet hack";
export const WOLO_FAUCET_COHORT_QUALIFIER = "Operator-reported · forensic match pending";
