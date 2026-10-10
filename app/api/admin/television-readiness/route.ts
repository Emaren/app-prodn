import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { loadPublicLiveGamesSnapshot } from "@/lib/liveGamesPublicSnapshot";
import {
  assignTelevisionCameras, televisionCameraStatus,
  type TelevisionStage,
} from "@/lib/televisionDirection";
import type { WatchStreamPayload } from "@/lib/watchStreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = {"Cache-Control":"no-store, max-age=0"};
const MAX_BATTLES = 12;

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  // Existing canonical live-battle grouping already resolves strong replay
  // aliases. Never link two recordings by guesses about player names or time.
  const snapshot = await loadPublicLiveGamesSnapshot(gate.prisma);
  const battles = snapshot.activeSessions.slice(0, MAX_BATTLES).map(session => {
    const teams = session.teamResolution;
    const resolved = teams.status === "resolved" && teams.teams.length === 2;
    const stage: TelevisionStage = resolved ? {
      confirmedTeams: true,
      format: teams.format,
      teams: teams.teams.map((team, i) => ({
        key: team.teamKey, label: "TEAM " + (i + 1),
        players: team.players.map(player => ({
          key: player.stablePlayerKey, name: player.name,
          steamId: player.steamId, civilization: player.civilizationName,
        })),
      })),
    } : {
      confirmedTeams: false,
      format: "Teams unverified",
      teams: [{
        key:"unknown",label:"PARTICIPANTS · TEAM UNKNOWN",
        players: session.players.slice(0, 8).map(player => ({
          key: player.stablePlayerKey, name: player.name,
          steamId: player.steamId, civilization: player.civilizationName,
        })),
      }],
    };
    const streams = (Array.isArray(session.streams) ? session.streams : [])
      .filter((value): value is WatchStreamPayload =>
        value && typeof value.id === "number" && value.status !== "removed")
      .slice(0, 24);
    const {cameras,unassigned} = assignTelevisionCameras(stage, streams);
    const rows = cameras.map(camera => ({
      playerName: camera.player.name,
      team: camera.teamKey,
      identity: camera.identity,
      status: televisionCameraStatus(camera.stream),
      streamId: camera.stream?.id ?? null,
      lastSeenSeconds: camera.stream?.lastHeartbeatAt
        ? Math.max(0,Math.floor((Date.now()-new Date(camera.stream.lastHeartbeatAt).getTime())/1000))
        : null,
    }));
    const liveCameras = rows.filter(row => row.status === "VIDEO LIVE").length;
    return {
      sessionKey: session.sessionKey,
      format: stage.format, teamsProven: stage.confirmedTeams,
      battleState: session.state,
      playerCount: rows.length,
      streamCount: streams.length,
      liveCameras,
      cameras: rows,
      unassignedStreams: unassigned.map(stream => ({
        id: stream.id, sourceType: stream.sourceType,
        status: televisionCameraStatus(stream),
      })),
      message: rows.length === 0
        ? "Roster not yet available; awaiting trusted replay evidence."
        : liveCameras >= 2 ? "Two or more live POVs identified."
        : liveCameras === 1 ? "One live POV; waiting for another player."
        : "No proven live camera yet; check opt-in and capture health.",
    };
  });
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    activeBattleCount: snapshot.activeSessions.length,
    examinedBattles: battles.length,
    battles,
    notes: [
      "Read-only canonical replay identities; unverified teams and cameras stay explicit.",
      "Missing POV is not a Watcher failure unless a stream-level diagnostic proves it.",
      "A VIDEO LIVE marker proves recent chunks/heartbeat, not playable output on every browser.",
      "This surface cannot open a broadcaster's screen or modify an account.",
    ],
  },{headers:NO_STORE});
}
