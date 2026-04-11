export const DEFAULT_TIME_DISPLAY_MODE = "utc" as const;
export const TIME_DISPLAY_STORAGE_KEY = "aoe2hdbets:time-display-mode";
export const TIME_ZONE_STORAGE_KEY = "aoe2hdbets:browser-time-zone";

export const TIME_DISPLAY_MODES = [
  { id: "utc", label: "UTC" },
  { id: "local", label: "Local" },
] as const;

export type TimeDisplayMode = (typeof TIME_DISPLAY_MODES)[number]["id"];

export type TimeDisplayPreference = {
  timeDisplayMode?: TimeDisplayMode | null;
  timezoneOverride?: string | null;
};

type DateLike = string | Date | null | undefined;

type FormatDateTimeOptions = {
  includeZone?: boolean;
  includeSeconds?: boolean;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseDate(value: DateLike) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isTimeDisplayMode(value: string | null | undefined): value is TimeDisplayMode {
  return TIME_DISPLAY_MODES.some((option) => option.id === value);
}

export function isValidIanaTimeZone(value: string | null | undefined) {
  if (!value || !value.trim()) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezoneOverride(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return isValidIanaTimeZone(trimmed) ? trimmed : null;
}

export function normalizeTimeDisplayPreference(input: TimeDisplayPreference) {
  return {
    timeDisplayMode: isTimeDisplayMode(input.timeDisplayMode)
      ? input.timeDisplayMode
      : DEFAULT_TIME_DISPLAY_MODE,
    timezoneOverride: normalizeTimezoneOverride(input.timezoneOverride),
  } satisfies {
    timeDisplayMode: TimeDisplayMode;
    timezoneOverride: string | null;
  };
}

export function detectBrowserTimeZone() {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") {
    return null;
  }

  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidIanaTimeZone(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export function readStoredTimeDisplayMode() {
  if (typeof window === "undefined") {
    return DEFAULT_TIME_DISPLAY_MODE;
  }

  const value = window.localStorage.getItem(TIME_DISPLAY_STORAGE_KEY);
  return isTimeDisplayMode(value) ? value : DEFAULT_TIME_DISPLAY_MODE;
}

export function writeStoredTimeDisplayMode(value: TimeDisplayMode) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TIME_DISPLAY_STORAGE_KEY, value);
}

export function readStoredBrowserTimeZone() {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeTimezoneOverride(window.localStorage.getItem(TIME_ZONE_STORAGE_KEY));
}

export function writeStoredBrowserTimeZone(value: string | null | undefined) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeTimezoneOverride(value);
  if (!normalized) {
    window.localStorage.removeItem(TIME_ZONE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(TIME_ZONE_STORAGE_KEY, normalized);
}

export function resolveTimeZone(
  preference?: TimeDisplayPreference,
  browserTimeZone?: string | null
) {
  const normalized = normalizeTimeDisplayPreference(preference ?? {});
  if (normalized.timeDisplayMode === "utc") {
    return "UTC";
  }

  return (
    normalized.timezoneOverride ||
    normalizeTimezoneOverride(browserTimeZone) ||
    detectBrowserTimeZone() ||
    "UTC"
  );
}

export function buildUtcDateTimeInputValue(value: DateLike) {
  const parsed = parseDate(value);
  if (!parsed) {
    return "";
  }

  return [
    parsed.getUTCFullYear(),
    pad2(parsed.getUTCMonth() + 1),
    pad2(parsed.getUTCDate()),
  ].join("-") + `T${pad2(parsed.getUTCHours())}:${pad2(parsed.getUTCMinutes())}`;
}

export function parseUtcDateTimeInputValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.length === 16 ? `${trimmed}:00Z` : `${trimmed}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildFormatter(timeZone: string, options?: FormatDateTimeOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: options?.includeSeconds ? "2-digit" : undefined,
    hour12: false,
    hourCycle: "h23",
  });
}

function formatZoneLabel(timeZone: string) {
  if (timeZone === "UTC") {
    return "UTC";
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
      hour: "2-digit",
    }).formatToParts(new Date());

    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function formatDateTime(
  value: DateLike,
  preference?: TimeDisplayPreference,
  options?: FormatDateTimeOptions & { browserTimeZone?: string | null }
) {
  const parsed = parseDate(value);
  if (!parsed) {
    return "—";
  }

  const timeZone = resolveTimeZone(preference, options?.browserTimeZone);
  const formatted = buildFormatter(timeZone, options).format(parsed);

  if (options?.includeZone === false) {
    return formatted;
  }

  return `${formatted} ${formatZoneLabel(timeZone)}`;
}

export function formatUtcDateTime(value: DateLike, options?: FormatDateTimeOptions) {
  return formatDateTime(
    value,
    { timeDisplayMode: "utc", timezoneOverride: null },
    { ...options, includeZone: options?.includeZone ?? true }
  );
}

export function formatChallengePrimaryTime(
  value: DateLike,
  preference?: TimeDisplayPreference,
  browserTimeZone?: string | null
) {
  return formatDateTime(value, preference, {
    browserTimeZone,
    includeZone: true,
  });
}

export function formatChallengeSecondaryUtc(value: DateLike) {
  return formatUtcDateTime(value, { includeZone: true });
}

export function formatCountdown(target: DateLike, nowValue: DateLike = new Date()) {
  const targetDate = parseDate(target);
  const nowDate = parseDate(nowValue);

  if (!targetDate || !nowDate) {
    return "—";
  }

  const diffMs = targetDate.getTime() - nowDate.getTime();
  const absSeconds = Math.max(0, Math.floor(Math.abs(diffMs) / 1000));
  const days = Math.floor(absSeconds / 86400);
  const hours = Math.floor((absSeconds % 86400) / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = absSeconds % 60;

  let core = "";
  if (days > 0) {
    core = `${days}d ${hours}h`;
  } else if (hours > 0) {
    core = `${hours}h ${minutes}m`;
  } else {
    core = `${minutes}:${pad2(seconds)}`;
  }

  if (diffMs > 0) {
    return `in ${core}`;
  }

  if (diffMs < 0) {
    return `${core} ago`;
  }

  return "now";
}

export function formatChallengeTimeWithCountdown(
  value: DateLike,
  preference?: TimeDisplayPreference,
  browserTimeZone?: string | null,
  nowValue: DateLike = new Date()
) {
  const primary = formatChallengePrimaryTime(value, preference, browserTimeZone);
  const countdown = formatCountdown(value, nowValue);
  return `${primary} · ${countdown}`;
}

export function describeTimePreference(
  preference?: TimeDisplayPreference,
  browserTimeZone?: string | null
) {
  const normalized = normalizeTimeDisplayPreference(preference ?? {});
  if (normalized.timeDisplayMode === "utc") {
    return "All scheduled match times are shown in UTC.";
  }

  const resolved = resolveTimeZone(normalized, browserTimeZone);
  return `All scheduled match times are shown in local time (${resolved}).`;
}
