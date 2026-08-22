"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  isClanChatViewMode,
  normalizeClanChatViewMode,
  type ClanChatViewMode,
} from "@/lib/clanChatViews";

export type { ClanChatViewMode } from "@/lib/clanChatViews";

export const CLAN_CHAT_VIEW_STORAGE_PREFIX = "aoe2war:clans:chat-view:";
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

export { isClanChatViewMode };

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().slice(0, 80) || "unknown";
}

export function clanChatViewStorageKey(clanSlug: string) {
  return `${CLAN_CHAT_VIEW_STORAGE_PREFIX}${normalizeSlug(clanSlug)}`;
}

type ClanChatViewPreferenceEvent = {
  clanSlug: string;
  mode: ClanChatViewMode;
};

export function useClanChatViewPreference({
  clanSlug,
  defaultMode = "v1",
}: {
  clanSlug: string;
  defaultMode?: ClanChatViewMode;
}) {
  const normalizedSlug = useMemo(() => normalizeSlug(clanSlug), [clanSlug]);
  const normalizedDefault = normalizeClanChatViewMode(defaultMode, "v1");
  const [chatViewMode, setChatViewModeState] =
    useState<ClanChatViewMode>(normalizedDefault);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const key = clanChatViewStorageKey(normalizedSlug);
    const applyPreference = (storedValue: string | null) => {
      setChatViewModeState(
        isClanChatViewMode(storedValue) ? storedValue : normalizedDefault,
      );
    };

    applyPreference(window.localStorage.getItem(key));

    const handleStorage = (event: StorageEvent) => {
      if (event.key === key) applyPreference(event.newValue);
    };

    const handlePreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<ClanChatViewPreferenceEvent>).detail;
      if (!detail || normalizeSlug(detail.clanSlug) !== normalizedSlug) return;
      applyPreference(detail.mode);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(CLAN_CHAT_VIEW_EVENT, handlePreferenceChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CLAN_CHAT_VIEW_EVENT, handlePreferenceChange);
    };
  }, [normalizedDefault, normalizedSlug]);

  const setChatViewMode = useCallback(
    (nextMode: ClanChatViewMode) => {
      setChatViewModeState(nextMode);

      if (typeof window === "undefined") return;

      const key = clanChatViewStorageKey(normalizedSlug);
      window.localStorage.setItem(key, nextMode);
      window.dispatchEvent(
        new CustomEvent<ClanChatViewPreferenceEvent>(CLAN_CHAT_VIEW_EVENT, {
          detail: {
            clanSlug: normalizedSlug,
            mode: nextMode,
          },
        }),
      );
    },
    [normalizedSlug],
  );

  const clearChatViewOverride = useCallback(() => {
    setChatViewModeState(normalizedDefault);
    if (typeof window === "undefined") return;

    const key = clanChatViewStorageKey(normalizedSlug);
    window.localStorage.removeItem(key);
    window.dispatchEvent(
      new CustomEvent<ClanChatViewPreferenceEvent>(CLAN_CHAT_VIEW_EVENT, {
        detail: {
          clanSlug: normalizedSlug,
          mode: normalizedDefault,
        },
      }),
    );
  }, [normalizedDefault, normalizedSlug]);

  return {
    chatViewMode,
    setChatViewMode,
    clearChatViewOverride,
  };
}
