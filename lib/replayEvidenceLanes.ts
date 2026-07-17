export type ReplayEvidenceFieldCoverage = {
  fieldPath: string;
  observations: number;
  scoredObservations: number;
};

type LaneDefinition = {
  key: string;
  label: string;
  primaryField: string;
  supportingFields: string[];
  maturity: "validated" | "mixed" | "experimental" | "foundation";
  truthRule: string;
};

const LANE_DEFINITIONS: LaneDefinition[] = [
  {
    key: "age_research",
    label: "Age & research timing",
    primaryField: "actions.age_up_research_commands",
    supportingFields: [],
    maturity: "experimental",
    truthRule: "Commands are preserved; exact age-completion semantics are not public stats yet.",
  },
  {
    key: "commands_eapm",
    label: "Commands & eAPM",
    primaryField: "actions.identity_normalized_activity_by_player",
    supportingFields: ["player.recorded_eapm", "actions.unique_packet_identity_count"],
    maturity: "experimental",
    truthRule: "Activity is structured, but packet identity and eAPM semantics remain unscored.",
  },
  {
    key: "resign_chronology",
    label: "Resignation chronology",
    primaryField: "actions.resignation_timeline",
    supportingFields: ["actions.raw_resignation_timeline"],
    maturity: "mixed",
    truthRule: "Timelines are captured; only confidence-scored resign evidence may support results.",
  },
  {
    key: "tribute_trade",
    label: "Tribute & market commands",
    primaryField: "actions.tribute_commands",
    supportingFields: ["actions.market_commands"],
    maturity: "validated",
    truthRule: "Command counts are verified extraction facts, not resource-value totals.",
  },
  {
    key: "map_intelligence",
    label: "Map intelligence",
    primaryField: "map.terrain_histogram",
    supportingFields: ["map.elevation_histogram", "map.tile_sha256"],
    maturity: "validated",
    truthRule: "Terrain and elevation structure is cataloged without inventing map-control outcomes.",
  },
  {
    key: "production_builds",
    label: "Production & build orders",
    primaryField: "actions.type_counts",
    supportingFields: ["actions.raw_count"],
    maturity: "foundation",
    truthRule: "Command families exist; ordered production and build-order semantics are the next pass.",
  },
];

export function buildReplayEvidenceLanes(
  fields: ReplayEvidenceFieldCoverage[]
) {
  const byPath = new Map(fields.map((field) => [field.fieldPath, field]));
  return LANE_DEFINITIONS.map((lane) => {
    const primary = byPath.get(lane.primaryField);
    const supporting = lane.supportingFields
      .map((fieldPath) => byPath.get(fieldPath))
      .filter((field): field is ReplayEvidenceFieldCoverage => Boolean(field));
    return {
      ...lane,
      observations: primary?.observations ?? 0,
      scoredObservations: primary?.scoredObservations ?? 0,
      supportingFieldsPresent: supporting.length,
      supportingFieldsTotal: lane.supportingFields.length,
    };
  });
}

