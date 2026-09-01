"use client";

import { MessageSquareMore, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";

import {
  mergeContactInboxPayload,
  optimisticallyToggleContactReaction,
  type MergeContactInboxPayloadOptions,
} from "@/components/contact/contactInboxPayload";
import type {
  ContactChallengeActionKind,
  ContactChallengeActionState,
  ContactInboxPayload,
  ContactTextMessage,
} from "@/components/contact/types";
import { useUserAuth } from "@/context/UserAuthContext";

const ContactInboxPanel = dynamic(
  () => import("@/components/contact/ContactInboxPanel"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        Opening inbox…
      </div>
    ),
  }
);

function readDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const detail = "detail" in payload ? payload.detail : null;
  return typeof detail === "string" ? detail : null;
}

async function requestInbox(
  targetUid?: string | null,
  summaryOnly?: boolean,
  beforeMessageId?: number | null,
  signal?: AbortSignal
) {
  const params = new URLSearchParams();
  if (targetUid) {
    params.set("user", targetUid);
  }
  if (summaryOnly) {
    params.set("summary", "1");
  }
  if (beforeMessageId) params.set("before", String(beforeMessageId));

  const response = await fetch(
    `/api/contact-emaren${params.size > 0 ? `?${params.toString()}` : ""}`,
    {
      cache: "no-store",
      signal,
    }
  );

  const payload = (await response.json().catch(() => ({}))) as
    | ContactInboxPayload
    | { detail?: string };

  if (!response.ok) {
    throw new Error(readDetail(payload) || "Inbox failed.");
  }

  return payload as ContactInboxPayload;
}

type HeaderInboxControlProps = {
  buttonClassName?: string;
};

export default function HeaderInboxControl({ buttonClassName }: HeaderInboxControlProps) {
  const { uid } = useUserAuth();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ContactInboxPayload | null>(null);
  const [panelData, setPanelData] = useState<ContactInboxPayload | null>(null);
  const [selectedTargetUid, setSelectedTargetUid] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendPending, setSendPending] = useState(false);
  const [challengeActionState, setChallengeActionState] = useState<ContactChallengeActionState>({
    challengeId: null,
    action: null,
  });
  const [reactingMessageId, setReactingMessageId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<ContactTextMessage | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [desktopAnchor, setDesktopAnchor] = useState({ right: 16, top: 72 });
  const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null);
  const selectedTargetUidRef = useRef<string | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const panelCacheRef = useRef(new Map<string, ContactInboxPayload>());
  const panelRequestIdRef = useRef(0);
  const summaryRequestIdRef = useRef(0);
  const panelAbortRef = useRef<AbortController | null>(null);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const draftHydratedTargetRef = useRef<string | null>(null);

  const updateDesktopAnchor = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const nextAnchor = {
      right: Math.max(16, window.innerWidth - rect.right),
      top: rect.bottom + 8,
    };
    setDesktopAnchor((current) =>
      Math.abs(current.right - nextAnchor.right) < 1 && Math.abs(current.top - nextAnchor.top) < 1
        ? current
        : nextAnchor
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    const visualViewport = window.visualViewport;
    let resizeFrame: number | null = null;
    const syncViewportMetrics = () => {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        updateDesktopAnchor();
        const compactViewport = window.matchMedia("(max-width: 639px)").matches;
        const nextHeight = compactViewport
          ? Math.round(visualViewport?.height ?? window.innerHeight)
          : null;
        setMobileViewportHeight((current) => (current === nextHeight ? current : nextHeight));
      });
    };
    syncViewportMetrics();
    window.addEventListener("resize", syncViewportMetrics);
    visualViewport?.addEventListener("resize", syncViewportMetrics);
    return () => {
      window.removeEventListener("resize", syncViewportMetrics);
      visualViewport?.removeEventListener("resize", syncViewportMetrics);
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
    };
  }, [open, updateDesktopAnchor]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  const applySelectedTargetUid = useCallback((targetUid: string | null) => {
    selectedTargetUidRef.current = targetUid;
    setSelectedTargetUid(targetUid);
  }, []);

  const applyInboxPayload = useCallback(
    (
      payload: ContactInboxPayload,
      options: MergeContactInboxPayloadOptions = {}
    ) => {
      const targetUid = payload.activeTargetUid;
      const cachedPayload = targetUid
        ? panelCacheRef.current.get(targetUid) ?? null
        : null;
      const cachePayload = mergeContactInboxPayload(cachedPayload, payload, options);
      if (targetUid) panelCacheRef.current.set(targetUid, cachePayload);
      setPanelData((current) => {
        const base = current?.activeTargetUid === targetUid ? current : cachePayload;
        const nextPayload = mergeContactInboxPayload(base, payload, options);
        if (targetUid) panelCacheRef.current.set(targetUid, nextPayload);
        return nextPayload;
      });
      setSummary(payload);
      applySelectedTargetUid(targetUid);
      if (targetUid && draftHydratedTargetRef.current !== targetUid) {
        draftHydratedTargetRef.current = targetUid;
        setBody(payload.draft?.body ?? "");
        setReplyingTo(
          payload.draft?.replyToMessageId
            ? (cachePayload.messages.find((message): message is ContactTextMessage => message.kind === "text" && message.messageId === payload.draft?.replyToMessageId) ?? null)
            : null
        );
      }
    },
    [applySelectedTargetUid]
  );

  const refreshSummary = useCallback(async (targetUid?: string | null) => {
    if (!uid) return null;

    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;

    try {
      const payload = await requestInbox(
        targetUid ?? selectedTargetUidRef.current ?? undefined,
        true,
        undefined,
        controller.signal
      );
      if (summaryRequestIdRef.current !== requestId) return null;
      setSummary(payload);
      if (!selectedTargetUidRef.current || targetUid) {
        applySelectedTargetUid(payload.activeTargetUid);
      }
      return payload;
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === "AbortError") return null;
      console.warn("Failed to refresh inbox summary:", fetchError);
      return null;
    } finally {
      if (summaryRequestIdRef.current === requestId) summaryAbortRef.current = null;
    }
  }, [applySelectedTargetUid, uid]);

  const refreshPanel = useCallback(
    async (targetUid?: string | null, options?: { silent?: boolean }) => {
      if (!uid) return null;
      const silent = Boolean(options?.silent);
      const requestedTargetUid = targetUid ?? selectedTargetUidRef.current ?? null;
      const cachedPayload = requestedTargetUid
        ? panelCacheRef.current.get(requestedTargetUid) ?? null
        : null;
      const requestId = panelRequestIdRef.current + 1;
      panelRequestIdRef.current = requestId;
      panelAbortRef.current?.abort();
      const controller = new AbortController();
      panelAbortRef.current = controller;

      if (!silent) {
        if (cachedPayload) {
          setPanelData(cachedPayload);
        }
        setLoading(!cachedPayload);
        setError(null);
      }

      try {
        const payload = await requestInbox(
          requestedTargetUid ?? undefined,
          false,
          undefined,
          controller.signal
        );
        if (panelRequestIdRef.current !== requestId) {
          return null;
        }
        applyInboxPayload(payload);
        return payload;
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return null;
        if (panelRequestIdRef.current === requestId) {
          setError(fetchError instanceof Error ? fetchError.message : "Inbox failed.");
        }
        return null;
      } finally {
        if (!silent && panelRequestIdRef.current === requestId) {
          setLoading(false);
        }
        if (panelRequestIdRef.current === requestId) panelAbortRef.current = null;
      }
    },
    [applyInboxPayload, uid]
  );

  useEffect(() => {
    if (!uid || open) return;

    void refreshSummary();
    const interval = window.setInterval(() => {
      void refreshSummary();
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [open, refreshSummary, uid]);

  useEffect(() => {
    if (!open || !uid) return;

    void refreshPanel(selectedTargetUidRef.current);
    const interval = window.setInterval(() => {
      void refreshPanel(undefined, { silent: true });
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [open, refreshPanel, uid]);

  useEffect(() => {
    if (!uid) return;
    const events = new EventSource("/api/contact-emaren/events");
    let timer: number | null = null;
    events.onmessage = (event) => {
      let payload: { type?: string; targetUid?: string | null };
      try {
        payload = JSON.parse(event.data || "{}") as typeof payload;
      } catch {
        return;
      }
      if (payload.type === "connected") return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const affectsOpenThread =
          !payload.targetUid || payload.targetUid === selectedTargetUidRef.current;
        if (open && affectsOpenThread) {
          void refreshPanel(undefined, { silent: true });
        } else {
          void refreshSummary();
        }
      }, 80);
    };
    return () => {
      events.close();
      if (timer) window.clearTimeout(timer);
    };
  }, [open, refreshPanel, refreshSummary, uid]);

  useEffect(() => {
    const targetUid = selectedTargetUidRef.current;
    if (!targetUid || draftHydratedTargetRef.current !== targetUid) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/contact-emaren", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_draft", targetUid, body, replyToMessageId: replyingTo?.messageId ?? null }),
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [body, replyingTo?.messageId]);

  const sendTypingState = useCallback(
    async (isTyping: boolean) => {
      const targetUid = selectedTargetUidRef.current;
      if (!uid || !targetUid) return;

      try {
        await fetch("/api/contact-emaren", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "set_typing",
            targetUid,
            isTyping,
          }),
        });
        typingActiveRef.current = isTyping;
      } catch (typingError) {
        console.warn("Nav typing state failed:", typingError);
      }
    },
    [uid]
  );

  useEffect(() => {
    return () => {
      panelAbortRef.current?.abort();
      summaryAbortRef.current?.abort();
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (typingActiveRef.current) {
        void sendTypingState(false);
      }
    };
  }, [sendTypingState]);

  const unreadCount = summary?.totalUnreadCount ?? 0;
  const openPageHref = useMemo(() => {
    if (!selectedTargetUid) return "/contact-emaren";
    return `/contact-emaren?user=${encodeURIComponent(selectedTargetUid)}`;
  }, [selectedTargetUid]);

  const handleChallengeAction = useCallback(
    async (payload: {
      challengeId: number;
      action: ContactChallengeActionKind;
      scheduledAt?: string;
      challengeNote?: string;
      wagerAmountWolo?: number;
      guaranteeAmountWolo?: number;
      fundingTxHash?: string;
      fundingWalletAddress?: string;
    }) => {
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
            wagerAmountWolo: payload.wagerAmountWolo,
            guaranteeAmountWolo: payload.guaranteeAmountWolo,
            fundingTxHash: payload.fundingTxHash,
            fundingWalletAddress: payload.fundingWalletAddress,
          }),
        });

        const nextPayload = (await response.json().catch(() => ({}))) as { detail?: string };
        if (!response.ok) {
          throw new Error(readDetail(nextPayload) || "Challenge action failed.");
        }

        await refreshPanel(selectedTargetUidRef.current);
      } catch (challengeError) {
        const message =
          challengeError instanceof Error ? challengeError.message : "Challenge action failed.";
        setError(message);
        throw new Error(message);
      } finally {
        setChallengeActionState({
          challengeId: null,
          action: null,
        });
      }
    },
    [refreshPanel]
  );


  function scheduleTypingState(nextBody: string) {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    if (!nextBody.trim()) {
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
    }, 2200);
  }

  if (!uid) {
    return null;
  }

  return (
    <>
      <div className={`relative ${open ? "z-[120]" : "z-10"}`}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            if (!open) updateDesktopAnchor();
            setOpen((current) => !current);
          }}
          className={[
            "relative flex h-11 w-11 items-center justify-center rounded-full border text-white transition",
            buttonClassName || "border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Open Contact Emaren inbox"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <MessageSquareMore className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
              {unreadCount}
            </span>
          ) : null}
        </button>
      </div>

      {open && typeof document !== "undefined" ? createPortal(
        <>
          <button
            type="button"
            aria-label="Close inbox overlay"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[210] bg-[#02060f]/78 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
          />

          <div
            role="dialog"
            aria-label="Private inbox"
            className="fixed inset-x-2 top-[5.75rem] z-[220] h-[calc(var(--contact-inbox-viewport-height,100dvh)-6.35rem)] transform-gpu [backface-visibility:hidden] sm:inset-x-auto sm:right-[var(--contact-inbox-right)] sm:top-[var(--contact-inbox-top)] sm:h-[min(38rem,calc(100dvh-6.5rem))] sm:w-[min(31rem,calc(100vw-2rem))]"
            style={{
              "--contact-inbox-right": `${desktopAnchor.right}px`,
              "--contact-inbox-top": `${desktopAnchor.top}px`,
              "--contact-inbox-viewport-height": mobileViewportHeight ? `${mobileViewportHeight}px` : "100dvh",
            } as CSSProperties}
          >
            <div className="absolute -top-11 right-0 flex justify-end sm:hidden">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0b1324]/90 text-slate-300 transition hover:border-white/20 hover:text-white"
                aria-label="Close inbox"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              ref={panelRef}
              data-floating-chat-boundary="true"
              className="h-full min-h-0 overflow-hidden rounded-[1.35rem] border border-white/12 bg-[#050c16] shadow-[0_34px_96px_rgba(2,6,23,0.82)] sm:rounded-[1.6rem]"
            >
              <ContactInboxPanel
                data={panelData ?? summary}
                loading={loading && !(panelData ?? summary)}
                error={error}
                body={body}
                sendPending={sendPending}
                mode="popover"
                onBodyChange={(value) => {
                  setBody(value);
                  scheduleTypingState(value);
                }}
                onInboxAction={async (action) => {
                  setError(null);
                  try {
                    const response = await fetch("/api/contact-emaren", {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        targetUid: selectedTargetUidRef.current,
                        ...action,
                      }),
                    });

                    const payload = (await response.json().catch(() => ({}))) as
                      | ContactInboxPayload
                      | { detail?: string };

                    if (!response.ok) {
                      throw new Error(readDetail(payload) || "Inbox action failed.");
                    }

                    panelRequestIdRef.current += 1;
                    const removedMessageId =
                      action.action === "delete_message" && typeof action.messageId === "number"
                        ? action.messageId
                        : null;
                    applyInboxPayload(payload as ContactInboxPayload, {
                      mode: "refresh",
                      removeMessageIds: removedMessageId ? [removedMessageId] : undefined,
                    });
                  } catch (actionError) {
                    setError(
                      actionError instanceof Error ? actionError.message : "Inbox action failed."
                    );
                  }
                }}
                onChallengeAction={(payload) => {
                  void handleChallengeAction(payload);
                }}
                challengeActionState={challengeActionState}
                onSelectConversation={(targetUid) => {
                  applySelectedTargetUid(targetUid);
                  setReplyingTo(null);
                  draftHydratedTargetRef.current = null;
                  const cachedPayload = panelCacheRef.current.get(targetUid) ?? null;
                  setPanelData(cachedPayload);
                  setBody(cachedPayload?.draft?.body ?? "");
                  if (cachedPayload) draftHydratedTargetRef.current = targetUid;
                  void refreshPanel(targetUid, { silent: Boolean(cachedPayload) });
                }}
                onSend={async () => {
                  if (!body.trim()) return;
                  const optimisticKey = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                  const currentData = panelData ?? summary;
                  const optimisticMessage: ContactTextMessage | null = currentData?.viewer ? {
                    id: optimisticKey,
                    messageId: -Date.now(),
                    kind: "text",
                    createdAt: new Date().toISOString(),
                    sender: { uid: currentData.viewer.uid, displayName: currentData.viewer.displayName, isAdmin: currentData.viewer.isAdmin, badges: [] },
                    receipt: { status: "sending", deliveredAt: null, readAt: null },
                    body,
                    attachment: null,
                    reactions: [],
                    sharedLobbyMessageId: null,
                    replyTo: replyingTo ? {
                      messageId: replyingTo.messageId,
                      senderName: replyingTo.sender.displayName,
                      body: replyingTo.body || replyingTo.transcription || "Attachment",
                      attachment: replyingTo.attachment,
                    } : null,
                    isPinned: false,
                    editedAt: null,
                    transcription: null,
                    transcriptionStatus: null,
                    translations: [],
                    replayCard: null,
                    optimisticKey,
                  } : null;
                  if (optimisticMessage) setPanelData((current) => current ? { ...current, messages: [...current.messages, optimisticMessage] } : current);
                  setSendPending(true);
                  setError(null);

                  try {
                    const response = await fetch("/api/contact-emaren", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        targetUid: selectedTargetUidRef.current,
                        body,
                        replyToMessageId: replyingTo?.messageId ?? null,
                      }),
                    });

                    const payload = (await response.json().catch(() => ({}))) as
                      | ContactInboxPayload
                      | { detail?: string };

                    if (!response.ok) {
                      throw new Error(readDetail(payload) || "Message failed.");
                    }

                    setBody("");
                    setReplyingTo(null);
                    void sendTypingState(false);
                    panelRequestIdRef.current += 1;
                    applyInboxPayload(payload as ContactInboxPayload, {
                      mode: "refresh",
                      dropOptimistic: true,
                    });
                  } catch (sendError) {
                    setError(sendError instanceof Error ? sendError.message : "Message failed.");
                    setPanelData((current) => current ? { ...current, messages: current.messages.map((message) => message.kind === "text" && message.optimisticKey === optimisticKey ? { ...message, receipt: { status: "failed", deliveredAt: null, readAt: null } } : message) } : current);
                  } finally {
                    setSendPending(false);
                  }
                }}
                onToggleReaction={async (messageId, emoji) => {
                  const targetUidAtAction =
                    selectedTargetUidRef.current;

                  setReactingMessageId(messageId);
                  setError(null);

                  setPanelData((current) => {
                    const base =
                      current ??
                      (
                        summary?.activeTargetUid ===
                        targetUidAtAction
                          ? summary
                          : null
                      );

                    if (!base) {
                      return current;
                    }

                    const optimistic =
                      optimisticallyToggleContactReaction(
                        base,
                        messageId,
                        emoji,
                      );

                    if (targetUidAtAction) {
                      panelCacheRef.current.set(
                        targetUidAtAction,
                        optimistic,
                      );
                    }

                    return optimistic;
                  });

                  try {
                    const response = await fetch(
                      "/api/contact-emaren",
                      {
                        method: "PATCH",
                        headers: {
                          "Content-Type":
                            "application/json",
                        },
                        body: JSON.stringify({
                          action: "toggle_reaction",
                          targetUid:
                            targetUidAtAction,
                          messageId,
                          emoji,
                        }),
                      },
                    );

                    const payload =
                      (await response
                        .json()
                        .catch(() => ({}))) as
                        | ContactInboxPayload
                        | { detail?: string };

                    if (!response.ok) {
                      throw new Error(
                        readDetail(payload) ||
                          "Reaction failed.",
                      );
                    }

                    if (
                      selectedTargetUidRef.current !==
                      targetUidAtAction
                    ) {
                      return;
                    }

                    panelRequestIdRef.current += 1;

                    applyInboxPayload(
                      payload as ContactInboxPayload,
                      { mode: "refresh" },
                    );
                  } catch (reactionError) {
                    setError(
                      reactionError instanceof Error
                        ? reactionError.message
                        : "Reaction failed.",
                    );

                    if (
                      selectedTargetUidRef.current ===
                      targetUidAtAction
                    ) {
                      void refreshPanel(
                        targetUidAtAction,
                        { silent: true },
                      );
                    }
                  } finally {
                    setReactingMessageId(null);
                  }
                }}
                reactingMessageId={reactingMessageId}
                onLoadOlder={async () => {
                  const current = panelData ?? summary;
                  const before = current?.messagePage.beforeMessageId;
                  const target = selectedTargetUidRef.current;
                  if (!before || !target) return false;
                  const older = await requestInbox(target, false, before);
                  if (
                    selectedTargetUidRef.current !== target ||
                    older.activeTargetUid !== target
                  ) {
                    return false;
                  }
                  applyInboxPayload(older, { mode: "prepend" });
                  return true;
                }}
                onRefresh={() => refreshPanel(undefined, { silent: true }).then(() => undefined)}
                replyingTo={replyingTo}
                onReply={(message) => setReplyingTo(message)}
                onCancelReply={() => setReplyingTo(null)}
                onRetryOptimistic={(message) => {
                  setPanelData((current) => current ? { ...current, messages: current.messages.filter((item) => item.id !== message.id) } : current);
                  window.setTimeout(() => {
                    panelRef.current?.querySelector<HTMLButtonElement>("[data-contact-send='true']")?.click();
                  }, 0);
                }}
                openPageHref={openPageHref}
                onOpenFullPage={() => setOpen(false)}
              />
            </div>
          </div>
        </>,
        document.body
      ) : null}
    </>
  );
}
