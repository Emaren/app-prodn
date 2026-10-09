import type { WatchStreamPayload } from "./watchStreams";

export type TelevisionStagePlayer = {
  key: string;
  name: string;
  steamId: string | null;
  civilization: string | null;
};
export type TelevisionStageTeam = { key: string; label: string; players: TelevisionStagePlayer[] };
export type TelevisionStage = { confirmedTeams: boolean; format: string; teams: TelevisionStageTeam[] };

export type TelevisionCamera = {
  player: TelevisionStagePlayer;
  teamKey: string;
  stream: WatchStreamPayload | null;
  identity: "steam-account" | "unverified-external-label" | "offline";
};

/**
 * This is a PRESENTATION join, never a replay/team/winner adjudication.
 * First-party feeds use the server-linked stream owner's Steam ID. An
 * unauthenticated label cannot impersonate a Watcher POV.
 */
export function assignTelevisionCameras(stage: TelevisionStage, streams: WatchStreamPayload[]): {
  cameras: TelevisionCamera[];
  unassigned: WatchStreamPayload[];
} {
  const cameras = stage.teams.flatMap(team => team.players.map(player => ({
    teamKey: team.key, player, stream: null as WatchStreamPayload | null,
    identity: "offline" as TelevisionCamera["identity"],
  })));
  const used = new Set<number>();
  // A user can have a recently ended recorder and a restarted live recorder
  // attached to the same battle. Never let stale history occupy the live POV.
  const rank = (stream: WatchStreamPayload) =>
    stream.status === "live" && stream.chunkCount > 0 ? 5 :
    stream.status === "starting" && stream.chunkCount > 0 ? 4 :
    stream.status === "ended" && stream.chunkCount > 0 ? 3 :
    stream.status === "live" ? 2 :
    stream.status === "starting" ? 1 : 0;
  const eligible = streams.filter(stream => stream.status !== "removed")
    .sort((left, right) => rank(right) - rank(left) ||
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
      right.id - left.id);
  const normalized = (s: string | null | undefined) => (s || "").trim().toLowerCase();
  for (const camera of cameras) {
    const steam = normalized(camera.player.steamId);
    if (!steam) continue;
    const matched = eligible.find(stream =>
      !used.has(stream.id) &&
      stream.provider === "aoe2war" &&
      Boolean(stream.ownerSteamId) &&
      normalized(stream.ownerSteamId) === steam
    );
    if (matched) {
      camera.stream = matched;
      camera.identity = "steam-account";
      used.add(matched.id);
    }
  }
  // An admin-registered external feed can be displayed in a player position,
  // but the label is explicitly marked unverified and cannot prove identity.
  const nameCounts = new Map<string,number>();
  for (const camera of cameras) {
    const name = normalized(camera.player.name);
    nameCounts.set(name,(nameCounts.get(name)||0)+1);
  }
  for (const camera of cameras) {
    if (camera.stream) continue;
    const name = normalized(camera.player.name);
    if (!name || nameCounts.get(name) !== 1) continue;
    const matched = eligible.find(stream =>
      !used.has(stream.id) &&
      stream.provider !== "aoe2war" &&
      normalized(stream.playerLabel) === name
    );
    if (matched) {
      camera.stream = matched;
      camera.identity = "unverified-external-label";
      used.add(matched.id);
    }
  }
  return { cameras, unassigned: eligible.filter(stream => !used.has(stream.id)) };
}
