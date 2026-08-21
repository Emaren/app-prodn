"use client";

import {
  Check,
  Layers3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  CLAN_CHAT_VIEWS,
  useClanChatViewPreference,
} from "@/components/clans/clanChatViewPreference";

function MiniPreview({
  mode,
}: {
  mode: string;
}) {
  return (
    <span
      className={`clan-chat-view-preview clan-chat-view-preview--${mode}`}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
    </span>
  );
}

export default function ClanChatViewPicker({
  placement = "rail",
}: {
  placement?: "rail" | "header";
}) {
  const {
    chatViewMode,
    setChatViewMode,
  } = useClanChatViewPreference();
  const [open, setOpen] =
    useState(false);
  const closeTimerRef =
    useRef<number | null>(null);

  function cancelFanClose() {
    if (closeTimerRef.current) {
      window.clearTimeout(
        closeTimerRef.current,
      );
      closeTimerRef.current = null;
    }
  }

  function openFan() {
    cancelFanClose();
    setOpen(true);
  }

  function scheduleFanClose() {
    cancelFanClose();
    closeTimerRef.current =
      window.setTimeout(
        () => setOpen(false),
        220,
      );
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(
          closeTimerRef.current,
        );
      }
    };
  }, []);

  const active =
    CLAN_CHAT_VIEWS.find(
      (view) =>
        view.key === chatViewMode,
    ) ?? CLAN_CHAT_VIEWS[0];

  const activeIndex = Math.max(
    0,
    CLAN_CHAT_VIEWS.findIndex(
      (view) =>
        view.key === chatViewMode,
    ),
  );

  function cycleChatView() {
    const next =
      CLAN_CHAT_VIEWS[
        (activeIndex + 1) %
          CLAN_CHAT_VIEWS.length
      ];
    setChatViewMode(next.key);
  }

  return (
    <div
      className={`clan-chat-view-picker clan-chat-view-picker--${placement}`}
      onMouseEnter={openFan}
      onMouseLeave={scheduleFanClose}
      onFocusCapture={openFan}
      onBlurCapture={(event) => {
        const next =
          event.relatedTarget;
        if (
          next instanceof Node &&
          event.currentTarget.contains(
            next,
          )
        ) {
          return;
        }
        scheduleFanClose();
      }}
    >
      <button
        type="button"
        className={`clan-chat-view-trigger clan-chat-view-trigger--${placement}`}
        onClick={cycleChatView}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Chat ${active.version} ${active.label}. Click for next chat view; hover to choose any view.`}
        title={`${active.version} · ${active.label} · Click for next view · Hover to choose`}
      >
        <Layers3
          className="h-4 w-4"
          aria-hidden="true"
        />
        <span>
          {active.version}
        </span>
      </button>

      {open ? (
        <div
          className="clan-chat-view-fan"
          role="menu"
          aria-label="Hall chat versions"
        >
          {CLAN_CHAT_VIEWS.map(
            (view) => {
              const selected =
                view.key ===
                chatViewMode;

              return (
                <button
                  key={view.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={
                    selected
                  }
                  className={`clan-chat-view-option${
                    selected
                      ? " clan-chat-view-option--active"
                      : ""
                  }`}
                  onClick={() => {
                    cancelFanClose();
                    setChatViewMode(
                      view.key,
                    );
                    setOpen(false);
                  }}
                >
                  <MiniPreview
                    mode={view.key}
                  />
                  <span className="min-w-0">
                    <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
                      {view.version}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold text-white">
                      {view.label}
                    </span>
                  </span>
                  {selected ? (
                    <Check
                      className="ml-auto h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            },
          )}
        </div>
      ) : null}
    </div>
  );
}
