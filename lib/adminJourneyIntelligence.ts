import type { PrismaClient } from "@/lib/generated/prisma";
import type { UserActivityEntry } from "@/lib/userExperience";

export type AdminJourneyTrailItem = {
  id: number;
  type: string;
  label: string;
  path: string | null;
  createdAt: string;
};

export type AdminJourneySummary = {
  sessionId: string | null;
  lastSeenAt: string | null;
  currentPath: string | null;
  previousPath: string | null;
  entryPath: string | null;
  pathSequence: string[];
  recentActionTrail: AdminJourneyTrailItem[];
  lastMeaningfulAction: AdminJourneyTrailItem | null;
  source: string;
  referrer: string | null;
  campaign: string | null;
  engagementLabel: "Hot" | "Active" | "Browsing" | "Dormant" | "Unknown";
  confidenceLabel: "High" | "Good" | "Limited" | "Low";
  suspiciousSignal: string | null;
  qualityNotes: string[];
  intentSummary: string;
  eventCount: number;
  pageCount: number;
  clickCount: number;
  activeSeconds: number;
};

const JOURNEY_SESSION_GAP_MS = 30 * 60 * 1000;
const ACTIVE_GAP_CAP_SECONDS = 10 * 60;
const IMPORTANT_ROUTE_RE =
  /^\/($|admin\/user-list|bets|challenge|contact-emaren|lobby|live-games|players|profile|requests|staking|war-chest|watch|wolo|wolomania)/;
const ASSET_OR_INTERNAL_PATH_RE =
  /(^\/api\/|^\/_next\/|\.(?:avif|css|gif|ico|jpeg|jpg|js|map|png|svg|webp|woff2?)$)/i;
const NOISE_ACTIVITY_TYPES = new Set([
  "heartbeat",
  "online_ping",
  "page_ping",
  "ping",
  "session_ping",
]);

function metadataRecord(value: Record<string, unknown> | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadataRecord(metadata)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function routePathFor(event: UserActivityEntry) {
  return event.path || metadataString(event.metadata, "currentPath");
}

function sessionIdFor(event: UserActivityEntry) {
  return (
    metadataString(event.metadata, "journeySessionId") ||
    metadataString(event.metadata, "sessionId")
  );
}

function compressConsecutive(values: string[]) {
  const output: string[] = [];
  for (const value of values) {
    if (!value || output.at(-1) === value) continue;
    output.push(value);
  }
  return output;
}

function actionLabelFor(event: UserActivityEntry) {
  if (event.label) return event.label;
  if (event.type === "page_view" && event.path) return `Viewed ${event.path}`;
  if (event.type === "click") {
    const target = metadataString(event.metadata, "targetLabel");
    const href = metadataString(event.metadata, "href");
    return target || href || "Clicked";
  }
  return event.type.replace(/_/g, " ");
}

function isNoiseEvent(event: UserActivityEntry) {
  const type = event.type.trim().toLowerCase();
  const path = routePathFor(event) || "";
  return NOISE_ACTIVITY_TYPES.has(type) || ASSET_OR_INTERNAL_PATH_RE.test(path);
}

function isMeaningfulClick(event: UserActivityEntry) {
  if (event.type !== "click" || isNoiseEvent(event)) return false;
  const label = actionLabelFor(event).toLowerCase();
  return !/^(button|a|link|clicked)$/.test(label);
}

function isImportantPageView(event: UserActivityEntry) {
  if (event.type !== "page_view" || isNoiseEvent(event)) return false;
  const path = routePathFor(event);
  return Boolean(path && IMPORTANT_ROUTE_RE.test(path));
}

function isNonPingUserAction(event: UserActivityEntry) {
  if (event.type === "page_view" || event.type === "click" || isNoiseEvent(event)) return false;
  return true;
}

function isSafeTrailEvent(event: UserActivityEntry) {
  if (isNoiseEvent(event)) return false;
  return event.type === "click" || event.type === "page_view" || isNonPingUserAction(event);
}

function toTrailItem(event: UserActivityEntry): AdminJourneyTrailItem {
  return {
    id: event.id,
    type: event.type,
    label: actionLabelFor(event),
    path: routePathFor(event),
    createdAt: event.createdAt,
  };
}

function selectCurrentSession(events: UserActivityEntry[]) {
  const newest = events[0];
  if (!newest) return [];

  const newestSessionId = sessionIdFor(newest);
  if (newestSessionId) {
    const matched = events.filter((event) => sessionIdFor(event) === newestSessionId);
    if (matched.length > 0) return matched;
  }

  const sessionEvents = [newest];
  let previousTime = new Date(newest.createdAt).getTime();

  for (const event of events.slice(1)) {
    const eventTime = new Date(event.createdAt).getTime();
    if (!Number.isFinite(eventTime) || previousTime - eventTime > JOURNEY_SESSION_GAP_MS) {
      break;
    }
    sessionEvents.push(event);
    previousTime = eventTime;
  }

  return sessionEvents;
}

function sourceFor(events: UserActivityEntry[]) {
  const metadataSources = events.map((event) => metadataRecord(event.metadata));
  const utmSource = metadataSources
    .map((metadata) => metadata.utmSource)
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const utmMedium = metadataSources
    .map((metadata) => metadata.utmMedium)
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const campaign = metadataSources
    .map((metadata) => metadata.utmCampaign)
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const referrerHost = metadataSources
    .map((metadata) => metadata.referrerHost)
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const referrerPath = metadataSources
    .map((metadata) => metadata.referrerPath)
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));

  if (utmSource) {
    return {
      source: utmMedium ? `${utmSource} / ${utmMedium}` : utmSource,
      referrer: referrerHost ?? null,
      campaign: campaign ?? null,
    };
  }

  if (!referrerHost) {
    return { source: "direct", referrer: null, campaign: campaign ?? null };
  }

  const source = /(^|\.)aoe2war\.com$/i.test(referrerHost) ? "internal" : referrerHost;
  return {
    source,
    referrer: referrerPath ? `${referrerHost}${referrerPath}` : referrerHost,
    campaign: campaign ?? null,
  };
}

function scoreJourney(input: {
  lastSeenAt: string | null;
  pageCount: number;
  clickCount: number;
  eventCount: number;
  activeSeconds: number;
  source: string;
  suspiciousSignal: string | null;
}) {
  if (!input.lastSeenAt) {
    return { engagementLabel: "Unknown" as const, confidenceLabel: "Low" as const };
  }

  const lastSeenTime = new Date(input.lastSeenAt).getTime();
  const ageMinutes = Number.isFinite(lastSeenTime)
    ? (Date.now() - lastSeenTime) / 60_000
    : Number.POSITIVE_INFINITY;
  let score = 0;

  if (ageMinutes <= 5) score += 34;
  else if (ageMinutes <= 30) score += 26;
  else if (ageMinutes <= 120) score += 15;
  else if (ageMinutes <= 24 * 60) score += 6;

  score += Math.min(input.pageCount * 10, 26);
  score += Math.min(input.clickCount * 8, 24);
  score += Math.min(Math.floor(input.activeSeconds / 30), 18);
  score += Math.min(input.eventCount * 2, 12);

  if (input.source !== "direct" && input.source !== "internal") score += 6;
  if (input.suspiciousSignal) score -= 18;

  const confidenceLabel: AdminJourneySummary["confidenceLabel"] =
    score >= 75 ? "High" : score >= 55 ? "Good" : score >= 30 ? "Limited" : "Low";
  const engagementLabel: AdminJourneySummary["engagementLabel"] =
    ageMinutes <= 30 && score >= 65
      ? "Hot"
      : ageMinutes <= 90 && score >= 45
        ? "Active"
        : ageMinutes <= 24 * 60 && score >= 18
          ? "Browsing"
          : "Dormant";

  return { engagementLabel, confidenceLabel };
}

function computeActiveSeconds(events: UserActivityEntry[]) {
  const ordered = [...events].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
  let total = 0;

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = new Date(ordered[index - 1].createdAt).getTime();
    const current = new Date(ordered[index].createdAt).getTime();
    const gapSeconds = Math.max(0, Math.floor((current - previous) / 1000));
    if (gapSeconds > 0) total += Math.min(gapSeconds, ACTIVE_GAP_CAP_SECONDS);
  }

  return total;
}

function suspiciousSignalFor(input: {
  source: string;
  pageCount: number;
  clickCount: number;
  eventCount: number;
  activeSeconds: number;
  pathSequence: string[];
}) {
  const burstyClicks = input.clickCount >= 8 && input.activeSeconds <= 60;
  if (burstyClicks) return "Fast click burst";

  const probePath = input.pathSequence.find((path) =>
    /wp-admin|phpmyadmin|\.env|\/admin\/config|\/xmlrpc/i.test(path)
  );
  if (probePath) return "Probe-like path";

  if (
    input.source === "direct" &&
    input.pageCount <= 1 &&
    input.clickCount === 0 &&
    input.activeSeconds <= 20
  ) {
    return "Thin direct trail";
  }

  if (input.eventCount <= 1) return "Low-signal trail";
  return null;
}

function selectLastMeaningfulEvent(sorted: UserActivityEntry[]) {
  return (
    sorted.find(isMeaningfulClick) ||
    sorted.find(isImportantPageView) ||
    sorted.find(isNonPingUserAction) ||
    sorted.find((event) => !isNoiseEvent(event)) ||
    sorted[0] ||
    null
  );
}

function qualityNotesFor(input: {
  sessionId: string | null;
  pathSequence: string[];
  source: string;
  suspiciousSignal: string | null;
  engagementLabel: AdminJourneySummary["engagementLabel"];
  confidenceLabel: AdminJourneySummary["confidenceLabel"];
  pageCount: number;
  clickCount: number;
  eventCount: number;
  activeSeconds: number;
}) {
  const notes: string[] = [];

  if (input.suspiciousSignal) notes.push(input.suspiciousSignal);
  if (!input.sessionId) notes.push("Grouped by recent activity gap");
  if (input.confidenceLabel === "Low") notes.push("Low confidence: limited signal");
  else if (input.confidenceLabel === "Limited") notes.push("Limited confidence");
  if (input.pathSequence.length <= 1) notes.push("Single-route journey");
  if (input.source === "direct") notes.push("Direct or unknown source");
  if (input.clickCount === 0 && input.pageCount > 0) notes.push("No safe clicks captured");
  if (input.activeSeconds <= 20 && input.eventCount <= 2) notes.push("Short active window");
  if (input.engagementLabel === "Hot") notes.push("Recent high-signal session");

  return Array.from(new Set(notes)).slice(0, 5);
}

function buildIntentSummary(input: {
  currentPath: string | null;
  previousPath: string | null;
  lastMeaningfulAction: AdminJourneyTrailItem | null;
  pageCount: number;
  clickCount: number;
  source: string;
}) {
  if (!input.currentPath) return "No readable journey yet.";

  const movement =
    input.previousPath && input.previousPath !== input.currentPath
      ? `${input.previousPath} to ${input.currentPath}`
      : input.currentPath;
  const action =
    input.lastMeaningfulAction && input.lastMeaningfulAction.type !== "page_view"
      ? ` Last action: ${input.lastMeaningfulAction.label}.`
      : "";
  const depth =
    input.pageCount > 1 || input.clickCount > 0
      ? `${input.pageCount} page steps and ${input.clickCount} clicks`
      : "single-page trail";

  return `${depth} from ${input.source}; now around ${movement}.${action}`;
}

export function buildJourneySummary(
  events: UserActivityEntry[]
): AdminJourneySummary | null {
  if (events.length === 0) return null;

  const sorted = [...events].sort((left, right) => {
    const rightTime = new Date(right.createdAt).getTime();
    const leftTime = new Date(left.createdAt).getTime();
    if (leftTime !== rightTime) return rightTime - leftTime;
    return right.id - left.id;
  });
  const sessionEvents = selectCurrentSession(sorted);
  const chronological = [...sessionEvents].reverse();
  const pageSequence = compressConsecutive(
    chronological
      .filter((event) => event.type === "page_view")
      .map(routePathFor)
      .filter((value): value is string => Boolean(value))
  );
  const fallbackSequence = compressConsecutive(
    chronological
      .map(routePathFor)
      .filter((value): value is string => Boolean(value))
  );
  const pathSequence = (pageSequence.length > 0 ? pageSequence : fallbackSequence).slice(-8);
  const currentPath = pathSequence.at(-1) ?? routePathFor(sorted[0]) ?? null;
  const previousPath =
    pathSequence.length >= 2
      ? pathSequence[pathSequence.length - 2]
      : metadataString(sorted[0].metadata, "previousPath");
  const entryPath = pathSequence[0] ?? null;
  const activeSeconds = computeActiveSeconds(sessionEvents);
  const clickCount = sessionEvents.filter((event) => event.type === "click").length;
  const pageCount = pageSequence.length;
  const source = sourceFor(chronological);
  const suspiciousSignal = suspiciousSignalFor({
    source: source.source,
    pageCount,
    clickCount,
    eventCount: sessionEvents.length,
    activeSeconds,
    pathSequence,
  });
  const scoring = scoreJourney({
    lastSeenAt: sorted[0]?.createdAt ?? null,
    pageCount,
    clickCount,
    eventCount: sessionEvents.length,
    activeSeconds,
    source: source.source,
    suspiciousSignal,
  });
  const lastMeaningfulEvent = selectLastMeaningfulEvent(sorted);
  const lastMeaningfulAction = lastMeaningfulEvent ? toTrailItem(lastMeaningfulEvent) : null;
  const sessionId = sessionIdFor(sorted[0]) ?? null;
  const qualityNotes = qualityNotesFor({
    sessionId,
    pathSequence,
    source: source.source,
    suspiciousSignal,
    engagementLabel: scoring.engagementLabel,
    confidenceLabel: scoring.confidenceLabel,
    pageCount,
    clickCount,
    eventCount: sessionEvents.length,
    activeSeconds,
  });

  return {
    sessionId,
    lastSeenAt: sorted[0]?.createdAt ?? null,
    currentPath,
    previousPath,
    entryPath,
    pathSequence,
    recentActionTrail: sorted.filter(isSafeTrailEvent).slice(0, 8).map(toTrailItem),
    lastMeaningfulAction,
    source: source.source,
    referrer: source.referrer,
    campaign: source.campaign,
    engagementLabel: scoring.engagementLabel,
    confidenceLabel: scoring.confidenceLabel,
    suspiciousSignal,
    qualityNotes,
    intentSummary: buildIntentSummary({
      currentPath,
      previousPath,
      lastMeaningfulAction,
      pageCount,
      clickCount,
      source: source.source,
    }),
    eventCount: sessionEvents.length,
    pageCount,
    clickCount,
    activeSeconds,
  };
}

export async function loadJourneySummaryMap(
  prisma: PrismaClient,
  userIds: number[],
  limitPerUser = 40
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter((value) => Number.isInteger(value))));
  const summaryMap = new Map<number, AdminJourneySummary>();

  if (uniqueUserIds.length === 0) return summaryMap;

  const rows = await prisma.userActivityEvent.findMany({
    where: {
      userId: { in: uniqueUserIds },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: uniqueUserIds.length * limitPerUser,
    select: {
      id: true,
      userId: true,
      type: true,
      path: true,
      label: true,
      metadata: true,
      createdAt: true,
    },
  });

  const byUserId = new Map<number, UserActivityEntry[]>();
  for (const userId of uniqueUserIds) {
    byUserId.set(userId, []);
  }

  for (const row of rows) {
    const bucket = byUserId.get(row.userId);
    if (!bucket || bucket.length >= limitPerUser) continue;
    bucket.push({
      id: row.id,
      type: row.type,
      path: row.path,
      label: row.label,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null,
      createdAt: row.createdAt.toISOString(),
    });
  }

  for (const [userId, events] of byUserId.entries()) {
    const summary = buildJourneySummary(events);
    if (summary) summaryMap.set(userId, summary);
  }

  return summaryMap;
}
