"use client";

import { AlignJustify, Type } from "lucide-react";

import {
  CLAN_CHAT_FONT_SIZES,
  CLAN_CHAT_LINE_SPACING,
  useClanChatAppearancePreference,
} from "@/components/clans/clanChatAppearancePreference";

export default function ClanChatAppearanceControls({
  placement = "rail",
}: {
  placement?: "rail" | "header";
}) {
  const {
    chatFontSize,
    chatLineSpacing,
    setChatFontSize,
    setChatLineSpacing,
  } = useClanChatAppearancePreference();

  const fontIndex = Math.max(
    0,
    CLAN_CHAT_FONT_SIZES.findIndex((option) => option.key === chatFontSize),
  );
  const lineIndex = Math.max(
    0,
    CLAN_CHAT_LINE_SPACING.findIndex((option) => option.key === chatLineSpacing),
  );
  const font = CLAN_CHAT_FONT_SIZES[fontIndex];
  const lines = CLAN_CHAT_LINE_SPACING[lineIndex];

  function cycleFontSize() {
    setChatFontSize(
      CLAN_CHAT_FONT_SIZES[(fontIndex + 1) % CLAN_CHAT_FONT_SIZES.length].key,
    );
  }

  function cycleLineSpacing() {
    setChatLineSpacing(
      CLAN_CHAT_LINE_SPACING[(lineIndex + 1) % CLAN_CHAT_LINE_SPACING.length].key,
    );
  }

  return (
    <div className={`clan-chat-appearance clan-chat-appearance--${placement}`}>
      <button
        type="button"
        className="clan-chat-appearance__button"
        onClick={cycleFontSize}
        aria-label={`${font.label}. Click to change font size.`}
        title={`${font.label} · ${font.shortLabel}`}
      >
        <Type className="h-3.5 w-3.5" aria-hidden="true" />
        {placement === "rail" ? (
          <span className="clan-chat-appearance__value">{font.shortLabel}</span>
        ) : null}
      </button>

      <button
        type="button"
        className="clan-chat-appearance__button"
        onClick={cycleLineSpacing}
        aria-label={`${lines.label}. Click to change line spacing.`}
        title={lines.label}
      >
        <AlignJustify className="h-3.5 w-3.5" aria-hidden="true" />
        {placement === "rail" ? (
          <span className="clan-chat-appearance__value">{lines.shortLabel}</span>
        ) : null}
      </button>
    </div>
  );
}
