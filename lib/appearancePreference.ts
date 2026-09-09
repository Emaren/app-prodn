import type {
  LobbyTextColor,
  LobbyThemeKey,
  LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { LeaderboardLane } from "@/lib/leaderboardLane";
import type { TimeClockMode, TimeDisplayMode } from "@/lib/timeDisplay";
import type { TileViewPreferences } from "@/lib/tileViewPreferences";

export type AppearancePreferenceInput = {
  themeKey: LobbyThemeKey;
  tileThemeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  textColor: LobbyTextColor;
  timeDisplayMode: TimeDisplayMode;
  timeClockMode: TimeClockMode;
  timezoneOverride: string | null;
  tileViewPreferences: TileViewPreferences;
  leaderboardLane: LeaderboardLane;
};

export function appearancePreferenceFingerprint(
  input: AppearancePreferenceInput,
) {
  return JSON.stringify([
    input.themeKey,
    input.tileThemeKey,
    input.viewMode,
    input.textColor,
    input.timeDisplayMode,
    input.timeClockMode,
    input.timezoneOverride,
    Object.entries(input.tileViewPreferences).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    input.leaderboardLane,
  ]);
}

export function appearancePreferenceNeedsSave(
  persistedFingerprint: string | null,
  pendingFingerprint: string | null,
  nextFingerprint: string,
) {
  if (nextFingerprint === pendingFingerprint) {
    return false;
  }

  return (
    nextFingerprint !== persistedFingerprint || pendingFingerprint !== null
  );
}
