"use client";

import { useCallback } from "react";

import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import {
  getTileViewMode,
  TILE_VIEW_MODES,
  type TileViewKey,
  type TileViewMode,
} from "@/lib/tileViewPreferences";

export function useTileViewPreference(tileKey: TileViewKey) {
  const { tileViewPreferences, setTileViewPreference } = useLobbyAppearance();
  const viewMode = getTileViewMode(tileViewPreferences, tileKey);

  const toggleViewMode = useCallback(() => {
    const currentIndex = TILE_VIEW_MODES.indexOf(viewMode);
    const nextViewMode = TILE_VIEW_MODES[(currentIndex + 1) % TILE_VIEW_MODES.length];
    setTileViewPreference(tileKey, nextViewMode);
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
