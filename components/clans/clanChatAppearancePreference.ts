"use client";

import { useCallback, useEffect, useState } from "react";

export type ClanChatFontSize = "small" | "standard" | "large" | "xl";
export type ClanChatLineSpacing = "tight" | "standard" | "relaxed";

export const CLAN_CHAT_FONT_STORAGE_KEY = "aoe2war:clans:chat-font-size";
export const CLAN_CHAT_LINE_STORAGE_KEY = "aoe2war:clans:chat-line-spacing";
export const CLAN_CHAT_APPEARANCE_EVENT = "aoe2war:clans:chat-appearance-change";

export const CLAN_CHAT_FONT_SIZES: ReadonlyArray<{
  key: ClanChatFontSize;
  label: string;
  shortLabel: string;
}> = [
  { key: "small", label: "Small chat text", shortLabel: "85%" },
  { key: "standard", label: "Standard chat text", shortLabel: "100%" },
  { key: "large", label: "Large chat text", shortLabel: "115%" },
  { key: "xl", label: "Extra large chat text", shortLabel: "130%" },
];

export const CLAN_CHAT_LINE_SPACING: ReadonlyArray<{
  key: ClanChatLineSpacing;
  label: string;
  shortLabel: string;
}> = [
  { key: "tight", label: "Tight line spacing", shortLabel: "Tight" },
  { key: "standard", label: "Standard line spacing", shortLabel: "Normal" },
  { key: "relaxed", label: "Relaxed line spacing", shortLabel: "Wide" },
];

function fontSize(value: string | null): ClanChatFontSize {
  return CLAN_CHAT_FONT_SIZES.some((option) => option.key === value)
    ? (value as ClanChatFontSize)
    : "standard";
}

function lineSpacing(value: string | null): ClanChatLineSpacing {
  return CLAN_CHAT_LINE_SPACING.some((option) => option.key === value)
    ? (value as ClanChatLineSpacing)
    : "standard";
}

export function useClanChatAppearancePreference() {
  const [chatFontSize, setChatFontSizeState] = useState<ClanChatFontSize>("standard");
  const [chatLineSpacing, setChatLineSpacingState] =
    useState<ClanChatLineSpacing>("standard");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => {
      setChatFontSizeState(fontSize(window.localStorage.getItem(CLAN_CHAT_FONT_STORAGE_KEY)));
      setChatLineSpacingState(lineSpacing(window.localStorage.getItem(CLAN_CHAT_LINE_STORAGE_KEY)));
    };

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === CLAN_CHAT_FONT_STORAGE_KEY ||
        event.key === CLAN_CHAT_LINE_STORAGE_KEY
      ) {
        read();
      }
    };
    const onPreference = () => read();

    read();
    window.addEventListener("storage", onStorage);
    window.addEventListener(CLAN_CHAT_APPEARANCE_EVENT, onPreference);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CLAN_CHAT_APPEARANCE_EVENT, onPreference);
    };
  }, []);

  const setChatFontSize = useCallback((next: ClanChatFontSize) => {
    setChatFontSizeState(next);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CLAN_CHAT_FONT_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(CLAN_CHAT_APPEARANCE_EVENT));
  }, []);

  const setChatLineSpacing = useCallback((next: ClanChatLineSpacing) => {
    setChatLineSpacingState(next);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CLAN_CHAT_LINE_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(CLAN_CHAT_APPEARANCE_EVENT));
  }, []);

  return {
    chatFontSize,
    chatLineSpacing,
    setChatFontSize,
    setChatLineSpacing,
  };
}
