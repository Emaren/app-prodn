"use client";

import { useCallback, useEffect, useState } from "react";

export type ChatViewMode = "v1" | "v2" | "v3";

export const CHAT_VIEW_MODE_STORAGE_KEY = "aoe2war:direct-chat-view";
export const CHAT_VIEW_MODE_EVENT = "aoe2war:direct-chat-view-change";

function isChatViewMode(value: string | null): value is ChatViewMode {
  return value === "v1" || value === "v2" || value === "v3";
}

export function useChatViewPreference() {
  const [chatViewMode, setChatViewModeState] = useState<ChatViewMode>("v1");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applySavedMode = (value: string | null) => {
      if (isChatViewMode(value)) {
        setChatViewModeState(value);
      }
    };

    applySavedMode(window.localStorage.getItem(CHAT_VIEW_MODE_STORAGE_KEY));

    const handleStorage = (event: StorageEvent) => {
      if (event.key === CHAT_VIEW_MODE_STORAGE_KEY) {
        applySavedMode(event.newValue);
      }
    };
    const handlePreferenceChange = (event: Event) => {
      applySavedMode((event as CustomEvent<string>).detail);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(CHAT_VIEW_MODE_EVENT, handlePreferenceChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CHAT_VIEW_MODE_EVENT, handlePreferenceChange);
    };
  }, []);

  const setChatViewMode = useCallback((nextMode: ChatViewMode) => {
    setChatViewModeState(nextMode);
    if (typeof window === "undefined") return;

    window.localStorage.setItem(CHAT_VIEW_MODE_STORAGE_KEY, nextMode);
    window.dispatchEvent(new CustomEvent(CHAT_VIEW_MODE_EVENT, { detail: nextMode }));
  }, []);

  return { chatViewMode, setChatViewMode };
}
