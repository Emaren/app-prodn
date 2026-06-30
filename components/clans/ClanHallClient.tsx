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
  LockKeyhole,
  MessageSquareText,
  Send,
  Settings2,
  Shield,
  Sparkles,
  Swords,
  UserRoundCheck,
  Users,
  UsersRound,
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
import {
  CLAN_AUDIENCES,
  CLAN_AUDIENCE_DETAILS,
  type ClanAudience,
  type ClanHallSnapshot,
} from "@/lib/clans";

const POLL_INTERVAL_MS = 10_000;

function initials(value: string) {
  const parts = value
    .replace(/[\[\]_,.-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function formatStableTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatMessageTime(value: string, mounted: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (!mounted) return formatStableTime(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
    return "border-violet-200/18 bg-violet-300/10 text-violet-100";
  }
  return "border-amber-200/18 bg-amber-300/10 text-amber-100";
}

export default function ClanHallClient({
  initialSnapshot,
}: {
  initialSnapshot: ClanHallSnapshot;
}) {
  const { uid, loading, loginWithSteam } = useUserAuth();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<ClanAudience>(() =>
    preferredAudience(initialSnapshot.allowedAudiences)
  );
  const [posting, setPosting] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const requestInFlightRef = useRef(false);

  const endpoint = `/api/clans/${encodeURIComponent(snapshot.clan.slug)}`;

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
    const interval = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh, uid]);

  useEffect(() => {
    if (!snapshot.allowedAudiences.includes(audience)) {
      setAudience(preferredAudience(snapshot.allowedAudiences));
    }
  }, [audience, snapshot.allowedAudiences]);

  useEffect(() => {
    settleChatToBottom();
  }, [settleChatToBottom, snapshot.messages.length]);

  async function postMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (posting || !message.trim()) return;

    setPosting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          audience,
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
            : "Message could not be posted."
        );
      }

      setSnapshot(payload);
      setMessage("");
      setNotice(`Posted for ${CLAN_AUDIENCE_DETAILS[audience].label}.`);
      settleChatToBottom("smooth");
    } catch (postError) {
      setError(
        postError instanceof Error
          ? postError.message
          : "Message could not be posted."
      );
    } finally {
      setPosting(false);
    }
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

  const policyDetail =
    CLAN_AUDIENCE_DETAILS[snapshot.clan.chatAudiencePolicy];
  const visibleMessageCount = snapshot.messages.length;

  return (
    <main className="space-y-6 py-3 text-white sm:py-5">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-violet-200/16 bg-[radial-gradient(circle_at_18%_10%,rgba(124,58,237,0.21),transparent_31%),radial-gradient(circle_at_88%_5%,rgba(56,189,248,0.12),transparent_29%),linear-gradient(145deg,#101729,#060a14_60%,#02040a)] px-5 py-6 shadow-[0_34px_120px_rgba(0,0,0,0.32)] sm:px-7 sm:py-8">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-violet-200/55 to-transparent" />
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
              href="/clans"
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              All clan halls
            </Link>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/18 bg-violet-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-100">
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
            <h1 className="mt-4 font-serif text-5xl font-semibold tracking-[-0.04em] text-white sm:text-7xl">
              {snapshot.clan.name}
            </h1>
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
                  label={
                    snapshot.viewer.role === "site_admin"
                      ? "AoE2WAR operator"
                      : `Clan ${snapshot.viewer.role || "member"}`
                  }
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <article className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(8,13,26,0.96),rgba(3,6,13,0.96))] shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
          <header className="border-b border-white/9 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-violet-200/70">
                  <MessageSquareText className="h-4 w-4" />
                  Clan chat
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.025em] text-white">
                  The Mystikal hall
                </h2>
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
            <p className="mt-3 text-sm leading-5 text-slate-400">
              {snapshot.access.notice}
            </p>
          </header>

          <div
            ref={chatViewportRef}
            className="h-[31rem] overflow-y-auto px-3 py-4 [scrollbar-color:rgba(148,163,184,0.38)_transparent] [scrollbar-width:thin] sm:px-5"
          >
            {!snapshot.access.canReadChat ? (
              <LockedHall
                policy={snapshot.clan.chatAudiencePolicy}
                authenticated={snapshot.viewer.authenticated}
                onSignIn={() =>
                  loginWithSteam(`/clans/${snapshot.clan.slug}`)
                }
              />
            ) : snapshot.messages.length === 0 ? (
              <div className="grid min-h-full place-items-center px-4 py-10 text-center">
                <div className="max-w-md">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] border border-violet-200/16 bg-violet-300/[0.07] text-violet-100">
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
              <div className="space-y-3">
                {snapshot.messages.map((chatMessage) => (
                  <ClanMessageBubble
                    key={chatMessage.id}
                    message={chatMessage}
                    mounted={mounted}
                    ownMessage={chatMessage.author.uid === snapshot.viewer.uid}
                  />
                ))}
              </div>
            )}
          </div>

          <footer className="border-t border-white/9 bg-black/20 p-3 sm:p-5">
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
                This hall is currently closed to visitor posts. A Mystikal clan
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

                <div className="mt-3 flex items-end gap-2 rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-2 focus-within:border-violet-200/28 focus-within:bg-white/[0.055]">
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value.slice(0, 1200))}
                    placeholder={`Message ${snapshot.clan.name}…`}
                    rows={3}
                    className="min-h-[4.7rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600"
                  />
                  <button
                    type="submit"
                    disabled={posting || !message.trim()}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-300 text-slate-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
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
          {snapshot.viewer.canManage ? (
            <ClanPolicyPanel
              policy={snapshot.clan.chatAudiencePolicy}
              busy={policyBusy}
              onChange={updatePolicy}
            />
          ) : (
            <section className="rounded-[1.6rem] border border-white/10 bg-black/24 p-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500">
                <Eye className="h-4 w-4 text-violet-200" />
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

          <section className="rounded-[1.6rem] border border-white/10 bg-black/24 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500">
                <UsersRound className="h-4 w-4 text-violet-200" />
                Roster
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
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-violet-200/14 bg-violet-300/[0.07] text-xs font-black text-violet-100">
                      {initials(member.displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">
                        {member.displayName}
                      </div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                        {member.role}
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

function ClanMessageBubble({
  message,
  mounted,
  ownMessage,
}: {
  message: ClanHallSnapshot["messages"][number];
  mounted: boolean;
  ownMessage: boolean;
}) {
  const Icon = audienceIcon(message.audience);

  return (
    <div
      className={`flex gap-3 rounded-[1.35rem] border p-3 sm:p-4 ${
        ownMessage
          ? "border-violet-200/16 bg-violet-300/[0.065]"
          : "border-white/8 bg-white/[0.025]"
      }`}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[1rem] border border-white/10 bg-black/24 text-xs font-black text-white">
        {initials(message.author.displayName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">
            {message.author.displayName}
          </span>
          {message.author.isClanMember ? (
            <span className="rounded-full border border-amber-200/14 bg-amber-300/[0.07] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-100">
              {message.author.role || "member"}
            </span>
          ) : (
            <span className="rounded-full border border-sky-200/12 bg-sky-300/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-sky-100">
              visitor
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${audienceTone(
              message.audience
            )}`}
          >
            <Icon className="h-3 w-3" />
            {CLAN_AUDIENCE_DETAILS[message.audience].shortLabel}
          </span>
          <span className="text-[10px] text-slate-600">
            {formatMessageTime(message.createdAt, mounted)}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
          {message.body}
        </p>
      </div>
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
    <section className="rounded-[1.6rem] border border-violet-200/14 bg-violet-300/[0.045] p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-violet-200/70">
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
