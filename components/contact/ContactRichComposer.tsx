"use client";
/* eslint-disable @next/next/no-img-element */

import { Mic, Paperclip, SendHorizonal, Square, X } from "lucide-react";
import { useId, useRef } from "react";

import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import { DIRECT_MESSAGE_MAX_CHARS } from "@/lib/contactInboxConfig";

type ComposerAttachment = {
  kind: "image" | "audio";
  name: string;
  previewUrl: string;
  durationSeconds: number | null;
};

type ContactRichComposerProps = {
  body: string;
  sendPending: boolean;
  unavailableReason: string | null;
  counterpartName: string | null;
  attachment: ComposerAttachment | null;
  voiceSupported: boolean;
  voiceRecording: boolean;
  onBodyChange: (value: string) => void;
  onSend: () => void;
  onAttachScreenshot: (file: File | null) => void;
  onClearAttachment: () => void;
  onToggleVoiceRecording: () => void;
};

export default function ContactRichComposer({
  body,
  sendPending,
  unavailableReason,
  counterpartName,
  attachment,
  voiceSupported,
  voiceRecording,
  onBodyChange,
  onSend,
  onAttachScreenshot,
  onClearAttachment,
  onToggleVoiceRecording,
}: ContactRichComposerProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDisabled = sendPending || Boolean(unavailableReason) || (!body.trim() && !attachment);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
          {counterpartName ? `Replying to ${counterpartName}` : "Private reply"}
        </div>
        <div className="text-xs text-slate-600">
          {body.length}/{DIRECT_MESSAGE_MAX_CHARS}
        </div>
      </div>

      {attachment ? (
        <div className="rounded-[1.25rem] bg-white/[0.05] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                {attachment.kind === "image" ? "Attachment ready" : "Voice note ready"}
              </div>
              <div className="mt-1 text-sm font-medium text-white">{attachment.name}</div>
              {attachment.durationSeconds ? (
                <div className="mt-1 text-xs text-slate-500">{attachment.durationSeconds}s</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClearAttachment}
              className="rounded-full bg-white/[0.06] p-2 text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition hover:bg-white/[0.1] hover:text-white"
              aria-label="Remove attachment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {attachment.kind === "image" ? (
            <img
              src={attachment.previewUrl}
              alt={attachment.name}
              loading="lazy"
              decoding="async"
              className="mt-3 max-h-56 w-full rounded-2xl object-cover"
            />
          ) : (
            <audio src={attachment.previewUrl} controls className="mt-3 w-full" />
          )}
        </div>
      ) : null}

      <div className="rounded-[1.35rem] bg-white/[0.055] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        <AutoGrowTextarea
          value={body}
          maxRows={4}
          maxLength={DIRECT_MESSAGE_MAX_CHARS}
          onChange={(event) => onBodyChange(event.target.value.slice(0, DIRECT_MESSAGE_MAX_CHARS))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!isDisabled) {
                onSend();
              }
            }
          }}
          placeholder={counterpartName ? `Message ${counterpartName}...` : "Message the thread..."}
          className="w-full bg-transparent px-1 py-1 text-sm leading-6 text-white outline-none placeholder:text-slate-500"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={inputId}
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                onAttachScreenshot(nextFile);
                event.currentTarget.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-2 text-sm text-slate-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition hover:bg-white/[0.1] hover:text-white"
              aria-label="Attach image"
            >
              <Paperclip className="h-4 w-4" />
              <span className="hidden sm:inline">Attach</span>
            </button>

            <button
              type="button"
              onClick={onToggleVoiceRecording}
              disabled={!voiceSupported}
              className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-2 text-sm text-slate-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {voiceRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {voiceRecording ? "Stop Voice" : "Voice Mode"}
            </button>
          </div>

          <button
            type="button"
            onClick={onSend}
            disabled={isDisabled}
            className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SendHorizonal className="h-4 w-4" />
            {sendPending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
