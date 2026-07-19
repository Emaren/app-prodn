const TRAFFIC_VISITOR_KEY = "traffic_visitor_id";
const TRAFFIC_SESSION_KEY = "traffic_session_id";
const JOURNEY_SESSION_KEY = "aoe2hdbets:journey-session-id";

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function getOrCreate(store: Storage, key: string, prefix: string) {
  try {
    const existing = store.getItem(key);
    if (existing) return existing;
    const generated = createId(prefix);
    store.setItem(key, generated);
    return generated;
  } catch {
    return createId(prefix);
  }
}

export function getTrafficCorrelationIds() {
  return {
    trafficVisitorId: getOrCreate(window.localStorage, TRAFFIC_VISITOR_KEY, "v"),
    trafficSessionId: getOrCreate(window.sessionStorage, TRAFFIC_SESSION_KEY, "s"),
    journeySessionId: getOrCreate(window.sessionStorage, JOURNEY_SESSION_KEY, "journey"),
  };
}

export const SPEED_CORRELATION_STORAGE_KEYS = {
  trafficVisitor: TRAFFIC_VISITOR_KEY,
  trafficSession: TRAFFIC_SESSION_KEY,
  journeySession: JOURNEY_SESSION_KEY,
} as const;
