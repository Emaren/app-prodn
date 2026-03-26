"use client";

import { MessageSquareMore } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ContactInboxPanel from "@/components/contact/ContactInboxPanel";
import type { ContactInboxPayload } from "@/components/contact/types";
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

export default function HeaderInboxControl() {
  const { uid } = useUserAuth();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ContactInboxPayload | null>(null);
  const [panelData, setPanelData] = useState<ContactInboxPayload | null>(null);
  const [selectedTargetUid, setSelectedTargetUid] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendPending, setSendPending] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useClickOutside(panelRef as React.RefObject<HTMLElement>, () => setOpen(false));

  const refreshSummary = useCallback(async () => {
    if (!uid) return;
    try {
      const payload = await requestInbox(selectedTargetUid, true);
      setSummary(payload);
    } catch (fetchError) {
      console.warn("Failed to refresh inbox summary:", fetchError);
    }
  }, [selectedTargetUid, uid]);

  const refreshPanel = useCallback(
    async (targetUid?: string | null) => {
      if (!uid) return;
      setLoading(true);
      setError(null);
      try {
        const payload = await requestInbox(targetUid ?? selectedTargetUid ?? undefined, false);
        setPanelData(payload);
        setSummary(payload);
        setSelectedTargetUid(payload.activeTargetUid);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Inbox failed.");
      } finally {
        setLoading(false);
      }
    },
    [selectedTargetUid, uid]
  );

  useEffect(() => {
    if (!uid) return;

    void refreshSummary();
    const interval = window.setInterval(() => {
      void refreshSummary();
    }, 15_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshSummary, uid]);

  useEffect(() => {
    if (!open || !uid) return;

    void refreshPanel(selectedTargetUid);
    const interval = window.setInterval(() => {
      void refreshPanel(selectedTargetUid);
    }, 10_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [open, refreshPanel, selectedTargetUid, uid]);

  const unreadCount = summary?.totalUnreadCount ?? 0;
  const openPageHref = useMemo(() => {
    if (!selectedTargetUid) return "/contact-emaren";
    return `/contact-emaren?user=${encodeURIComponent(selectedTargetUid)}`;
  }, [selectedTargetUid]);

  if (!uid) {
    return null;
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/30 hover:bg-white/10"
        aria-label="Open Contact Emaren inbox"
      >
        <MessageSquareMore className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-14 z-50">
          <ContactInboxPanel
            data={panelData ?? summary}
            loading={loading}
            error={error}
            body={body}
            sendPending={sendPending}
            mode="popover"
            onBodyChange={setBody}
            onSelectConversation={(targetUid) => {
              setSelectedTargetUid(targetUid);
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
                    targetUid: selectedTargetUid,
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
                setPanelData(payload as ContactInboxPayload);
                setSummary(payload as ContactInboxPayload);
                setSelectedTargetUid((payload as ContactInboxPayload).activeTargetUid);
              } catch (sendError) {
                setError(sendError instanceof Error ? sendError.message : "Message failed.");
              } finally {
                setSendPending(false);
              }
            }}
            openPageHref={openPageHref}
          />
        </div>
      ) : null}
    </div>
  );
}
