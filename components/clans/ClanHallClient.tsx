"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Crown,
  Eye,
  Globe2,
  Languages,
  LockKeyhole,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  Shield,
  SmilePlus,
  Sparkles,
  Swords,
  Trash2,
  UserRoundCheck,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { useUserAuth } from "@/context/UserAuthContext";
import { useUniversalLanguage } from "@/context/UniversalLanguageContext";
import ClanDisplayRail from "@/components/clans/ClanDisplayRail";
import ClanChatViewPicker from "@/components/clans/ClanChatViewPicker";
import { useClanChatViewPreference } from "@/components/clans/clanChatViewPreference";
import { usePublicPresence } from "@/components/presence/PublicPresenceProvider";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import { ClanInviteDoor, ClanInvitePrompt } from "@/components/clans/ClanInviteDoor";
import { clanHallFeatureEnabled } from "@/lib/clanHallFeatures";
import { formatClanRole } from "@/lib/clanRoles";
import {
  UNIVERSAL_LANGUAGES,
  findUniversalLanguage,
  type UniversalLanguageCode,
} from "@/lib/i18n/languages";
import {
  CLAN_AUDIENCES,
  CLAN_AUDIENCE_DETAILS,
  CLAN_REACTIONS,
  type ClanAudience,
  type ClanHallSnapshot,
  type ClanReaction,
  type ClanViewMode,
} from "@/lib/clans";

const BASELINE_POLL_INTERVAL_MS = 10_000;
const REALTIME_SAFETY_POLL_INTERVAL_MS = 60_000;

type PendingClanMessage = {
  id: string;
  body: string;
  audience: ClanAudience;
  requestScribe: boolean;
  status: "sending" | "failed";
};

type HallPresenceUser = {
  uid: string;
  displayName: string;
  lastSeenAt: string;
};

function initials(value: string) {
  const parts = value
    .replace(/[\[\]_,.-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function formatMessageTime(value: string, mounted: boolean) {
  void mounted;
  return <TimeDisplayText value={value} emptyValue="" />;
}

function preferredAudience(allowed: ClanAudience[]) {
  if (allowed.includes("clan")) return "clan";
  if (allowed.includes("users")) return "users";
  return allowed[0] || "public";
}

function audienceIcon(audience: ClanAudience) {
  if (audience === "public") return Globe2;
  if (audience === "users") return Users;
  return LockKeyhole;
}

function audienceTone(audience: ClanAudience) {
  if (audience === "public") {
    return "border-sky-200/18 bg-sky-300/10 text-sky-100";
  }
  if (audience === "users") {
    return "border-red-200/18 bg-red-300/10 text-red-100";
  }
  return "border-amber-200/18 bg-amber-300/10 text-amber-100";
}

function resolveClanTranslationLanguage(
  selectedLanguage: UniversalLanguageCode | null,
  languageLoaded: boolean,
): UniversalLanguageCode {
  if (selectedLanguage) {
    return selectedLanguage;
  }

  if (
    !languageLoaded ||
    typeof navigator === "undefined"
  ) {
    return "en";
  }

  const browserLanguages =
    navigator.languages?.length
      ? navigator.languages
      : [navigator.language];

  for (
    const browserLanguage
    of browserLanguages
  ) {
    const normalized =
      browserLanguage
        .trim()
        .toLowerCase();

    const exact =
      UNIVERSAL_LANGUAGES.find(
        (language) =>
          language.code
            .toLowerCase() ===
            normalized ||
          language.htmlLang
            .toLowerCase() ===
            normalized,
      );

    if (exact) {
      return exact.code;
    }

    const base =
      normalized.split("-")[0];

    const baseMatch =
      UNIVERSAL_LANGUAGES.find(
        (language) =>
          language.code
            .toLowerCase()
            .split("-")[0] ===
          base,
      );

    if (baseMatch) {
      return baseMatch.code;
    }
  }

  return "en";
}

function shouldGroupClanMessage(
  previous: ClanHallSnapshot["messages"][number] | null,
  current: ClanHallSnapshot["messages"][number],
) {
  if (!previous) return false;
  if (
    previous.author.uid !== current.author.uid ||
    previous.audience !== current.audience
  ) {
    return false;
  }

  const previousTime =
    new Date(previous.createdAt).getTime();
  const currentTime =
    new Date(current.createdAt).getTime();

  if (
    !Number.isFinite(previousTime) ||
    !Number.isFinite(currentTime)
  ) {
    return false;
  }

  return (
    Math.abs(
      currentTime - previousTime,
    ) <=
    5 * 60 * 1000
  );
}

export default function ClanHallClient({
  initialSnapshot,
  initialView,
}: {
  initialSnapshot: ClanHallSnapshot;
  initialView: ClanViewMode;
}) {
  const { uid, loading, loginWithSteam } = useUserAuth();
  const {
    selectedLanguage,
    languageLoaded,
  } = useUniversalLanguage();
  const { chatViewMode } = useClanChatViewPreference();
  const { onlineUidSet } = usePublicPresence([]);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [hallPresence, setHallPresence] = useState<HallPresenceUser[]>([]);
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState("");
  const [scribeReplyEnabled, setScribeReplyEnabled] = useState(false);
  const [audience, setAudience] = useState<ClanAudience>(() =>
    preferredAudience(initialSnapshot.allowedAudiences)
  );
  const [posting, setPosting] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [messageActionBusy, setMessageActionBusy] = useState<string | null>(
    null
  );
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<
    PendingClanMessage[]
  >([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const requestInFlightRef = useRef(false);

  const endpoint = `/api/clans/${encodeURIComponent(snapshot.clan.slug)}`;
  const presenceEndpoint = `${endpoint}/presence`;
  const translationLanguage =
    resolveClanTranslationLanguage(
      selectedLanguage,
      languageLoaded,
    );
  const realtimeEnabled = clanHallFeatureEnabled(
    snapshot.clan.slug,
    "realtime",
  );
  const optimisticMessagesEnabled = clanHallFeatureEnabled(
    snapshot.clan.slug,
    "optimisticMessages",
  );
  const hallScribeEnabled = clanHallFeatureEnabled(
    snapshot.clan.slug,
    "hallScribe",
  );

  const settleChatToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    window.requestAnimationFrame(() => {
      const node = chatViewportRef.current;
      if (!node) return;
      node.scrollTo({ top: node.scrollHeight, behavior });
    });
  }, []);

  const refresh = useCallback(async () => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as ClanHallSnapshot;
      setSnapshot(payload);
    } catch (refreshError) {
      console.warn("Failed to refresh clan hall:", refreshError);
    } finally {
      requestInFlightRef.current = false;
    }
  }, [endpoint]);

  useEffect(() => {
    setMounted(true);
    settleChatToBottom();
  }, [settleChatToBottom]);

  useEffect(() => {
    void refresh();

    if (!realtimeEnabled) {
      setLiveConnected(false);
      const interval = window.setInterval(() => {
        void refresh();
      }, BASELINE_POLL_INTERVAL_MS);
      return () => window.clearInterval(interval);
    }

    const eventSource = new EventSource(`${endpoint}/events`);
    const safetyInterval = window.setInterval(() => {
      void refresh();
    }, REALTIME_SAFETY_POLL_INTERVAL_MS);

    const markReady = () => setLiveConnected(true);
    const refreshFromHall = () => {
      setLiveConnected(true);
      void refresh();
    };

    eventSource.addEventListener("ready", markReady);
    eventSource.addEventListener("hall", refreshFromHall);
    eventSource.onerror = () => setLiveConnected(false);

    return () => {
      window.clearInterval(safetyInterval);
      eventSource.removeEventListener("ready", markReady);
      eventSource.removeEventListener("hall", refreshFromHall);
      eventSource.close();
      setLiveConnected(false);
    };
  }, [endpoint, realtimeEnabled, refresh, uid]);

  useEffect(() => {
    if (!snapshot.viewer.authenticated || !uid) {
      setHallPresence([]);
      return;
    }

    let disposed = false;

    async function syncHallPresence() {
      if (
        document.visibilityState !== "visible"
      ) {
        return;
      }

      try {
        const response = await fetch(
          presenceEndpoint,
          {
            method: "POST",
            cache: "no-store",
          },
        );

        if (!response.ok) return;

        const payload =
          (await response.json().catch(
            () => null,
          )) as
            | {
                users?: HallPresenceUser[];
              }
            | null;

        if (
          !disposed &&
          Array.isArray(
            payload?.users,
          )
        ) {
          setHallPresence(
            payload?.users ?? [],
          );
        }
      } catch {
        // Presence is supplemental. Hall chat remains usable if it is unavailable.
      }
    }

    const refreshIfVisible = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void syncHallPresence();
      }
    };

    void syncHallPresence();

    const interval =
      window.setInterval(
        refreshIfVisible,
        10_000,
      );

    window.addEventListener(
      "focus",
      refreshIfVisible,
    );
    document.addEventListener(
      "visibilitychange",
      refreshIfVisible,
    );

    return () => {
      disposed = true;
      window.clearInterval(
        interval,
      );
      window.removeEventListener(
        "focus",
        refreshIfVisible,
      );
      document.removeEventListener(
        "visibilitychange",
        refreshIfVisible,
      );

      void fetch(
        presenceEndpoint,
        {
          method: "DELETE",
          keepalive: true,
        },
      ).catch(() => {});
    };
  }, [
    presenceEndpoint,
    snapshot.viewer.authenticated,
    uid,
  ]);

  useEffect(() => {
    if (!snapshot.allowedAudiences.includes(audience)) {
      setAudience(preferredAudience(snapshot.allowedAudiences));
    }
  }, [audience, snapshot.allowedAudiences]);

  useEffect(() => {
    settleChatToBottom();
  }, [settleChatToBottom, snapshot.messages.length]);

  async function sendMessageDraft(
    draft: string,
    draftAudience: ClanAudience,
    pendingId: string,
    requestScribe: boolean,
  ) {
    setPosting(true);
    setError(null);
    setNotice(null);

    setPendingMessages((current) =>
      current.map((entry) =>
        entry.id === pendingId
          ? { ...entry, status: "sending" }
          : entry,
      ),
    );

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: draft,
          audience: draftAudience,
          scribe: requestScribe,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ClanHallSnapshot
        | { detail?: string }
        | null;

      if (!response.ok || !payload || !("clan" in payload)) {
        throw new Error(
          payload && "detail" in payload && payload.detail
            ? payload.detail
            : "Message could not be posted.",
        );
      }

      setSnapshot(payload);
      setPendingMessages((current) =>
        current.filter((entry) => entry.id !== pendingId),
      );
      if (!optimisticMessagesEnabled) {
        setMessage("");
      }
      setNotice(
        `Posted for ${CLAN_AUDIENCE_DETAILS[draftAudience].label}.`,
      );
      settleChatToBottom("smooth");
    } catch (postError) {
      setPendingMessages((current) =>
        current.map((entry) =>
          entry.id === pendingId
            ? { ...entry, status: "failed" }
            : entry,
        ),
      );
      setError(
        postError instanceof Error
          ? postError.message
          : "Message could not be posted.",
      );
    } finally {
      setPosting(false);
    }
  }

  async function postMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const draft = message.trim();
    if (posting || !draft) return;

    const pendingId =
      `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const requestScribe =
      hallScribeEnabled &&
      scribeReplyEnabled;

    if (optimisticMessagesEnabled) {
      setPendingMessages((current) => [
        ...current,
        {
          id: pendingId,
          body: draft,
          audience,
          requestScribe,
          status: "sending",
        },
      ]);
      setMessage("");
      settleChatToBottom("smooth");
    }

    setScribeReplyEnabled(false);
    await sendMessageDraft(
      draft,
      audience,
      pendingId,
      requestScribe,
    );
  }

  function retryPendingMessage(pending: PendingClanMessage) {
    if (posting) return;
    void sendMessageDraft(
      pending.body,
      pending.audience,
      pending.id,
      pending.requestScribe,
    );
  }

  function dismissPendingMessage(pendingId: string) {
    setPendingMessages((current) =>
      current.filter((entry) => entry.id !== pendingId),
    );
  }

  async function updatePolicy(nextPolicy: ClanAudience) {
    if (policyBusy || nextPolicy === snapshot.clan.chatAudiencePolicy) return;

    setPolicyBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatAudiencePolicy: nextPolicy,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ClanHallSnapshot
        | { detail?: string }
        | null;
      if (!response.ok || !payload || !("clan" in payload)) {
        throw new Error(
          payload && "detail" in payload && payload.detail
            ? payload.detail
            : "Clan policy could not be updated."
        );
      }

      setSnapshot(payload);
      setNotice(
        `Clan hall set to ${CLAN_AUDIENCE_DETAILS[nextPolicy].label}.`
      );
    } catch (policyError) {
      setError(
        policyError instanceof Error
          ? policyError.message
          : "Clan policy could not be updated."
      );
    } finally {
      setPolicyBusy(false);
    }
  }

  async function editClanMessage(messageId: number) {
    if (messageActionBusy || !editingBody.trim()) return;
    setMessageActionBusy(`edit:${messageId}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit_message",
          messageId,
          message: editingBody,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ClanHallSnapshot
        | { detail?: string }
        | null;
      if (!response.ok || !payload || !("clan" in payload)) {
        throw new Error(
          payload && "detail" in payload && payload.detail
            ? payload.detail
            : "Clan message could not be edited."
        );
      }
      setSnapshot(payload);
      setEditingMessageId(null);
      setEditingBody("");
      setNotice("Message reforged.");
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "Clan message could not be edited."
      );
    } finally {
      setMessageActionBusy(null);
    }
  }

  async function deleteClanMessage(messageId: number) {
    if (
      messageActionBusy ||
      !window.confirm("Remove this message from the clan hall?")
    ) {
      return;
    }
    setMessageActionBusy(`delete:${messageId}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ClanHallSnapshot
        | { detail?: string }
        | null;
      if (!response.ok || !payload || !("clan" in payload)) {
        throw new Error(
          payload && "detail" in payload && payload.detail
            ? payload.detail
            : "Clan message could not be removed."
        );
      }
      setSnapshot(payload);
      setEditingMessageId(null);
      setNotice("Message removed from the hall.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Clan message could not be removed."
      );
    } finally {
      setMessageActionBusy(null);
    }
  }

  async function toggleReaction(messageId: number, emoji: ClanReaction) {
    if (messageActionBusy || !snapshot.viewer.authenticated) return;
    setMessageActionBusy(`reaction:${messageId}:${emoji}`);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_reaction",
          messageId,
          emoji,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ClanHallSnapshot
        | { detail?: string }
        | null;
      if (!response.ok || !payload || !("clan" in payload)) {
        throw new Error(
          payload && "detail" in payload && payload.detail
            ? payload.detail
            : "Reaction could not be placed."
        );
      }
      setSnapshot(payload);
    } catch (reactionError) {
      setError(
        reactionError instanceof Error
          ? reactionError.message
          : "Reaction could not be placed."
      );
    } finally {
      setMessageActionBusy(null);
    }
  }

  const policyDetail =
    CLAN_AUDIENCE_DETAILS[snapshot.clan.chatAudiencePolicy];
  const visibleMessageCount = snapshot.messages.length;
  const hasConversation =
    snapshot.messages.length > 0 || pendingMessages.length > 0;

  const clansHref =
    initialView === "advanced" ? "/clans" : `/clans?view=${initialView}`;

  const isMystikalClan = snapshot.clan.slug.toLowerCase() === "mystikal";

  return (
    <main
      className={`clan-hall clan-${initialView}-view mx-auto w-full space-y-6 py-3 text-white sm:py-5`}
    >
      <section className="clan-hall-hero relative overflow-hidden rounded-[2.2rem] border px-5 py-6 sm:px-7 sm:py-8">
        <div className="clan-theme-accent-line pointer-events-none absolute inset-x-12 top-0 h-px" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="relative mx-auto aspect-square w-full max-w-[15rem] shrink-0 overflow-hidden rounded-[2rem] border border-white/12 bg-black/35 shadow-[0_26px_80px_rgba(0,0,0,0.42)] lg:mx-0">
            <Image
              src={
                snapshot.clan.crestUrl || "/clans/mystikal-crest.webp"
              }
              alt={`${snapshot.clan.name} crest`}
              fill
              priority
              sizes="240px"
              className="object-cover"
            />
          </div>

          <div className="min-w-0 flex-1 text-center lg:text-left">
            <Link
              href={clansHref}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              All clan halls
            </Link>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <span className="clan-theme-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
                <Shield className="h-3.5 w-3.5" />
                Founding clan
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${audienceTone(
                  snapshot.clan.chatAudiencePolicy
                )}`}
              >
                <Eye className="h-3.5 w-3.5" />
                {policyDetail.label}
              </span>
            </div>
            {isMystikalClan ? (
              <div className="mt-5 flex w-full flex-col items-center">
                <h1 className="sr-only">{snapshot.clan.name}</h1>
                <div className="relative w-full max-w-[34rem] overflow-visible">
                  <Image
                    src="/clans/mystikal-wordmark-transparent.png"
                    alt=""
                    aria-hidden="true"
                    width={920}
                    height={240}
                    priority
                    sizes="(max-width: 1024px) 82vw, 520px"
                    className="mx-auto h-auto w-full object-contain drop-shadow-[0_0_34px_rgba(153,27,27,0.28)]"
                  />
                </div>
              </div>
            ) : (
              <h1 className="clan-hall__title mt-4 font-serif text-5xl font-semibold tracking-[-0.04em] text-white sm:text-7xl">
                {snapshot.clan.name}
              </h1>
            )}
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              {snapshot.clan.description}
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <StatPill
                icon={<UsersRound className="h-4 w-4" />}
                label={`${snapshot.clan.memberCount} clan member${
                  snapshot.clan.memberCount === 1 ? "" : "s"
                }`}
              />
              <StatPill
                icon={<MessageSquareText className="h-4 w-4" />}
                label={`${visibleMessageCount} visible post${
                  visibleMessageCount === 1 ? "" : "s"
                }`}
              />
              {snapshot.viewer.isMember ? (
                <StatPill
                  icon={<UserRoundCheck className="h-4 w-4" />}
                  label={formatClanRole(snapshot.viewer.role)}
                  accent
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-300/24 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-300/22 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <ClanInvitePrompt
        slug={snapshot.clan.slug}
        clanName={snapshot.clan.name}
      />

      <section className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <article
          data-chat-view={chatViewMode}
          className="clan-hall-chat-shell flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(8,13,26,0.96),rgba(3,6,13,0.96))] shadow-[0_28px_90px_rgba(0,0,0,0.28)]"
        >
          <header className="shrink-0 border-b border-white/9 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="clan-theme-label flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em]">
                    <MessageSquareText className="h-4 w-4" />
                    Clan chat
                  </div>
                  {realtimeEnabled ? (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${
                        liveConnected
                          ? "border-emerald-200/16 bg-emerald-300/[0.07] text-emerald-200"
                          : "border-slate-200/10 bg-white/[0.035] text-slate-500"
                      }}`}
                      title={
                        liveConnected
                          ? "Live Hall link connected"
                          : "Live Hall link reconnecting"
                      }
                    >
                      <Radio
                        className={`h-3 w-3 ${
                          liveConnected ? "animate-pulse" : ""
                        }}`}
                      />
                      {liveConnected ? "Live" : "Linking"}
                    </span>
                  ) : null}
                  {hallScribeEnabled ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/14 bg-violet-300/[0.055] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-violet-100/80"
                      title="Type @Scribe or light the S button"
                    >
                      <Sparkles className="h-3 w-3" />
                      Scribe
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.025em] text-white">
                  The {snapshot.clan.name} hall
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <div className="clan-chat-view-discovery">
                  <span className="clan-chat-view-discovery__label">
                    Chat view
                  </span>
                  <ClanChatViewPicker placement="header" />
                </div>
                <span
                  className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${audienceTone(
                    snapshot.clan.chatAudiencePolicy
                  )}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Hall ceiling: {policyDetail.shortLabel}
                </span>
              </div>
            </div>
            <p className="mt-3 text-sm leading-5 text-slate-400">
              {snapshot.access.notice}
            </p>
          </header>

          <div
            ref={chatViewportRef}
            data-chat-view={chatViewMode}
            className="clan-chat-viewport flex-1 overflow-y-auto px-3 py-4 [scrollbar-color:rgba(148,163,184,0.38)_transparent] [scrollbar-width:thin] sm:px-5"
          >
            {!snapshot.access.canReadChat ? (
              <LockedHall
                policy={snapshot.clan.chatAudiencePolicy}
                authenticated={snapshot.viewer.authenticated}
                onSignIn={() =>
                  loginWithSteam(`/clans/${snapshot.clan.slug}`)
                }
              />
            ) : !hasConversation ? (
              <div className="grid min-h-full place-items-center px-4 py-10 text-center">
                <div className="max-w-md">
                  <div className="clan-theme-icon-tile mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] border">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-white">
                    The hall is ready.
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    The first post sets the tone. Share it with the world,
                    AoE2WAR users, or just the clan.
                  </p>
                </div>
              </div>
            ) : (
              <div
                className={`clan-chat-stream clan-chat-stream--${chatViewMode}`}
              >
                {snapshot.messages.map((chatMessage, index) => (
                  <ClanMessageBubble
                    key={chatMessage.id}
                    message={chatMessage}
                    grouped={
                      (chatViewMode === "v2" ||
                        chatViewMode === "v3") &&
                      shouldGroupClanMessage(
                        index > 0
                          ? snapshot.messages[index - 1]
                          : null,
                        chatMessage,
                      )
                    }
                    mounted={mounted}
                    ownMessage={chatMessage.author.uid === snapshot.viewer.uid}
                    authenticated={snapshot.viewer.authenticated}
                    clanSlug={snapshot.clan.slug}
                    translationLanguage={translationLanguage}
                    editing={editingMessageId === chatMessage.id}
                    editingBody={editingBody}
                    busy={Boolean(
                      messageActionBusy?.includes(`:${chatMessage.id}`)
                    )}
                    onStartEdit={() => {
                      setEditingMessageId(chatMessage.id);
                      setEditingBody(chatMessage.body);
                    }}
                    onCancelEdit={() => {
                      setEditingMessageId(null);
                      setEditingBody("");
                    }}
                    onEditingBodyChange={setEditingBody}
                    onSaveEdit={() => {
                      void editClanMessage(chatMessage.id);
                    }}
                    onDelete={() => {
                      void deleteClanMessage(chatMessage.id);
                    }}
                    onReaction={(emoji) => {
                      void toggleReaction(chatMessage.id, emoji);
                    }}
                  />
                ))}
                {pendingMessages.map((pending) => (
                  <PendingClanMessageBubble
                    key={pending.id}
                    pending={pending}
                    displayName={snapshot.viewer.displayName || "You"}
                    onRetry={() => retryPendingMessage(pending)}
                    onDismiss={() => dismissPendingMessage(pending.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-white/9 bg-black/20 p-3 sm:p-5">
            {loading ? (
              <div className="h-28 animate-pulse rounded-[1.4rem] border border-white/8 bg-white/[0.035]" />
            ) : !snapshot.viewer.authenticated ? (
              <div className="flex flex-col gap-4 rounded-[1.4rem] border border-sky-200/14 bg-sky-300/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-white">
                    Sign in to enter the conversation
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    Public posts stay readable. Posting belongs to known AoE2WAR
                    players.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    loginWithSteam(`/clans/${snapshot.clan.slug}`)
                  }
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-sky-300 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-sky-200"
                >
                  Steam Sign In
                </button>
              </div>
            ) : !snapshot.access.canPost ? (
              <div className="rounded-[1.4rem] border border-amber-200/16 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-50">
                This hall is currently closed to visitor posts. A clan
                member can still speak inside.
              </div>
            ) : (
              <form onSubmit={postMessage}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    Who can see this?
                  </span>
                  {snapshot.allowedAudiences.map((option) => {
                    const Icon = audienceIcon(option);
                    const active = audience === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAudience(option)}
                        aria-pressed={active}
                        className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition ${
                          active
                            ? audienceTone(option)
                            : "border-white/9 bg-white/[0.035] text-slate-400 hover:border-white/18 hover:text-white"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {CLAN_AUDIENCE_DETAILS[option].label}
                      </button>
                    );
                  })}
                </div>

                <div className="clan-theme-composer mt-3 flex items-end gap-2 rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-2 focus-within:bg-white/[0.055]">
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value.slice(0, 1200))}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "Enter" ||
                        event.shiftKey ||
                        event.nativeEvent.isComposing
                      ) {
                        return;
                      }

                      event.preventDefault();

                      if (posting || !message.trim()) {
                        return;
                      }

                      event.currentTarget.form?.requestSubmit();
                    }}
                    placeholder={`Message ${snapshot.clan.name}…`}
                    rows={3}
                    className="min-h-[4.7rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600"
                  />
                  {hallScribeEnabled ? (
                    <button
                      type="button"
                      onClick={() =>
                        setScribeReplyEnabled((current) => !current)
                      }
                      aria-pressed={scribeReplyEnabled}
                      aria-label={
                        scribeReplyEnabled
                          ? "Scribe reply armed"
                          : "Ask Scribe on next message"
                      }
                      title={
                        scribeReplyEnabled
                          ? "Scribe will answer your next message"
                          : "Ask Scribe on your next message"
                      }
                      className={`clan-scribe-toggle ${
                        scribeReplyEnabled
                          ? "clan-scribe-toggle--active"
                          : ""
                      }`}
                    >
                      <span
                        className="clan-scribe-toggle__sigil"
                        aria-hidden="true"
                      >
                        S
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={posting || !message.trim()}
                    className="clan-theme-send grid h-11 w-11 shrink-0 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send clan message"
                  >
                    <Send className="h-[1.125rem] w-[1.125rem]" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-slate-500">
                  <span>
                    {CLAN_AUDIENCE_DETAILS[audience].description}
                  </span>
                  <span className="shrink-0">{message.length}/1200</span>
                </div>
              </form>
            )}
          </footer>
        </article>

        <aside className="space-y-5">
          <ClanInviteDoor
            slug={snapshot.clan.slug}
            clanName={snapshot.clan.name}
            enabled={
              snapshot.viewer.canManage &&
              clanHallFeatureEnabled(snapshot.clan.slug, "inviteDoor")
            }
          />

          {snapshot.viewer.canManage ? (
            <ClanPolicyPanel
              policy={snapshot.clan.chatAudiencePolicy}
              busy={policyBusy}
              onChange={updatePolicy}
            />
          ) : (
            <section className="rounded-[1.6rem] border border-white/10 bg-black/24 p-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500">
                <Eye className="clan-theme-label h-4 w-4" />
                Hall audience
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div
                  className={`grid h-10 w-10 place-items-center rounded-xl border ${audienceTone(
                    snapshot.clan.chatAudiencePolicy
                  )}`}
                >
                  {(() => {
                    const Icon = audienceIcon(
                      snapshot.clan.chatAudiencePolicy
                    );
                    return <Icon className="h-[1.125rem] w-[1.125rem]" />;
                  })()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {policyDetail.label}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Set by clan administration
                  </div>
                </div>
              </div>
            </section>
          )}

          <ClanHallPresenceCard
            presence={hallPresence}
            roster={snapshot.roster}
            onlineUidSet={onlineUidSet}
          />

          <section className="rounded-[1.6rem] border border-white/10 bg-black/24 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500">
                <UsersRound className="clan-theme-label h-4 w-4" />
                Clan roster
              </div>
              <span className="rounded-full border border-white/9 bg-white/[0.04] px-2.5 py-1 text-[10px] text-slate-400">
                {snapshot.clan.memberCount}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {snapshot.roster.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs leading-5 text-slate-500">
                  Founding roster coming into focus.
                </div>
              ) : (
                snapshot.roster.map((member) => (
                  <div
                    key={member.uid}
                    className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2.5"
                  >
                    <div className="clan-theme-icon-tile grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-xs font-black">
                      {initials(member.displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">
                        {member.displayName}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                        <span>{formatClanRole(member.role)}</span>
                        <span
                          className={
                            hallPresence.some((entry) => entry.uid === member.uid)
                              ? "text-amber-200/80"
                              : onlineUidSet.has(member.uid)
                                ? "text-emerald-200/75"
                                : "text-slate-600"
                          }
                        >
                          {hallPresence.some((entry) => entry.uid === member.uid)
                            ? "In Hall"
                            : onlineUidSet.has(member.uid)
                              ? "Online"
                              : "Offline"}
                        </span>
                      </div>
                      <div className="mt-1 text-[9px] leading-4 text-slate-600">
                        Joined{" "}
                        <TimeDisplayText
                          value={member.joinedAt}
                          includeZone={false}
                          includeYear
                          interactive={false}
                          className="text-slate-500"
                        />
                      </div>
                    </div>
                    {["owner", "admin"].includes(member.role) ? (
                      <Crown className="h-4 w-4 text-amber-200" />
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[1.6rem] border border-amber-200/12 bg-[radial-gradient(circle_at_80%_0%,rgba(251,191,36,0.10),transparent_35%),rgba(14,10,6,0.72)] p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-amber-200/65">
              <Swords className="h-4 w-4" />
              Next in the hall
            </div>
            <div className="mt-4 space-y-2">
              <ComingRail label="Clan-versus-clan challenges" />
              <ComingRail label="Shared replay shelf" />
              <ComingRail label="House honors and roles" />
            </div>
          </section>
        </aside>
      </section>

      <ClanDisplayRail
        view={initialView}
        basePath={`/clans/${snapshot.clan.slug}`}
      />
    </main>
  );
}

function StatPill({
  icon,
  label,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <span
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
        accent
          ? "border-amber-200/18 bg-amber-300/10 text-amber-100"
          : "border-white/10 bg-white/5 text-slate-300"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}

function ClanHallPresenceCard({
  presence,
  roster,
  onlineUidSet,
}: {
  presence: HallPresenceUser[];
  roster: ClanHallSnapshot["roster"];
  onlineUidSet: Set<string>;
}) {
  const rosterByUid = new Map(
    roster.map((member) => [
      member.uid,
      member,
    ]),
  );

  return (
    <section className="rounded-[1.6rem] border border-emerald-200/10 bg-[radial-gradient(circle_at_100%_0%,rgba(16,185,129,0.08),transparent_38%),rgba(0,0,0,0.24)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500">
          <Radio className="clan-theme-label h-4 w-4" />
          In the Hall
        </div>
        <span className="rounded-full border border-emerald-200/12 bg-emerald-300/[0.055] px-2.5 py-1 text-[10px] tabular-nums text-emerald-100/75">
          {presence.length}
        </span>
      </div>

      {presence.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/8 px-3 py-4 text-center text-xs leading-5 text-slate-600">
          No signed-in warriors are reporting presence in this Hall yet.
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {presence.map((entry) => {
            const member =
              rosterByUid.get(entry.uid);
            const siteOnline =
              onlineUidSet.has(entry.uid);

            return (
              <div
                key={entry.uid}
                className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2.5"
              >
                <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-200/10 bg-emerald-300/[0.055] text-xs font-black text-emerald-50">
                  {initials(entry.displayName)}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a1019] ${
                      siteOnline
                        ? "bg-emerald-400"
                        : "bg-amber-300"
                    }`}
                    title={
                      siteOnline
                        ? "Online on AoE2WAR"
                        : "In Hall"
                    }
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">
                    {entry.displayName}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-slate-500">
                    <span className="text-amber-100/70">
                      In Hall
                    </span>
                    <span>
                      {member
                        ? formatClanRole(member.role)
                        : "Visitor"}
                    </span>
                    {siteOnline ? (
                      <span className="text-emerald-200/65">
                        Online
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PendingClanMessageBubble({
  pending,
  displayName,
  onRetry,
  onDismiss,
}: {
  pending: PendingClanMessage;
  displayName: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const Icon = audienceIcon(pending.audience);
  const failed = pending.status === "failed";

  return (
    <div
      className={`clan-message clan-message--pending clan-message--own relative flex gap-3 rounded-[1.35rem] border p-3 sm:p-4 ${
        failed
          ? "border-red-300/22 bg-red-400/[0.075]"
          : "border-emerald-200/14 bg-emerald-300/[0.045]"
      }`}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[1rem] border border-white/10 bg-black/24 text-xs font-black text-white">
        {initials(displayName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">
            {displayName}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${audienceTone(
              pending.audience,
            )}`}
          >
            <Icon className="h-3 w-3" />
            {CLAN_AUDIENCE_DETAILS[pending.audience].shortLabel}
          </span>
          <span
            className={`text-[9px] font-bold uppercase tracking-[0.16em] ${
              failed ? "text-red-200" : "text-emerald-200/70"
            }`}
          >
            {failed ? "Not sent" : "Sending"}
          </span>
          {failed ? (
            <span className="ml-auto inline-flex items-center gap-1">
              <button
                type="button"
                onClick={onRetry}
                className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-black/20 text-slate-300 transition hover:border-emerald-200/25 hover:text-emerald-100"
                aria-label="Retry clan message"
                title="Retry"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-black/20 text-slate-400 transition hover:border-red-200/25 hover:text-red-200"
                aria-label="Dismiss failed clan message"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : null}
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
          {pending.body}
        </p>
      </div>
    </div>
  );
}

function ClanMessageBubble({
  message,
  mounted,
  ownMessage,
  grouped,
  authenticated,
  clanSlug,
  translationLanguage,
  editing,
  editingBody,
  busy,
  onStartEdit,
  onCancelEdit,
  onEditingBodyChange,
  onSaveEdit,
  onDelete,
  onReaction,
}: {
  message: ClanHallSnapshot["messages"][number];
  mounted: boolean;
  ownMessage: boolean;
  grouped: boolean;
  authenticated: boolean;
  clanSlug: string;
  translationLanguage: UniversalLanguageCode;
  editing: boolean;
  editingBody: string;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditingBodyChange: (value: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onReaction: (emoji: ClanReaction) => void;
}) {
  const Icon =
    audienceIcon(message.audience);
  const [toolsOpen, setToolsOpen] =
    useState(false);
  const toolsCloseTimerRef =
    useRef<number | null>(null);
  const [
    translationPending,
    setTranslationPending,
  ] = useState(false);
  const [
    translationError,
    setTranslationError,
  ] = useState<string | null>(
    null,
  );
  const [
    activeTranslation,
    setActiveTranslation,
  ] = useState<{
    language: UniversalLanguageCode;
    text: string;
  } | null>(null);

  const languageDefinition =
    findUniversalLanguage(
      translationLanguage,
    );

  const hasTools =
    authenticated ||
    message.canEdit ||
    message.canDelete;

  function cancelToolsClose() {
    if (
      toolsCloseTimerRef.current
    ) {
      window.clearTimeout(
        toolsCloseTimerRef.current,
      );
      toolsCloseTimerRef.current =
        null;
    }
  }

  function openTools() {
    cancelToolsClose();
    setToolsOpen(true);
  }

  function scheduleToolsClose() {
    cancelToolsClose();
    toolsCloseTimerRef.current =
      window.setTimeout(
        () => setToolsOpen(false),
        180,
      );
  }

  useEffect(() => {
    return () => {
      if (
        toolsCloseTimerRef.current
      ) {
        window.clearTimeout(
          toolsCloseTimerRef.current,
        );
      }
    };
  }, []);

  useEffect(() => {
    setActiveTranslation(null);
    setTranslationError(null);
  }, [
    message.updatedAt,
    translationLanguage,
  ]);

  async function translateMessage() {
    setToolsOpen(false);

    if (
      activeTranslation?.language ===
      translationLanguage
    ) {
      setActiveTranslation(null);
      setTranslationError(null);
      return;
    }

    setTranslationPending(true);
    setTranslationError(null);

    try {
      const response = await fetch(
        `/api/clans/${encodeURIComponent(clanSlug)}/messages/${message.id}/translate`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            language:
              translationLanguage,
          }),
        },
      );

      const payload =
        (await response
          .json()
          .catch(() => null)) as
          | {
              text?: string;
              language?: string;
              detail?: string;
            }
          | null;

      if (
        !response.ok ||
        !payload?.text
      ) {
        throw new Error(
          payload?.detail ||
            "Translation failed.",
        );
      }

      setActiveTranslation({
        language:
          translationLanguage,
        text: payload.text,
      });
    } catch (error) {
      setTranslationError(
        error instanceof Error
          ? error.message
          : "Translation is temporarily unavailable.",
      );
    } finally {
      setTranslationPending(false);
    }
  }

  return (
    <div
      className={`clan-message group/message relative flex gap-3 rounded-[1.35rem] border p-3 sm:p-4 ${
        grouped
          ? "clan-message--grouped "
          : ""
      }${
        ownMessage
          ? "clan-message--own"
          : "border-white/8 bg-white/[0.025]"
      }`}
    >
      <div className="clan-message__avatar grid h-10 w-10 shrink-0 place-items-center rounded-[1rem] border border-white/10 bg-black/24 text-xs font-black text-white">
        {initials(
          message.author.displayName,
        )}
      </div>

      <div className="clan-message__content min-w-0 flex-1">
        <div className="clan-message__meta flex flex-wrap items-center gap-2">
          <span className="clan-message__author text-sm font-semibold text-white">
            {
              message.author
                .displayName
            }
          </span>

          {message.author
            .isClanMember ? (
            <span className="clan-message__role rounded-full border border-amber-200/14 bg-amber-300/[0.07] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-100">
              {formatClanRole(
                message.author.role,
              )}
            </span>
          ) : (
            <span className="clan-message__role rounded-full border border-sky-200/12 bg-sky-300/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-sky-100">
              visitor
            </span>
          )}

          <span
            className={`clan-message__audience inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${audienceTone(
              message.audience,
            )}`}
          >
            <Icon className="h-3 w-3" />
            {
              CLAN_AUDIENCE_DETAILS[
                message.audience
              ].shortLabel
            }
          </span>

          <span className="clan-message__time text-[10px] text-slate-600">
            {formatMessageTime(
              message.createdAt,
              mounted,
            )}
          </span>

          {message.edited ? (
            <span className="clan-message__edited text-[9px] uppercase tracking-[0.14em] text-slate-600">
              reforged
            </span>
          ) : null}
        </div>

        {editing ? (
          <div className="clan-message__editor clan-theme-outline mt-3 rounded-[1rem] border bg-black/24 p-2">
            <textarea
              value={editingBody}
              onChange={(event) =>
                onEditingBodyChange(
                  event.target.value.slice(
                    0,
                    1200,
                  ),
                )
              }
              rows={3}
              autoFocus
              className="min-h-[5rem] w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-white outline-none placeholder:text-slate-600"
            />
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/7 pt-2">
              <span className="text-[10px] text-slate-600">
                {editingBody.length}
                /1200
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={
                    onCancelEdit
                  }
                  disabled={busy}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full border border-white/10 px-3 text-[11px] text-slate-400 transition hover:text-white disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={
                    onSaveEdit
                  }
                  disabled={
                    busy ||
                    !editingBody.trim()
                  }
                  className="inline-flex min-h-8 items-center gap-1 rounded-full border border-amber-200/22 bg-amber-300/12 px-3 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-300/18 disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" />
                  Reforge
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="clan-message__body mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
              {activeTranslation?.text ??
                message.body}
            </p>

            {activeTranslation ? (
              <div className="clan-message__translation-note mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-200/48">
                Translated ·{" "}
                {findUniversalLanguage(
                  activeTranslation.language,
                )?.nativeName ??
                  activeTranslation.language}
              </div>
            ) : null}

            {translationError ? (
              <div className="clan-message__translation-error mt-1.5 text-[10px] text-rose-200/75">
                {translationError}
              </div>
            ) : null}
          </>
        )}

        {message.reactions.length >
        0 ? (
          <div className="clan-message__reactions mt-2 flex flex-wrap items-center gap-1.5">
            {message.reactions.map(
              (reaction) => (
                <button
                  key={`${message.id}-${reaction.emoji}`}
                  type="button"
                  onClick={() =>
                    onReaction(
                      reaction.emoji,
                    )
                  }
                  disabled={
                    !authenticated ||
                    busy
                  }
                  aria-pressed={
                    reaction.viewerReacted
                  }
                  className={`group/reaction relative inline-flex min-h-6 items-center gap-1 rounded-full border px-2 text-[10px] transition ${
                    reaction.viewerReacted
                      ? "border-amber-200/24 bg-amber-300/10 text-amber-50"
                      : "border-white/7 bg-black/12 text-slate-400 hover:border-white/14 hover:text-white"
                  } disabled:cursor-default`}
                >
                  <span className="text-[12px] leading-none">
                    {reaction.emoji}
                  </span>
                  <span className="tabular-nums">
                    {reaction.count}
                  </span>

                  <span className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-0 z-50 hidden min-w-max max-w-[18rem] rounded-xl border border-amber-100/14 bg-[#080a11]/[0.98] px-3 py-2 text-left text-[11px] leading-5 text-slate-200 shadow-[0_18px_55px_rgba(0,0,0,0.55)] backdrop-blur-xl group-hover/reaction:block">
                    <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-amber-100/60">
                      {reaction.emoji} Reacted
                    </span>
                    <span className="mt-0.5 block">
                      {reaction.users
                        .map(
                          (user) =>
                            user.displayName,
                        )
                        .join(", ")}
                    </span>
                  </span>
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>

      {hasTools ? (
        <div
          className="clan-message-tools"
          onMouseEnter={openTools}
          onMouseLeave={
            scheduleToolsClose
          }
          onFocusCapture={openTools}
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
            scheduleToolsClose();
          }}
        >
          <button
            type="button"
            className="clan-message-tools__trigger"
            onClick={openTools}
            aria-label="Message tools"
            aria-haspopup="menu"
            aria-expanded={toolsOpen}
            title="Message tools"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>

          {toolsOpen ? (
            <div
              className="clan-message-tools__menu"
              role="menu"
              aria-label="Message tools"
            >
              {authenticated ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      void translateMessage()
                    }
                    disabled={
                      translationPending
                    }
                    className="clan-message-tools__row"
                  >
                    <Languages className="h-3.5 w-3.5" />
                    <span className="min-w-0 flex-1 text-left">
                      {translationPending
                        ? "Translating…"
                        : activeTranslation?.language ===
                            translationLanguage
                          ? "Show original"
                          : `Translate · ${
                              languageDefinition?.nativeName ??
                              translationLanguage
                            }`}
                    </span>
                  </button>

                  <div className="clan-message-tools__react">
                    <span className="clan-message-tools__react-label">
                      <SmilePlus className="h-3 w-3" />
                      React
                    </span>
                    <div className="clan-message-tools__emoji-row">
                      {CLAN_REACTIONS.map(
                        (emoji) => {
                          const active =
                            message.reactions.some(
                              (
                                reaction,
                              ) =>
                                reaction.emoji ===
                                  emoji &&
                                reaction.viewerReacted,
                            );

                          return (
                            <button
                              key={`${message.id}-tool-${emoji}`}
                              type="button"
                              onClick={() => {
                                onReaction(
                                  emoji,
                                );
                                setToolsOpen(
                                  false,
                                );
                              }}
                              disabled={
                                busy
                              }
                              aria-label={`React ${emoji}`}
                              aria-pressed={
                                active
                              }
                              className={`clan-message-tools__emoji ${
                                active
                                  ? "clan-message-tools__emoji--active"
                                  : ""
                              }`}
                            >
                              {emoji}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              {message.canEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setToolsOpen(false);
                    onStartEdit();
                  }}
                  disabled={busy}
                  className="clan-message-tools__row"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit message
                </button>
              ) : null}

              {message.canDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setToolsOpen(false);
                    onDelete();
                  }}
                  disabled={busy}
                  className="clan-message-tools__row clan-message-tools__row--danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete message
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LockedHall({
  policy,
  authenticated,
  onSignIn,
}: {
  policy: ClanAudience;
  authenticated: boolean;
  onSignIn: () => void;
}) {
  return (
    <div className="grid min-h-full place-items-center px-4 py-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] border border-amber-200/16 bg-amber-300/[0.07] text-amber-100">
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h3 className="mt-5 text-xl font-bold text-white">
          The hall doors are closed.
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {policy === "users"
            ? "Mystikal shares this conversation with signed-in AoE2WAR players."
            : "Mystikal is keeping this conversation inside the clan."}
        </p>
        {!authenticated && policy === "users" ? (
          <button
            type="button"
            onClick={onSignIn}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-amber-300 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-200"
          >
            Steam Sign In
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ClanPolicyPanel({
  policy,
  busy,
  onChange,
}: {
  policy: ClanAudience;
  busy: boolean;
  onChange: (policy: ClanAudience) => void;
}) {
  return (
    <section className="clan-policy-panel rounded-[1.6rem] border p-4">
      <div className="clan-theme-label flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em]">
        <Settings2 className="h-4 w-4" />
        Clan admin · hall audience
      </div>
      <h3 className="mt-3 text-lg font-bold text-white">
        How far can chat travel?
      </h3>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        This is the broadest audience allowed for the whole hall. Tightening it
        also hides older broader posts.
      </p>

      <div className="mt-4 space-y-2">
        {CLAN_AUDIENCES.map((option) => {
          const Icon = audienceIcon(option);
          const active = option === policy;
          return (
            <button
              key={option}
              type="button"
              disabled={busy}
              onClick={() => onChange(option)}
              className={`flex w-full items-center gap-3 rounded-[1.1rem] border px-3 py-3 text-left transition ${
                active
                  ? audienceTone(option)
                  : "border-white/8 bg-black/14 text-slate-300 hover:border-white/16 hover:bg-white/[0.04]"
              } disabled:cursor-wait disabled:opacity-60`}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/10">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {CLAN_AUDIENCE_DETAILS[option].label}
                </div>
                <div className="mt-0.5 text-[11px] leading-4 opacity-65">
                  {option === "public"
                    ? "World, users, or clan posts"
                    : option === "users"
                      ? "Users or clan posts only"
                      : "Clan posts only"}
                </div>
              </div>
              {active ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ComingRail({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/7 bg-white/[0.025] px-3 py-3">
      <span className="text-sm text-slate-300">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
    </div>
  );
}
