"use client";
/* eslint-disable @next/next/no-img-element */

import { Mic, Paperclip, SendHorizonal, Square, X } from "lucide-react";
import { useId, useRef, useState, type ClipboardEvent, type DragEvent } from "react";

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

function firstImageFileFromFiles(files: FileList | File[] | null | undefined) {
  if (!files) return null;
  return Array.from(files).find((file) => file.type.startsWith("image/")) ?? null;
}

function firstImageFileFromItems(items: DataTransferItemList | null | undefined) {
  if (!items) return null;

  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    if (!item.type.startsWith("image/")) continue;

    const file = item.getAsFile();
    if (file) return file;
  }

  return null;
}

function imageFileFromTransfer(dataTransfer: DataTransfer) {
  return (
    firstImageFileFromFiles(dataTransfer.files) ||
    firstImageFileFromItems(dataTransfer.items) ||
    null
  );
}

function transferHasFile(dataTransfer: DataTransfer) {
  const types = Array.from(dataTransfer.types || []);
  return types.includes("Files") || Array.from(dataTransfer.items || []).some((item) => item.kind === "file");
}

function transferHasPossibleUrl(dataTransfer: DataTransfer) {
  return Boolean(dataTransfer.getData("text/uri-list") || dataTransfer.getData("text/plain"));
}

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
  const [dragActive, setDragActive] = useState(false);
  const [attachNotice, setAttachNotice] = useState<string | null>(null);

  const attachmentLocked = sendPending || Boolean(unavailableReason);
  const isDisabled = sendPending || Boolean(unavailableReason) || (!body.trim() && !attachment);

  function acceptImageFile(file: File | null, source: "attach" | "drop" | "paste") {
    if (!file) {
      setAttachNotice(
        source === "drop"
          ? "Drop an actual image file here. Brave may have sent only a link instead of the image."
          : "No image file was found."
      );
      return;
    }

    setAttachNotice(null);
    onAttachScreenshot(file);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (attachmentLocked) return;

    const nextFile = imageFileFromTransfer(event.clipboardData);
    if (!nextFile) return;

    event.preventDefault();
    acceptImageFile(nextFile, "paste");
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (attachmentLocked) return;
    if (!transferHasFile(event.dataTransfer) && !transferHasPossibleUrl(event.dataTransfer)) return;

    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (attachmentLocked) return;
    if (!transferHasFile(event.dataTransfer) && !transferHasPossibleUrl(event.dataTransfer)) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    const relatedNode = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (relatedNode && event.currentTarget.contains(relatedNode)) return;

    setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (attachmentLocked) return;

    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const nextFile = imageFileFromTransfer(event.dataTransfer);
    if (nextFile) {
      acceptImageFile(nextFile, "drop");
      return;
    }

    if (transferHasPossibleUrl(event.dataTransfer)) {
      setAttachNotice(
        "Brave gave us an image link, not an uploadable image file. Save the image, copy/paste it, or drag the saved file here."
      );
      return;
    }

    setAttachNotice("Drop a PNG, JPG, WebP, or GIF image here.");
  }

  return (
    <div
      className="relative min-w-0 space-y-2.5 sm:space-y-3"
      onPaste={handlePaste}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-[1.5rem] border border-sky-300/70 bg-slate-950/80 p-6 text-center shadow-[0_0_55px_rgba(56,189,248,0.22)] backdrop-blur-md">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.32em] text-sky-100">
              Drop image
            </div>
            <div className="mt-2 text-sm text-slate-300">
              PNG, JPG, WebP, GIF, or pasted screenshots work here.
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0 break-words text-[10px] uppercase tracking-[0.22em] text-slate-500 sm:text-xs sm:tracking-[0.28em]">
          {counterpartName ? `Replying to ${counterpartName}` : "Private reply"}
        </div>
        <div className="text-xs text-slate-600">
          {body.length}/{DIRECT_MESSAGE_MAX_CHARS}
        </div>
      </div>

      {attachNotice ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
          {attachNotice}
        </div>
      ) : null}

      {attachment ? (
        <div className="min-w-0 rounded-[1.25rem] bg-white/[0.05] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                {attachment.kind === "image" ? "Attachment ready" : "Voice note ready"}
              </div>
              <div className="mt-1 break-words text-sm font-medium text-white [overflow-wrap:anywhere]">
                {attachment.name}
              </div>
              {attachment.durationSeconds ? (
                <div className="mt-1 text-xs text-slate-500">{attachment.durationSeconds}s</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setAttachNotice(null);
                onClearAttachment();
              }}
              className="shrink-0 rounded-full bg-white/[0.06] p-2 text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition hover:bg-white/[0.1] hover:text-white"
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

      <div className="min-w-0 rounded-[1.2rem] bg-white/[0.055] p-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] sm:rounded-[1.35rem] sm:p-3">
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

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 sm:gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              id={inputId}
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                acceptImageFile(nextFile, "attach");
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
              aria-label={voiceRecording ? "Stop voice recording" : "Start voice recording"}
            >
              {voiceRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              <span className="hidden sm:inline">{voiceRecording ? "Stop Voice" : "Voice Mode"}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onSend}
            disabled={isDisabled}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <SendHorizonal className="h-4 w-4" />
            {sendPending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
