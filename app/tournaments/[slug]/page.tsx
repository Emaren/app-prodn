import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { displayMatchPlayer, displayName, formatTournamentWindow } from "@/components/lobby/utils";
import { getLobbyMessages, getTournamentBySlug } from "@/lib/communityStore";
import {
  getFallbackTournament,
  getTournamentMatchStatusLabel,
  getTournamentStatusLabel,
} from "@/lib/lobby";
import { getPrisma } from "@/lib/prisma";
import { readGuestReactionSessionIdFromCookies } from "@/lib/guestReactionSession";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATION_STEPS = [
  {
    eyebrow: "Queue",
    title: "Fill the founder field",
    body: "The first entrants set the tone. Claim identity, join the queue, and give the bracket real names to work with.",
  },
  {
    eyebrow: "Bracket",
    title: "Lock first pairings",
    body: "As soon as the first matches are assigned, the tournament turns from an invitation into a real competitive rail.",
  },
  {
    eyebrow: "Proof",
    title: "Replay-backed finishes",
    body: "Results land through replay proof so the bracket history feels earned instead of hand-waved.",
  },
] as const;

function formatMoment(value: string | null) {
  if (!value) return "Scheduling now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Scheduling now";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const prisma = getPrisma();
  const fallbackTournament = getFallbackTournament(Boolean(claims?.uid));
  const tournament =
    (await getTournamentBySlug(prisma, slug, claims?.uid ?? null)) ??
    (slug === fallbackTournament.slug ? fallbackTournament : null);

  if (!tournament) {
    notFound();
  }

  const messages = await getLobbyMessages(prisma, tournament.roomSlug, 12, {
    uid: claims?.uid ?? null,
    guestSessionId: readGuestReactionSessionIdFromCookies(cookieStore),
  });

  return (
    <main className="space-y-6 py-3 text-white sm:space-y-7 sm:py-4">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.16),_transparent_22%),radial-gradient(circle_at_80%_16%,_rgba(59,130,246,0.14),_transparent_22%),radial-gradient(circle_at_64%_86%,_rgba(16,185,129,0.12),_transparent_22%),linear-gradient(135deg,_#08111f,_#0d1728_48%,_#040813)] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.42)] sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(112deg,transparent,rgba(255,255,255,0.03),transparent)]" />

        <div className="relative z-10 grid gap-7 xl:grid-cols-[1.08fr_0.92fr] xl:items-start">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <TonePill tone="amber">{getTournamentStatusLabel(tournament.status)}</TonePill>
              <TonePill tone="sky">{tournament.format}</TonePill>
              <TonePill tone="emerald">
                {tournament.entryCount} {tournament.entryCount === 1 ? "entrant" : "entrants"}
              </TonePill>
              {tournament.viewerJoined ? <TonePill tone="slate">You’re in</TonePill> : null}
            </div>

            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-[0.38em] text-amber-200/72">
                Featured tournament HQ
              </div>
              <h1 className="max-w-5xl text-4xl font-semibold leading-[0.95] tracking-[-0.045em] text-white sm:text-5xl lg:text-7xl">
                {tournament.title}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                {tournament.description}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroStat
                label="Window"
                value={formatTournamentWindow(tournament.startsAt)}
                helper="The current featured event slot"
              />
              <HeroStat
                label="Format"
                value={tournament.format}
                helper="Current public tournament rail"
              />
              <HeroStat
                label="Matches"
                value={String(tournament.matches.length)}
                helper="Posted bracket pairings so far"
              />
              <HeroStat
                label="Room"
                value={messages.length > 0 ? `${messages.length} notes` : "Quiet"}
                helper="Public tournament chatter"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/lobby"
                className="inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                {tournament.viewerJoined ? "Return To Lobby" : "Open Lobby To Join"}
              </Link>
              <Link
                href="/bets"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm text-white/90 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                Open Betting Floor
              </Link>
              <Link
                href="/players"
                className="inline-flex items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-100 transition hover:border-emerald-300/38 hover:bg-emerald-500/15"
              >
                Browse Players
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <section className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,13,24,0.96),rgba(4,7,18,0.98))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
                    Tournament pulse
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    {tournament.status === "planning"
                      ? "Founders board is forming"
                      : tournament.status === "open"
                        ? "Queue is open"
                        : tournament.status === "active"
                          ? "Bracket is live"
                          : "Bracket is complete"}
                  </h2>
                </div>
                <TonePill tone="amber">{getTournamentStatusLabel(tournament.status)}</TonePill>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MetricTile label="Entrants" value={String(tournament.entryCount)} />
                <MetricTile label="Matches" value={String(tournament.matches.length)} />
                <MetricTile
                  label="Chat room"
                  value={tournament.roomSlug === "main-lobby" ? "Lobby" : "Ready"}
                />
              </div>

              <div className="mt-5 rounded-[1.4rem] border border-white/8 bg-white/5 p-4 text-sm leading-6 text-slate-300">
                {tournament.matches.length === 0
                  ? "This page is the build-up rail. The queue is visible, the room is live, and the first pairings will flip the event from invitation energy into real tournament tension."
                  : "The bracket is no longer theoretical. Pairings, proof, and public room energy all live here together."}
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <GlassPanel
                eyebrow="Join pressure"
                title={
                  tournament.entryCount >= 8
                    ? "Bracket-ready"
                    : `${Math.max(0, 8 - tournament.entryCount)} more to fill`
                }
                body="This is still a tournament in creation. Early entrants define the prestige of the field."
                tone="amber"
              />
              <GlassPanel
                eyebrow="Proof rail"
                title={
                  tournament.matches.some((match) => match.proof)
                    ? "Replay linked"
                    : "Waiting on first proof"
                }
                body="As results post, the bracket history becomes replay-backed instead of rumor-backed."
                tone="sky"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel eyebrow="Entrant queue" title="Founding field" count={tournament.entryCount}>
          <div className="grid gap-3">
            {tournament.entrants.length === 0 ? (
              <EmptyPanel message="No entrants yet. The first names to join set the tone for the whole event." />
            ) : (
              tournament.entrants.map((entrant, index) => (
                <div
                  key={`${entrant.entryId ?? entrant.uid}-${entrant.joinedAt}`}
                  className="rounded-[1.45rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.024))] px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-300/18 bg-amber-400/10 text-sm font-semibold text-amber-100">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-lg font-semibold text-white">
                            {displayName(entrant.inGameName, entrant.steamPersonaName)}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                            Joined {formatMoment(entrant.joinedAt)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      {entrant.verified ? (
                        <Tag tone="emerald">Replay verified</Tag>
                      ) : (
                        <Tag tone="slate">Steam linked</Tag>
                      )}
                      <Tag tone="sky">Level {entrant.verificationLevel}</Tag>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel eyebrow="Bracket intelligence" title="Preview rail" count={tournament.matches.length}>
          <div className="grid gap-3">
            {tournament.matches.length === 0 ? (
              <div className="grid gap-4 lg:grid-cols-3">
                {CREATION_STEPS.map((step) => (
                  <div
                    key={step.title}
                    className="rounded-[1.4rem] border border-white/8 bg-white/5 p-4"
                  >
                    <div className="text-[11px] uppercase tracking-[0.28em] text-white/45">
                      {step.eyebrow}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">{step.title}</div>
                    <div className="mt-3 text-sm leading-6 text-slate-300">{step.body}</div>
                  </div>
                ))}
              </div>
            ) : (
              tournament.matches.map((match) => (
                <div
                  key={match.id}
                  className="rounded-[1.45rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.024))] p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {match.label || `Round ${match.round} · Match ${match.position}`}
                      </div>
                      <div className="mt-1 text-sm text-slate-300">
                        {displayMatchPlayer(match.playerOne)} vs {displayMatchPlayer(match.playerTwo)}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Tag tone={match.status === "completed" ? "emerald" : "sky"}>
                        {getTournamentMatchStatusLabel(match.status)}
                      </Tag>
                      {match.proof ? <Tag tone="amber">Replay linked</Tag> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MetricTile
                      label="Scheduled"
                      value={match.scheduledAt ? formatMoment(match.scheduledAt) : "TBD"}
                    />
                    <MetricTile
                      label="Winner"
                      value={match.proof?.winner || "Awaiting result"}
                    />
                  </div>

                  {match.proof ? (
                    <div className="mt-4 rounded-[1.2rem] border border-emerald-400/18 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                      {match.proof.mapName || "Unknown map"}
                      {match.proof.playedOn ? ` · ${formatMoment(match.proof.playedOn)}` : ""}
                      {match.proof.originalFilename ? ` · ${match.proof.originalFilename}` : ""}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <Panel eyebrow="Room pulse" title="Latest tournament chatter" count={messages.length}>
          <div className="grid gap-3">
            {messages.length === 0 ? (
              <EmptyPanel message="No tournament chatter yet. Once the room wakes up, it lands here." />
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-[1.35rem] border border-white/8 bg-white/5 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-semibold text-white">
                      {displayName(message.user.inGameName, message.user.steamPersonaName)}
                    </div>
                    <div className="text-xs text-slate-400">{formatMoment(message.createdAt)}</div>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-300">{message.body}</div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <section className="rounded-[1.85rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.28)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">Why this page exists</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">A tournament should feel real before it starts</h2>
            </div>
            <TonePill tone="slate">Builder mode</TonePill>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <FactCard
              label="Featured slug"
              value={tournament.slug}
              helper="Stable route for every new featured event."
            />
            <FactCard
              label="Room slug"
              value={tournament.roomSlug}
              helper="Public chat surface backing this tournament rail."
            />
            <FactCard
              label="Starts"
              value={formatTournamentWindow(tournament.startsAt)}
              helper="Current published start window."
            />
            <FactCard
              label="Status"
              value={getTournamentStatusLabel(tournament.status)}
              helper="Planning, open, live, or completed."
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <InsightCard
              title="Identity"
              body="Steam-linked names and verification level make the entrant field feel trustworthy before the games even start."
            />
            <InsightCard
              title="Momentum"
              body="The queue, the room, and the bracket preview all move together so users can feel whether a tournament is actually gathering force."
            />
            <InsightCard
              title="Proof"
              body="Replay-linked matches turn a nice page into a competition record. That is the long-term spine of this route."
            />
          </div>
        </section>
      </section>
    </main>
  );
}

function Panel({
  eyebrow,
  title,
  count,
  children,
}: {
  eyebrow: string;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.85rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.28)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">{eyebrow}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        </div>
        {typeof count === "number" ? (
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {count}
          </div>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function TonePill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "amber" | "emerald" | "sky" | "slate";
}) {
  const toneClassName =
    tone === "amber"
      ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
        : tone === "sky"
          ? "border-sky-300/20 bg-sky-500/10 text-sky-100"
          : "border-white/10 bg-white/5 text-slate-300";

  return <span className={`rounded-full border px-3 py-1 text-xs ${toneClassName}`}>{children}</span>;
}

function HeroStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs text-slate-400">{helper}</div>
    </div>
  );
}

function MetricTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/8 bg-slate-950/60 p-4">
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function GlassPanel({
  eyebrow,
  title,
  body,
  tone,
}: {
  eyebrow: string;
  title: string;
  body: string;
  tone: "amber" | "sky";
}) {
  const toneClassName =
    tone === "amber"
      ? "border-amber-300/16 bg-[linear-gradient(135deg,rgba(251,191,36,0.08),rgba(8,13,24,0.94))]"
      : "border-sky-300/16 bg-[linear-gradient(135deg,rgba(59,130,246,0.08),rgba(8,13,24,0.94))]";

  return (
    <div className={`rounded-[1.55rem] border p-5 ${toneClassName}`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-white/45">{eyebrow}</div>
      <div className="mt-2 text-xl font-semibold text-white">{title}</div>
      <div className="mt-3 text-sm leading-6 text-slate-300">{body}</div>
    </div>
  );
}

function Tag({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "amber" | "emerald" | "sky" | "slate";
}) {
  const toneClassName =
    tone === "amber"
      ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
        : tone === "sky"
          ? "border-sky-300/20 bg-sky-500/10 text-sky-100"
          : "border-white/10 bg-white/5 text-slate-300";

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] ${toneClassName}`}>{children}</span>;
}

function FactCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/8 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{helper}</div>
    </div>
  );
}

function InsightCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-white/5 p-4">
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-3 text-sm leading-6 text-slate-300">{body}</div>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}
