"use client";

import { useCallback } from "react";

import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import {
  getTileViewMode,
  type TileViewKey,
  type TileViewMode,
} from "@/lib/tileViewPreferences";

export function useTileViewPreference(tileKey: TileViewKey) {
  const { tileViewPreferences, setTileViewPreference } = useLobbyAppearance();
  const viewMode = getTileViewMode(tileViewPreferences, tileKey);

  const toggleViewMode = useCallback(() => {
    setTileViewPreference(tileKey, viewMode === "advanced" ? "basic" : "advanced");
  }, [setTileViewPreference, tileKey, viewMode]);

  const setViewMode = useCallback(
    (nextViewMode: TileViewMode) => {
      setTileViewPreference(tileKey, nextViewMode);
    },
    [setTileViewPreference, tileKey]
  );

  return {
    tileKey,
    viewMode,
    setViewMode,
    toggleViewMode,
  };
}
