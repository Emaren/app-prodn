"use client";

import { useCallback, useEffect, useState } from "react";

export type ClanChatViewMode = "v1" | "v2" | "v3" | "v4" | "v5";

export const CLAN_CHAT_VIEW_STORAGE_KEY = "aoe2war:clans:chat-view";
export const CLAN_CHAT_VIEW_EVENT = "aoe2war:clans:chat-view-change";

export const CLAN_CHAT_VIEWS: ReadonlyArray<{
  key: ClanChatViewMode;
  version: string;
  label: string;
  description: string;
}> = [
  {
    key: "v1",
    version: "V1",
    label: "War Cards",
    description: "Original AoE2WAR Hall message cards.",
  },
  {
    key: "v2",
    version: "V2",
    label: "Discord Dense",
    description: "Grouped community chat with compact identity rows.",
  },
  {
    key: "v3",
    version: "V3",
    label: "Steam Tight",
    description: "Lean, practical transcript with minimal chrome.",
  },
  {
    key: "v4",
    version: "V4",
    label: "AoE2HD Classic",
    description: "Line-by-line legacy lobby chat with AoE2 warmth.",
  },
  {
    key: "v5",
    version: "V5",
    label: "Balloons",
    description: "Conversational left/right bubbles for casual halls.",
  },
];

export function isClanChatViewMode(
  value: string | null,
): value is ClanChatViewMode {
  return CLAN_CHAT_VIEWS.some((view) => view.key === value);
}

export function useClanChatViewPreference() {
  const [chatViewMode, setChatViewModeState] =
    useState<ClanChatViewMode>("v1");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applySavedMode = (value: string | null) => {
      if (isClanChatViewMode(value)) {
        setChatViewModeState(value);
      }
    };

    applySavedMode(
      window.localStorage.getItem(
        CLAN_CHAT_VIEW_STORAGE_KEY,
      ),
    );

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === CLAN_CHAT_VIEW_STORAGE_KEY
      ) {
        applySavedMode(event.newValue);
      }
    };

    const handlePreferenceChange = (
      event: Event,
    ) => {
      applySavedMode(
        (event as CustomEvent<string>).detail,
      );
    };

    window.addEventListener(
      "storage",
      handleStorage,
    );
    window.addEventListener(
      CLAN_CHAT_VIEW_EVENT,
      handlePreferenceChange,
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage,
      );
      window.removeEventListener(
        CLAN_CHAT_VIEW_EVENT,
        handlePreferenceChange,
      );
    };
  }, []);

  const setChatViewMode = useCallback(
    (nextMode: ClanChatViewMode) => {
      setChatViewModeState(nextMode);

      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.setItem(
        CLAN_CHAT_VIEW_STORAGE_KEY,
        nextMode,
      );
      window.dispatchEvent(
        new CustomEvent(
          CLAN_CHAT_VIEW_EVENT,
          { detail: nextMode },
        ),
      );
    },
    [],
  );

  return {
    chatViewMode,
    setChatViewMode,
  };
}
