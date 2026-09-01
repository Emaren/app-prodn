"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useLobbyAppearanceOptional,
} from "@/components/lobby/LobbyAppearanceContext";
import {
  getTileViewMode,
  readStoredTileViewPreferences,
  setTileViewPreference as updateTileViewPreference,
  TILE_VIEW_MODES,
  writeStoredTileViewPreferences,
  type TileViewKey,
  type TileViewMode,
  type TileViewPreferences,
} from "@/lib/tileViewPreferences";

export function useTileViewPreference(
  tileKey: TileViewKey,
) {
  const appearance =
    useLobbyAppearanceOptional();

  /*
   * Client providers normally own these preferences.
   *
   * During an isolated/transient SSR render, however, a page-level
   * client island can render before LobbyAppearanceContext is available.
   * Never crash the page for a presentation preference: render the
   * canonical default and hydrate from local storage until the provider
   * becomes available.
   */
  const [
    fallbackPreferences,
    setFallbackPreferences,
  ] = useState<TileViewPreferences>({});

  useEffect(() => {
    if (appearance) {
      return;
    }

    setFallbackPreferences(
      readStoredTileViewPreferences(),
    );
  }, [appearance]);

  const preferences =
    appearance?.tileViewPreferences ??
    fallbackPreferences;

  const viewMode =
    getTileViewMode(
      preferences,
      tileKey,
    );

  const setViewMode =
    useCallback(
      (
        nextViewMode: TileViewMode,
      ) => {
        if (appearance) {
          appearance.setTileViewPreference(
            tileKey,
            nextViewMode,
          );

          return;
        }

        setFallbackPreferences(
          (current) => {
            const next =
              updateTileViewPreference(
                current,
                tileKey,
                nextViewMode,
              );

            try {
              writeStoredTileViewPreferences(
                next,
              );
            } catch {
              // Private-mode/localStorage failures must never crash a view toggle.
            }

            return next;
          },
        );
      },
      [
        appearance,
        tileKey,
      ],
    );

  const toggleViewMode =
    useCallback(() => {
      const currentIndex =
        TILE_VIEW_MODES.indexOf(
          viewMode,
        );

      const nextViewMode =
        TILE_VIEW_MODES[
          (
            currentIndex + 1
          ) %
            TILE_VIEW_MODES.length
        ];

      setViewMode(
        nextViewMode,
      );
    }, [
      setViewMode,
      viewMode,
    ]);

  return {
    tileKey,
    viewMode,
    setViewMode,
    toggleViewMode,
  };
}
