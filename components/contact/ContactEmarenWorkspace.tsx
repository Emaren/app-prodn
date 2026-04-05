"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import ContactInboxPanel from "@/components/contact/ContactInboxPanel";
import ContactRichComposer from "@/components/contact/ContactRichComposer";
import type {
  ContactChallengeActionKind,
  ContactChallengeActionState,
  ContactInboxPayload,
} from "@/components/contact/types";
import { useUserAuth } from "@/context/UserAuthContext";
import SteamLoginButton from "@/components/SteamLoginButton";

type ComposerAttachment = {
  file: File;
  kind: "image" | "audio";
  previewUrl: string;
  durationSeconds: number | null;
};

const MAX_SCREENSHOT_DIMENSION = 1600;
const TARGET_SCREENSHOT_BYTES = 900_000;

function readDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const detail = "detail" in payload ? payload.detail : null;
  return typeof detail === "string" ? detail : null;
}

async function optimizeScreenshotAttachment(file: File) {
  if (typeof window === "undefined") {
    return file;
  }

  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  if (file.size <= TARGET_SCREENSHOT_BYTES) {
    return file;
  }

  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Screenshot preview failed."));
      nextImage.src = sourceUrl;
    });

    const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
    const scale = Math.min(
      1,
      MAX_SCREENSHOT_DIMENSION / sourceWidth,
      MAX_SCREENSHOT_DIMENSION / sourceHeight
    );

    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.drawImage(image, 0, 0, width, height);

    const optimizedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.94);
    });

    if (!optimizedBlob) {
      return file;
    }

    if (optimizedBlob.size >= file.size * 0.97) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || `screenshot-${Date.now()}`;
    return new File([optimizedBlob], `${baseName}.webp`, {
      type: optimizedBlob.type || "image/webp",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("Screenshot optimization failed:", error);
    return file;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function requestInbox(targetUid?: string | null, summaryOnly?: boolean) {
  const params = new URLSearchParams();
  if (targetUid) {
    params.set("user", targetUid);
  }
  if (summaryOnly) {
    params.set("summary", "1");
  }

  const response = await fetch(`/api/contact-emaren${params.size > 0 ? `?${params.toString()}` : ""}`, {
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as
    | ContactInboxPayload
    | { detail?: string };

  if (!response.ok) {
    throw new Error(readDetail(payload) || "Inbox failed.");
  }

  return payload as ContactInboxPayload;
}

export default function ContactEmarenWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedUser = searchParams?.get("user") ?? null;
  const { uid, isAuthenticated, loading } = useUserAuth();
  const [summaryData, setSummaryData] = useState<ContactInboxPayload | null>(null);
  const [panelData, setPanelData] = useState<ContactInboxPayload | null>(null);
  const [selectedTargetUid, setSelectedTargetUid] = useState<string | null>(requestedUser);
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [sendPending, setSendPending] = useState(false);
  const [challengeActionState, setChallengeActionState] = useState<ContactChallengeActionState>({
    challengeId: null,
    action: null,
  });
  const [pending, setPending] = useState(false);
  const [summaryPending, setSummaryPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reactingMessageId, setReactingMessageId] = useState<number | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const selectedTargetUidRef = useRef<string | null>(requestedUser);

  const clearAttachment = useCallback(() => {
    setAttachment((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  }, []);

  const syncThreadUrl = useCallback(
    (targetUid: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (targetUid) {
        params.set("user", targetUid);
      } else {
        params.delete("user");
      }

      const nextQuery = params.toString();
      const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const applySelectedTargetUid = useCallback(
    (targetUid: string | null, options?: { syncUrl?: boolean }) => {
      selectedTargetUidRef.current = targetUid;
      setSelectedTargetUid(targetUid);
      if (options?.syncUrl !== false) {
        syncThreadUrl(targetUid);
      }
    },
    [syncThreadUrl]
  );

  const refreshSummary = useCallback(
    async (targetUid?: string | null, options?: { silent?: boolean }) => {
      if (!uid) return null;
      const silent = Boolean(options?.silent);
      const nextTargetUid = targetUid ?? selectedTargetUidRef.current ?? undefined;
      if (!silent) {
        setSummaryPending(true);
        setError(null);
      }
      try {
        const payload = await requestInbox(nextTargetUid, true);
        setSummaryData(payload);
        applySelectedTargetUid(payload.activeTargetUid, { syncUrl: true });
        return payload;
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Inbox failed.");
        return null;
      } finally {
        if (!silent) {
          setSummaryPending(false);
        }
      }
    },
    [applySelectedTargetUid, uid]
  );

  const refreshPanel = useCallback(
    async (targetUid?: string | null, options?: { silent?: boolean }) => {
      if (!uid) return null;
      const silent = Boolean(options?.silent);
      const nextTargetUid = targetUid ?? selectedTargetUidRef.current ?? undefined;
      if (!silent) {
        setPending(true);
        setError(null);
      }
      try {
        const payload = await requestInbox(nextTargetUid, false);
        setPanelData(payload);
        setSummaryData(payload);
        applySelectedTargetUid(payload.activeTargetUid, { syncUrl: true });
        return payload;
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Inbox failed.");
        return null;
      } finally {
        if (!silent) {
          setPending(false);
        }
      }
    },
    [applySelectedTargetUid, uid]
  );

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    typingActiveRef.current = false;
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setBody("");
    clearAttachment();

    if (requestedUser !== selectedTargetUidRef.current) {
      selectedTargetUidRef.current = requestedUser;
      setSelectedTargetUid(requestedUser);
      setPanelData(null);
      setSummaryData((current) =>
        current
          ? {
              ...current,
              activeTargetUid: requestedUser,
            }
          : current
      );
    }

    (async () => {
      const initialTargetUid = requestedUser ?? selectedTargetUidRef.current ?? null;
      const summaryPayload = await refreshSummary(initialTargetUid, { silent: false });
      if (cancelled) return;

      const targetUid = initialTargetUid ?? summaryPayload?.activeTargetUid ?? null;
      if (targetUid) {
        await refreshPanel(targetUid, { silent: false });
      } else if (summaryPayload) {
        setPanelData(summaryPayload);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearAttachment, refreshPanel, refreshSummary, requestedUser, uid]);

  useEffect(() => {
    if (!uid) return;
    const interval = window.setInterval(() => {
      if (selectedTargetUid) {
        void refreshPanel(undefined, { silent: true });
      } else {
        void refreshSummary(undefined, { silent: true });
      }
    }, 4_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshPanel, refreshSummary, selectedTargetUid, uid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVoiceSupported(
      typeof window.MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }, []);

  useEffect(() => {
    return () => {
      clearAttachment();
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [clearAttachment]);

  async function sendTypingState(isTyping: boolean) {
    if (!selectedTargetUid) return;

    try {
      await fetch("/api/contact-emaren", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "set_typing",
          targetUid: selectedTargetUid,
          isTyping,
        }),
      });
      typingActiveRef.current = isTyping;
    } catch (typingError) {
      console.warn("Typing state failed:", typingError);
    }
  }

  function scheduleTypingState(nextValue: string) {
    if (!selectedTargetUid) return;

    const hasText = nextValue.trim().length > 0;
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }

    if (!hasText) {
      if (typingActiveRef.current) {
        void sendTypingState(false);
      }
      return;
    }

    if (!typingActiveRef.current) {
      void sendTypingState(true);
    }

    typingTimerRef.current = window.setTimeout(() => {
      void sendTypingState(false);
    }, 2500);
  }

  async function performInboxAction(
    action: Record<string, unknown>,
    options?: { expectPayload?: boolean }
  ) {
    const response = await fetch("/api/contact-emaren", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetUid: selectedTargetUid,
        ...action,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as
      | ContactInboxPayload
      | { detail?: string; ok?: boolean };

    if (!response.ok) {
      throw new Error(readDetail(payload) || "Inbox action failed.");
    }

    if (options?.expectPayload === false) {
      return payload;
    }

    setPanelData(payload as ContactInboxPayload);
    setSummaryData(payload as ContactInboxPayload);
    applySelectedTargetUid((payload as ContactInboxPayload).activeTargetUid, { syncUrl: true });
    return payload;
  }

  async function handleAttachScreenshot(file: File | null) {
    if (!file) return;

    clearAttachment();
    const preparedFile = await optimizeScreenshotAttachment(file);
    const previewUrl = URL.createObjectURL(preparedFile);
    setAttachment({
      file: preparedFile,
      kind: "image",
      previewUrl,
      durationSeconds: null,
    });
  }

  async function handleToggleVoiceRecording() {
    if (voiceRecording) {
      mediaRecorderRef.current?.stop();
      setVoiceRecording(false);
      return;
    }

    if (!voiceSupported) {
      setError("Voice mode is not supported in this browser.");
      return;
    }

    clearAttachment();
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      let startedAt = Date.now();

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const blob = new Blob(mediaChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const previewUrl = URL.createObjectURL(blob);
        const file = new File([blob], `voice-note-${Date.now()}.webm`, {
          type: blob.type || "audio/webm",
        });

        setAttachment({
          file,
          kind: "audio",
          previewUrl,
          durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        });

        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      });

      mediaRecorderRef.current = recorder;
      recorder.start();
      setVoiceRecording(true);
      startedAt = Date.now();
    } catch (recordError) {
      setVoiceRecording(false);
      setError(recordError instanceof Error ? recordError.message : "Could not start voice mode.");
    }
  }

  async function handleSend() {
    if (!body.trim() && !attachment) return;

    setSendPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("body", body);
      if (selectedTargetUid) {
        formData.set("targetUid", selectedTargetUid);
      }
      if (attachment) {
        formData.set("attachment", attachment.file);
        if (attachment.durationSeconds) {
          formData.set("attachmentDurationSeconds", String(attachment.durationSeconds));
        }
      }

      const response = await fetch("/api/contact-emaren", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as
        | ContactInboxPayload
        | { detail?: string };

      if (!response.ok) {
        throw new Error(readDetail(payload) || "Message failed.");
      }

      void sendTypingState(false);
      setBody("");
      clearAttachment();
      setPanelData(payload as ContactInboxPayload);
      setSummaryData(payload as ContactInboxPayload);
      applySelectedTargetUid((payload as ContactInboxPayload).activeTargetUid, { syncUrl: true });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message failed.");
    } finally {
      setSendPending(false);
    }
  }

  async function handleChallengeAction(payload: {
    challengeId: number;
    action: ContactChallengeActionKind;
    scheduledAt?: string;
    challengeNote?: string;
  }) {
    setChallengeActionState({
      challengeId: payload.challengeId,
      action: payload.action,
    });
    setError(null);

    try {
      const response = await fetch(`/api/challenges/${payload.challengeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: payload.action,
          scheduledAt: payload.scheduledAt,
          challengeNote: payload.challengeNote,
        }),
      });

      const nextPayload = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) {
        throw new Error(readDetail(nextPayload) || "Challenge action failed.");
      }

      await refreshPanel(selectedTargetUid);
    } catch (challengeError) {
      setError(challengeError instanceof Error ? challengeError.message : "Challenge action failed.");
    } finally {
      setChallengeActionState({
        challengeId: null,
        action: null,
      });
    }
  }

  const displayData = panelData ?? summaryData;

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col justify-center rounded-[1.75rem] border border-white/10 bg-slate-950/70 px-5 py-8 text-white sm:px-6 sm:py-10">
        Loading your direct line...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-full min-h-0 flex-col justify-center rounded-[1.75rem] border border-white/10 bg-slate-950/70 px-5 py-8 text-white sm:px-6 sm:py-10">
        <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Contact Emaren</div>
        <h1 className="mt-3 text-3xl font-semibold text-white">Sign in to message Emaren.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
          Steam sign-in keeps the line personal and tied to a real AoE2HDBets identity.
        </p>
        <div className="mt-6">
          <SteamLoginButton className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col overflow-hidden">
      <ContactInboxPanel
        data={displayData}
        loading={summaryPending && !displayData ? true : pending}
        error={error}
        body={body}
        sendPending={sendPending}
        mode="page"
        reactingMessageId={reactingMessageId}
        onBodyChange={(value) => {
          setBody(value);
          scheduleTypingState(value);
        }}
        onInboxAction={async (action) => {
          setError(null);
          try {
            await performInboxAction(action);
          } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Inbox action failed.");
          }
        }}
        onChallengeAction={(payload) => {
          void handleChallengeAction(payload);
        }}
        challengeActionState={challengeActionState}
        onToggleReaction={async (messageId, emoji) => {
          setReactingMessageId(messageId);
          setError(null);
          try {
            await performInboxAction({ action: "toggle_reaction", messageId, emoji });
          } catch (reactionError) {
            setError(reactionError instanceof Error ? reactionError.message : "Reaction failed.");
          } finally {
            setReactingMessageId(null);
          }
        }}
        onSelectConversation={(targetUid) => {
          void sendTypingState(false);
          setBody("");
          clearAttachment();
          setPanelData(null);
          applySelectedTargetUid(targetUid, { syncUrl: true });
          setSummaryData((current) =>
            current
              ? {
                  ...current,
                  activeTargetUid: targetUid,
                }
              : current
          );
          void refreshPanel(targetUid, { silent: false });
        }}
        onSend={() => {
          void handleSend();
        }}
        richComposer={
          <ContactRichComposer
            body={body}
            sendPending={sendPending}
            unavailableReason={displayData?.unavailableReason ?? null}
            counterpartName={displayData?.activeCounterpart?.displayName ?? null}
            attachment={
              attachment
                ? {
                    kind: attachment.kind,
                    name: attachment.file.name,
                    previewUrl: attachment.previewUrl,
                    durationSeconds: attachment.durationSeconds,
                  }
                : null
            }
            voiceSupported={voiceSupported}
            voiceRecording={voiceRecording}
            onBodyChange={(value) => {
              setBody(value);
              scheduleTypingState(value);
            }}
            onSend={() => {
              if (!sendPending) {
                void handleSend();
              }
            }}
            onAttachScreenshot={(file) => {
              void handleAttachScreenshot(file);
            }}
            onClearAttachment={clearAttachment}
            onToggleVoiceRecording={() => {
              void handleToggleVoiceRecording();
            }}
          />
        }
      />
    </div>
  );
}
