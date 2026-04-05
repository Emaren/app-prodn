"use client";

import { MessageSquareMore, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ContactInboxPanel from "@/components/contact/ContactInboxPanel";
import type {
  ContactChallengeActionKind,
  ContactChallengeActionState,
  ContactInboxPayload,
} from "@/components/contact/types";
import { useUserAuth } from "@/context/UserAuthContext";
import { useClickOutside } from "@/hooks/useClickOutside";

function readDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const detail = "detail" in payload ? payload.detail : null;
  return typeof detail === "string" ? detail : null;
}

async function requestInbox(targetUid?: string | null, summaryOnly?: boolean) {
  const params = new URLSearchParams();
  if (targetUid) {
    params.set("user", targetUid);
  }
  if (summaryOnly) {
    params.set("summary", "1");
  }

  const response = await fetch(
    `/api/contact-emaren${params.size > 0 ? `?${params.toString()}` : ""}`,
    {
      cache: "no-store",
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
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedTargetUidRef = useRef<string | null>(null);

  useClickOutside(panelRef as React.RefObject<HTMLElement>, () => setOpen(false));

  const applySelectedTargetUid = useCallback((targetUid: string | null) => {
    selectedTargetUidRef.current = targetUid;
    setSelectedTargetUid(targetUid);
  }, []);

  const applyInboxPayload = useCallback(
    (payload: ContactInboxPayload) => {
      setPanelData(payload);
      setSummary(payload);
      applySelectedTargetUid(payload.activeTargetUid);
    },
    [applySelectedTargetUid]
  );

  const refreshSummary = useCallback(async (targetUid?: string | null) => {
    if (!uid) return null;

    try {
      const payload = await requestInbox(targetUid ?? selectedTargetUidRef.current ?? undefined, true);
      setSummary(payload);
      if (!selectedTargetUidRef.current || targetUid) {
        applySelectedTargetUid(payload.activeTargetUid);
      }
      return payload;
    } catch (fetchError) {
      console.warn("Failed to refresh inbox summary:", fetchError);
      return null;
    }
  }, [applySelectedTargetUid, uid]);

  const refreshPanel = useCallback(
    async (targetUid?: string | null, options?: { silent?: boolean }) => {
      if (!uid) return null;
      const silent = Boolean(options?.silent);

      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const payload = await requestInbox(targetUid ?? selectedTargetUidRef.current ?? undefined, false);
        applyInboxPayload(payload);
        return payload;
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Inbox failed.");
        return null;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [applyInboxPayload, uid]
  );

  useEffect(() => {
    if (!uid || open) return;

    void refreshSummary();
    const interval = window.setInterval(() => {
      void refreshSummary();
    }, 5_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [open, refreshSummary, uid]);

  useEffect(() => {
    if (!open || !uid) return;

    void refreshPanel(selectedTargetUidRef.current);
    const interval = window.setInterval(() => {
      void refreshPanel(undefined, { silent: true });
    }, 4_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [open, refreshPanel, uid]);

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
          }),
        });

        const nextPayload = (await response.json().catch(() => ({}))) as { detail?: string };
        if (!response.ok) {
          throw new Error(readDetail(nextPayload) || "Challenge action failed.");
        }

        await refreshPanel(selectedTargetUidRef.current);
      } catch (challengeError) {
        setError(
          challengeError instanceof Error ? challengeError.message : "Challenge action failed."
        );
      } finally {
        setChallengeActionState({
          challengeId: null,
          action: null,
        });
      }
    },
    [refreshPanel]
  );

  if (!uid) {
    return null;
  }

  return (
    <div className={`relative ${open ? "z-[120]" : "z-10"}`} ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
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

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close inbox overlay"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-[#02060f]/78 backdrop-blur-[2px] sm:hidden"
          />

          <div className="fixed inset-x-3 top-[5.75rem] z-[140] h-[min(35rem,calc(100dvh-8.5rem))] sm:absolute sm:inset-x-auto sm:right-0 sm:top-14 sm:h-[min(38rem,calc(100dvh-6.5rem))] sm:w-[29.5rem] sm:max-w-[calc(100vw-2rem)]">
            <div className="mb-2 flex justify-end sm:hidden">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0b1324]/90 text-slate-300 transition hover:border-white/20 hover:text-white"
                aria-label="Close inbox"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="h-[calc(100%-2.75rem)] min-h-0 overflow-hidden rounded-[1.6rem] border border-white/12 bg-[#050c16] shadow-[0_34px_96px_rgba(2,6,23,0.82)] sm:h-full">
              <ContactInboxPanel
                data={panelData ?? summary}
                loading={loading && !(panelData ?? summary)}
                error={error}
                body={body}
                sendPending={sendPending}
                mode="popover"
                onBodyChange={setBody}
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

                    applyInboxPayload(payload as ContactInboxPayload);
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
                  void refreshPanel(targetUid);
                }}
                onSend={async () => {
                  if (!body.trim()) return;
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
                      }),
                    });

                    const payload = (await response.json().catch(() => ({}))) as
                      | ContactInboxPayload
                      | { detail?: string };

                    if (!response.ok) {
                      throw new Error(readDetail(payload) || "Message failed.");
                    }

                    setBody("");
                    applyInboxPayload(payload as ContactInboxPayload);
                  } catch (sendError) {
                    setError(sendError instanceof Error ? sendError.message : "Message failed.");
                  } finally {
                    setSendPending(false);
                  }
                }}
                onToggleReaction={async (messageId, emoji) => {
                  setReactingMessageId(messageId);
                  setError(null);

                  try {
                    const response = await fetch("/api/contact-emaren", {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        action: "toggle_reaction",
                        targetUid: selectedTargetUidRef.current,
                        messageId,
                        emoji,
                      }),
                    });

                    const payload = (await response.json().catch(() => ({}))) as
                      | ContactInboxPayload
                      | { detail?: string };

                    if (!response.ok) {
                      throw new Error(readDetail(payload) || "Reaction failed.");
                    }

                    applyInboxPayload(payload as ContactInboxPayload);
                  } catch (reactionError) {
                    setError(
                      reactionError instanceof Error ? reactionError.message : "Reaction failed."
                    );
                  } finally {
                    setReactingMessageId(null);
                  }
                }}
                reactingMessageId={reactingMessageId}
                openPageHref={openPageHref}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
