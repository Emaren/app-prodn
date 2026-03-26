"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import ContactInboxPanel from "@/components/contact/ContactInboxPanel";
import type { ContactInboxPayload } from "@/components/contact/types";
import { useUserAuth } from "@/context/UserAuthContext";
import SteamLoginButton from "@/components/SteamLoginButton";

function readDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const detail = "detail" in payload ? payload.detail : null;
  return typeof detail === "string" ? detail : null;
}

async function requestInbox(targetUid?: string | null) {
  const params = new URLSearchParams();
  if (targetUid) {
    params.set("user", targetUid);
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
  const searchParams = useSearchParams();
  const requestedUser = searchParams?.get("user") ?? null;
  const { uid, isAuthenticated, loading } = useUserAuth();
  const [data, setData] = useState<ContactInboxPayload | null>(null);
  const [selectedTargetUid, setSelectedTargetUid] = useState<string | null>(requestedUser);
  const [body, setBody] = useState("");
  const [sendPending, setSendPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (targetUid?: string | null, options?: { silent?: boolean }) => {
      if (!uid) return;
      const silent = Boolean(options?.silent);
      if (!silent) {
        setPending(true);
        setError(null);
      }
      try {
        const payload = await requestInbox(targetUid ?? selectedTargetUid ?? undefined);
        setData(payload);
        setSelectedTargetUid(payload.activeTargetUid);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Inbox failed.");
      } finally {
        if (!silent) {
          setPending(false);
        }
      }
    },
    [selectedTargetUid, uid]
  );

  useEffect(() => {
    if (!uid) return;
    void refresh(requestedUser);
  }, [refresh, requestedUser, uid]);

  useEffect(() => {
    if (!uid) return;
    const interval = window.setInterval(() => {
      void refresh(undefined, { silent: true });
    }, 12_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refresh, uid]);

  if (loading) {
    return (
      <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 px-6 py-10 text-white">
        Loading your direct line...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 px-6 py-10 text-white">
        <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Contact Emaren</div>
        <h1 className="mt-3 text-3xl font-semibold text-white">Sign in to open the private line.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Steam sign-in keeps the conversation tied to a real AoE2HDBets identity, which makes the
          first wave of community contact feel personal instead of anonymous.
        </p>
        <div className="mt-6">
          <SteamLoginButton className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200" />
        </div>
      </div>
    );
  }

  return (
    <ContactInboxPanel
      data={data}
      loading={pending && !data}
      error={error}
      body={body}
      sendPending={sendPending}
      mode="page"
      onBodyChange={setBody}
      onSelectConversation={(targetUid) => {
        setSelectedTargetUid(targetUid);
        void refresh(targetUid);
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
          setData(payload as ContactInboxPayload);
          setSelectedTargetUid((payload as ContactInboxPayload).activeTargetUid);
        } catch (sendError) {
          setError(sendError instanceof Error ? sendError.message : "Message failed.");
        } finally {
          setSendPending(false);
        }
      }}
    />
  );
}
