export type ReplayDesyncIncidentView = {
  id: number;
  gameStatsId: number;
  scheduledMatchId: number | null;
  supersedesId: number | null;
  desyncOccurred: boolean;
  competitiveResultStatus: "unresolved" | "not_applicable";
  settlementDisposition:
    | "commissioner_review"
    | "rematch"
    | "void_refund"
    | "not_applicable";
  reviewerUid: string;
  reviewerDisplayName: string;
  note: string | null;
  sourceReplayHash: string;
  sourceParseIteration: number;
  parserDesyncCandidate: boolean;
  machineEvidence: {
    disconnectDetected: boolean;
    parseSource: string;
    parseReason: string;
    eventTypeSignals?: string[];
    keyEventFlags?: Record<string, string | number | boolean>;
  };
  createdAt: string;
};

export function currentConfirmedDesync(
  incidents: ReplayDesyncIncidentView[]
) {
  const latest = incidents[0] ?? null;
  return latest?.desyncOccurred ? latest : null;
}

export function desyncIncidentHeading(
  incident: ReplayDesyncIncidentView
) {
  return incident.desyncOccurred
    ? "Human · Desync Confirmed"
    : "Human · Desync Correction";
}
