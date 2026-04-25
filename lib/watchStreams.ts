export type WatchStreamProvider = "twitch" | "youtube" | "steam" | "discord" | "custom";

export type WatchStreamRole =
  | "caster"
  | "observer"
  | "player_pov"
  | "team_pov"
  | "postgame"
  | "external";

export type WatchStreamPayload = {
  id: number;
  sessionKey: string;
  provider: WatchStreamProvider;
  role: WatchStreamRole;
  label: string;
  url: string;
  embedId: string | null;
  playerLabel: string | null;
  isPrimary: boolean;
  status: string;
  canEmbed: boolean;
  externalOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

const ROLE_LABELS: Record<WatchStreamRole, string> = {
  caster: "Main Cast",
  observer: "Observer",
  player_pov: "Player POV",
  team_pov: "Team POV",
  postgame: "Postgame Replay",
  external: "Watch Feed",
};

const VALID_ROLES = new Set<WatchStreamRole>([
  "caster",
  "observer",
  "player_pov",
  "team_pov",
  "postgame",
  "external",
]);

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeUrl(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) {
    throw new Error("Stream URL is required.");
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withProtocol);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Stream URL must be http or https.");
  }

  return parsed;
}

function firstPathSegment(url: URL) {
  return url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)[0] || "";
}

function youtubeVideoId(url: URL) {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    return firstPathSegment(url) || null;
  }

  if (!host.endsWith("youtube.com") && !host.endsWith("youtube-nocookie.com")) {
    return null;
  }

  const watchId = url.searchParams.get("v");
  if (watchId) {
    return watchId.trim();
  }

  const parts = url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (["embed", "live", "shorts"].includes(parts[0]) && parts[1]) {
    return parts[1];
  }

  return null;
}

function twitchChannel(url: URL) {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "twitch.tv") {
    return null;
  }

  const segment = firstPathSegment(url);
  if (!segment || ["directory", "videos", "p", "settings", "downloads"].includes(segment.toLowerCase())) {
    return null;
  }

  return segment;
}

function providerForUrl(url: URL): WatchStreamProvider {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "twitch.tv") return "twitch";
  if (host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    return "youtube";
  }
  if (host.includes("steam")) return "steam";
  if (host === "discord.gg" || host.endsWith("discord.com")) return "discord";

  return "custom";
}

export function normalizeWatchStreamInput(input: {
  sessionKey?: unknown;
  url?: unknown;
  role?: unknown;
  label?: unknown;
  playerLabel?: unknown;
  isPrimary?: unknown;
}) {
  const sessionKey = cleanText(input.sessionKey, 255);
  if (!sessionKey) {
    throw new Error("Session key is required.");
  }

  const url = normalizeUrl(input.url);
  const provider = providerForUrl(url);
  const roleInput = cleanText(input.role, 24) as WatchStreamRole;
  const role: WatchStreamRole = VALID_ROLES.has(roleInput) ? roleInput : "caster";

  const embedId =
    provider === "twitch"
      ? twitchChannel(url)
      : provider === "youtube"
        ? youtubeVideoId(url)
        : null;

  const label = cleanText(input.label, 80) || ROLE_LABELS[role];
  const playerLabel = cleanText(input.playerLabel, 80) || null;
  const canEmbed = (provider === "twitch" || provider === "youtube") && Boolean(embedId);

  return {
    sessionKey,
    provider,
    role,
    label,
    url: url.toString(),
    embedId,
    playerLabel,
    isPrimary: Boolean(input.isPrimary),
    canEmbed,
    externalOnly: !canEmbed,
  };
}

export function watchStreamCanEmbed(provider: string, embedId: string | null) {
  return (provider === "twitch" || provider === "youtube") && Boolean(embedId);
}

export function toWatchStreamPayload(row: {
  id: number;
  sessionKey: string;
  provider: string;
  role: string;
  label: string;
  url: string;
  embedId: string | null;
  playerLabel: string | null;
  isPrimary: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): WatchStreamPayload {
  const canEmbed = watchStreamCanEmbed(row.provider, row.embedId);

  return {
    id: row.id,
    sessionKey: row.sessionKey,
    provider: row.provider as WatchStreamProvider,
    role: row.role as WatchStreamRole,
    label: row.label,
    url: row.url,
    embedId: row.embedId,
    playerLabel: row.playerLabel,
    isPrimary: row.isPrimary,
    status: row.status,
    canEmbed,
    externalOnly: !canEmbed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
