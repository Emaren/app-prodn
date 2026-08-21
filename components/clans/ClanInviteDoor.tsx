"use client";

import {
  Check,
  Copy,
  DoorOpen,
  Search,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type InviteSearchResult = {
  uid: string;
  displayName: string;
  alreadyMember: boolean;
};

type InvitePayload = {
  messageId: number;
  clanName: string;
  clanSlug: string;
  inviterName: string;
  status: "pending" | "accepted" | "declined";
  canAccept: boolean;
};

export function ClanInvitePrompt({
  slug,
  clanName,
}: {
  slug: string;
  clanName: string;
}) {
  const [inviteId, setInviteId] = useState<number | null>(null);
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("invite");
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return;
    setInviteId(parsed);
  }, []);

  useEffect(() => {
    if (!inviteId) return;
    const controller = new AbortController();

    void fetch(
      `/api/clans/${encodeURIComponent(slug)}/invites?messageId=${inviteId}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | InvitePayload
          | { detail?: string }
          | null;
        if (!response.ok || !payload || !("messageId" in payload)) {
          throw new Error(
            payload && "detail" in payload && payload.detail
              ? payload.detail
              : "Invitation unavailable.",
          );
        }
        setInvite(payload);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Invitation unavailable.",
        );
      });

    return () => controller.abort();
  }, [inviteId, slug]);

  if (!inviteId) return null;

  async function act(action: "accept" | "decline") {
    if (!invite || busy) return;
    setBusy(action);
    setError(null);

    try {
      const response = await fetch(
        `/api/clans/${encodeURIComponent(slug)}/invites`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, messageId: invite.messageId }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; detail?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.detail || "Invitation action failed.");
      }
      window.location.replace(`/clans/${encodeURIComponent(slug)}`);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Invitation action failed.",
      );
      setBusy(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-[1.7rem] border border-amber-200/20 bg-[radial-gradient(circle_at_10%_0%,rgba(251,191,36,0.12),transparent_35%),rgba(10,8,5,0.88)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200/18 bg-amber-300/10 text-amber-100">
          <DoorOpen className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/70">
            Hall invitation
          </div>
          <div className="mt-1 text-lg font-black text-white">
            {invite
              ? `${invite.inviterName} invited you to ${invite.clanName}.`
              : `Opening ${clanName} invitation…`}
          </div>
        </div>
        {invite?.status === "pending" && invite.canAccept ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void act("decline")}
              disabled={Boolean(busy)}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/20 text-slate-300 transition hover:border-red-200/25 hover:text-red-100 disabled:opacity-40"
              title="Decline"
              aria-label="Decline clan invitation"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void act("accept")}
              disabled={Boolean(busy)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              Enter Hall
            </button>
          </div>
        ) : null}
      </div>
      {invite && invite.status !== "pending" ? (
        <div className="mt-3 text-sm text-slate-300">
          Invitation {invite.status}.
        </div>
      ) : null}
      {error ? <div className="mt-3 text-sm text-red-200">{error}</div> : null}
    </section>
  );
}

export function ClanInviteDoor({
  slug,
  enabled,
}: {
  slug: string;
  clanName: string;
  enabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InviteSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingUid, setSendingUid] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [sentUids, setSentUids] = useState<Set<string>>(
    () => new Set(),
  );
  const doorRef = useRef<HTMLElement | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (!enabled || !browseOpen) {
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(
        `/api/clans/${encodeURIComponent(slug)}/invite-search?q=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as
            | { results?: InviteSearchResult[]; detail?: string }
            | null;
          if (!response.ok) {
            throw new Error(payload?.detail || "Roster unavailable.");
          }
          setResults(payload?.results || []);
          setError(null);
        })
        .catch((searchError) => {
          if (controller.signal.aborted) return;
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Roster unavailable.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, trimmed ? 120 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [browseOpen, enabled, slug, trimmed]);

  const hallLink = useMemo(() => {
    if (typeof window === "undefined") return `/clans/${slug}`;
    return `${window.location.origin}/clans/${encodeURIComponent(slug)}`;
  }, [slug]);

  if (!enabled) return null;

  async function sendInvite(target: InviteSearchResult) {
    if (sendingUid || target.alreadyMember) return;
    setSendingUid(target.uid);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/clans/${encodeURIComponent(slug)}/invites`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send", targetUid: target.uid }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; targetName?: string; detail?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.detail || "Invitation failed.");
      }
      setNotice(`Invitation sent to ${payload.targetName || target.displayName}.`);
      setSentUids((current) => {
        const next = new Set(current);
        next.add(target.uid);
        return next;
      });
      setQuery("");
    } catch (inviteError) {
      setError(
        inviteError instanceof Error ? inviteError.message : "Invitation failed.",
      );
    } finally {
      setSendingUid(null);
    }
  }

  async function copyHallLink() {
    try {
      await navigator.clipboard.writeText(hallLink);
      setNotice("Hall link copied.");
      setError(null);
    } catch {
      setError("Could not copy the Hall link.");
    }
  }

  return (
    <section
      ref={doorRef}
      className="rounded-[1.6rem] border border-amber-200/14 bg-[radial-gradient(circle_at_90%_0%,rgba(251,191,36,0.09),transparent_38%),rgba(8,8,8,0.28)] p-4"
      onMouseEnter={() => setBrowseOpen(true)}
      onMouseLeave={() => {
        if (
          doorRef.current?.contains(document.activeElement)
        ) {
          return;
        }
        setBrowseOpen(false);
      }}
      onFocusCapture={() => setBrowseOpen(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (
          next instanceof Node &&
          event.currentTarget.contains(next)
        ) {
          return;
        }
        setBrowseOpen(false);
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-amber-200/70">
          <UserPlus className="h-4 w-4" />
          Invite Door
        </div>
        <button
          type="button"
          onClick={() => void copyHallLink()}
          className="grid h-8 w-8 place-items-center rounded-full border border-white/9 bg-white/[0.035] text-slate-400 transition hover:border-amber-200/20 hover:text-amber-100"
          title="Copy Hall link"
          aria-label="Copy Hall link"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/9 bg-black/20 px-3">
        <Search className="h-4 w-4 shrink-0 text-slate-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or browse warriors…"
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
        />
      </div>

      {browseOpen ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-slate-500">
          <span>
            {trimmed ? "Filtered warriors" : "AoE2WAR warriors"}
          </span>
          <span className="tabular-nums text-amber-100/65">
            {searching
              ? "Loading…"
              : `${results.filter((result) => !sentUids.has(result.uid)).length} available`}
          </span>
        </div>
      ) : (
        <div className="mt-3 text-[10px] leading-4 text-slate-600">
          Hover or focus to browse every eligible warrior. Type only when you want to narrow the roster.
        </div>
      )}

      {browseOpen && results.length > 0 ? (
        <div className="mt-2 max-h-[18rem] space-y-1.5 overflow-y-auto pr-1 [scrollbar-color:rgba(148,163,184,0.3)_transparent] [scrollbar-width:thin]">
          {results.map((result) => {
            const sent = sentUids.has(result.uid);

            return (
              <div
                key={result.uid}
                className="flex items-center gap-2 rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">
                    {result.displayName}
                  </div>
                  <div className="truncate text-[10px] text-slate-600">
                    {sent ? "Invitation sent" : "Ready for Hall invitation"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void sendInvite(result)}
                  disabled={
                    result.alreadyMember ||
                    sent ||
                    Boolean(sendingUid)
                  }
                  className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 text-[10px] font-semibold text-slate-300 transition hover:border-amber-200/24 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                  title={
                    result.alreadyMember
                      ? "Already in clan"
                      : sent
                        ? "Invitation sent"
                        : `Invite ${result.displayName}`
                  }
                  aria-label={`Invite ${result.displayName}`}
                >
                  {result.alreadyMember || sent ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Sent</span>
                    </>
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : browseOpen && !searching ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/9 px-3 py-4 text-center text-xs text-slate-500">
          {trimmed
            ? "No eligible warriors match that search."
            : "No eligible warriors are waiting outside this Hall."}
        </div>
      ) : null}

      {notice ? <div className="mt-3 text-xs leading-5 text-emerald-200">{notice}</div> : null}
      {error ? <div className="mt-3 text-xs leading-5 text-red-200">{error}</div> : null}
      <div className="mt-3 text-[10px] leading-4 text-slate-600">
        On-site invitations arrive in private chat with a direct Enter Hall link.
      </div>
    </section>
  );
}
