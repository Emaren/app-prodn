export type SpeedNavigationKind =
  | "initial"
  | "internal"
  | "reload"
  | "back_forward"
  | "prerender"
  | "unknown";

export type SpeedNavigationStartSource =
  | "document"
  | "link_click"
  | "popstate"
  | "programmatic"
  | "route_commit"
  | "unknown";

export type SpeedReadySource = "explicit" | "route_paint" | "initial_hydration" | "unknown";

export type SpeedTimingItem = {
  name: string;
  duration_ms: number | null;
  transfer_bytes: number | null;
  initiator_type: string;
};

export type SpeedLongTask = {
  start_ms: number;
  duration_ms: number;
};

export type SpeedDetails = {
  top_resources?: SpeedTimingItem[];
  top_api_requests?: SpeedTimingItem[];
  navigation_timing?: Record<string, number | null>;
  long_tasks?: SpeedLongTask[];
};

export type SpeedSample = {
  sample_id: string;
  occurred_at: string;
  route: string;
  traffic_visitor_id: string;
  traffic_session_id: string;
  journey_session_id: string;
  navigation_kind: SpeedNavigationKind;
  navigation_start_source: SpeedNavigationStartSource;
  ready_source: SpeedReadySource;
  ready_ms: number | null;
  ttfb_ms?: number | null;
  fcp_ms?: number | null;
  lcp_ms?: number | null;
  inp_ms?: number | null;
  cls?: number | null;
  dom_content_loaded_ms?: number | null;
  load_event_ms?: number | null;
  resource_count?: number | null;
  transfer_bytes?: number | null;
  api_request_count?: number | null;
  slowest_api_path?: string;
  slowest_api_ms?: number | null;
  long_task_count?: number | null;
  long_task_max_ms?: number | null;
  long_task_total_ms?: number | null;
  viewport_width?: number | null;
  viewport_height?: number | null;
  effective_connection_type?: string;
  connection_rtt_ms?: number | null;
  downlink_mbps?: number | null;
  save_data?: boolean | null;
  valid_for_aggregation: boolean;
  invalid_reason: string;
  visibility_tainted: boolean;
  details?: SpeedDetails;
};
