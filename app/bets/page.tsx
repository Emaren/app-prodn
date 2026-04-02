"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getLobbyHeroBackground,
  getLobbyPresentationTone,
} from "@/components/lobby/lobbyPresentation";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { useUserAuth } from "@/context/UserAuthContext";
import {
  getFallbackLeaderboard,
  getFallbackTournament,
  getTournamentStatusLabel,
  type LobbyLeaderboardEntry,
  type LobbyMatchRow,
  type LobbySnapshot,
} from "@/lib/lobby";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.png";

type PendingBet = {
  challenger: string;
  betAmount: number;
  inactive?: boolean;
};

type MarketStatus = "Open" | "Closing" | "Live";

type MarketCard = {
  id: string;
  eventLabel: string;
  stageLabel: string;
  leftName: string;
  rightName: string;
  leftHref: string;
  rightHref: string;
  status: MarketStatus;
  potWolo: number;
  leftPayout: string;
  rightPayout: string;
  closingLabel: string;
  spotlight: string;
};

type SettledCard = {
  id: string;
  map: string;
  leftName: string;
  rightName: string;
  winner: string;
  label: string;
  payoutWolo: number;
};

const FALLBACK_FIGHTERS = [
  "Emaren",
  "Julio Alvarez",
  "Sniper",
  "Kaos",
  "Quadro",
  "Latin_k",
] as const;
const EMPTY_MATCHES: LobbyMatchRow[] = [];

function formatCompactWolo(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function hashValue(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1_000_003;
  }
  return Math.abs(hash);
}

function uniqueNames(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(normalized);
  }

  return results;
}

function marketStatusFromTournament(status: LobbySnapshot["tournament"]["status"]): MarketStatus {
  if (status === "active") return "Live";
  if (status === "open") return "Closing";
  return "Open";
}

function payoutPair(seed: string) {
  const hash = hashValue(seed);
  const favorite = 1.45 + (hash % 45) / 100;
  const underdog = 1.9 + ((Math.floor(hash / 7) % 70) / 100);

  return {
    left: `${favorite.toFixed(2)}x`,
    right: `${underdog.toFixed(2)}x`,
  };
}

function playerHrefByName(entries: LobbyLeaderboardEntry[]) {
  const mapping = new Map<string, string>();
  for (const entry of entries) {
    mapping.set(entry.name.toLowerCase(), entry.href);
  }
  return mapping;
}

function buildOpenMarkets(
  names: string[],
  hrefs: Map<string, string>,
  featuredLabel: string,
  featuredStatus: MarketStatus
) {
  const combinations: ReadonlyArray<readonly [number, number, string, MarketStatus, string]> = [
    [0, 1, featuredLabel, featuredStatus, "Main book"],
    [1, 2, "Rivalry board", "Closing", "Heavy action"],
    [0, 3, "Underdog line", "Open", "Spoils swing"],
    [2, 4, "Ladder heat", "Open", "Sharp action"],
    [3, 5, "Night raid", "Live", "Volume spike"],
  ];

  return combinations
    .map(([leftIndex, rightIndex, eventLabel, status, spotlight], index) => {
      const leftName = names[leftIndex] ?? FALLBACK_FIGHTERS[leftIndex % FALLBACK_FIGHTERS.length];
      const rightName =
        names[rightIndex] ?? FALLBACK_FIGHTERS[rightIndex % FALLBACK_FIGHTERS.length];
      if (!leftName || !rightName || leftName === rightName) return null;

      const seed = `${leftName}:${rightName}:${eventLabel}:${index}`;
      const payouts = payoutPair(seed);
      const potWolo = 140 + (hashValue(seed) % 360);
      const closingMinutes = 18 + (hashValue(`${seed}:time`) % 54);

      return {
        id: seed,
        eventLabel,
        stageLabel: index === 0 ? "Featured market" : "Open bet",
        leftName,
        rightName,
        leftHref: hrefs.get(leftName.toLowerCase()) || "/players",
        rightHref: hrefs.get(rightName.toLowerCase()) || "/players",
        status,
        potWolo,
        leftPayout: payouts.left,
        rightPayout: payouts.right,
        closingLabel: status === "Live" ? "In play now" : `Locks in ${closingMinutes}m`,
        spotlight: spotlight as string,
      } satisfies MarketCard;
    })
    .filter((market): market is MarketCard => Boolean(market));
}

function buildSettledCards(recentMatches: LobbyMatchRow[]) {
  const settled = recentMatches
    .map((match, index) => {
      const players =
        Array.isArray(match.players) && match.players.length > 1
          ? match.players
          : [{ name: "Unknown" }, { name: "Unknown" }];
      const leftName = players[0]?.name || "Unknown";
      const rightName = players[1]?.name || "Unknown";
      const winner = match.winner || leftName;
      const map =
        typeof match.map === "string"
          ? match.map
          : match.map && typeof match.map === "object" && "name" in match.map
            ? String(match.map.name || "Battlefield")
            : "Battlefield";
      const payoutWolo = 110 + (hashValue(`${match.id}:${winner}`) % 220);

      return {
        id: `${match.id}-${index}`,
        map,
        leftName,
        rightName,
        winner,
        label: match.parse_reason || "Replay-backed result",
        payoutWolo,
      } satisfies SettledCard;
    })
    .slice(0, 3);

  if (settled.length > 0) return settled;

  return [
    {
      id: "fallback-1",
      map: "Yucatan",
      leftName: "Emaren",
      rightName: "Julio Alvarez",
      winner: "Emaren",
      label: "Settlement rail armed",
      payoutWolo: 188,
    },
    {
      id: "fallback-2",
      map: "Arabia",
      leftName: "Sniper",
      rightName: "Kaos",
      winner: "Sniper",
      label: "Verified upset",
      payoutWolo: 162,
    },
    {
      id: "fallback-3",
      map: "Arena",
      leftName: "Quadro",
      rightName: "Latin_k",
      winner: "Latin_k",
      label: "War chest settled",
      payoutWolo: 144,
    },
  ];
}

function statusClasses(status: MarketStatus) {
  if (status === "Live") {
    return "border-red-400/25 bg-red-500/12 text-red-100";
  }
  if (status === "Closing") {
    return "border-amber-300/20 bg-amber-400/10 text-amber-100";
  }
  return "border-emerald-300/20 bg-emerald-500/10 text-emerald-100";
}

export default function BetsPage() {
  const { themeKey, viewMode } = useLobbyAppearance();
  const { isAuthenticated, loading, loginWithSteam, user } = useUserAuth();
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [pendingBets, setPendingBets] = useState<PendingBet[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadLobby() {
      try {
        const response = await fetch("/api/lobby", { cache: "no-store" });
        if (!response.ok) throw new Error("Lobby load failed.");
        const payload = (await response.json()) as LobbySnapshot;
        if (!cancelled) setLobby(payload);
      } catch (error) {
        console.warn("Failed to load betting context:", error);
      }
    }

    void loadLobby();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem("pendingBets") || "[]") as PendingBet[];
      setPendingBets(Array.isArray(stored) ? stored : []);
    } catch {
      setPendingBets([]);
    }
  }, []);

  const tone = useMemo(() => getLobbyPresentationTone(themeKey, viewMode), [themeKey, viewMode]);
  const heroStyle = useMemo(
    () => ({ backgroundImage: getLobbyHeroBackground(themeKey, viewMode) }),
    [themeKey, viewMode]
  );

  const tournament = lobby?.tournament ?? getFallbackTournament(false);
  const leaderboard = lobby?.leaderboard ?? getFallbackLeaderboard();
  const recentMatches = lobby?.recentMatches ?? EMPTY_MATCHES;

  const fighterNames = useMemo(() => {
    const tournamentNames = tournament.entrants.map(
      (entrant) => entrant.inGameName || entrant.steamPersonaName
    );
    const leaderboardNames = leaderboard.entries.map((entry) => entry.name);
    return uniqueNames([...tournamentNames, ...leaderboardNames, ...FALLBACK_FIGHTERS]).slice(0, 6);
  }, [leaderboard.entries, tournament.entrants]);

  const hrefs = useMemo(() => playerHrefByName(leaderboard.entries), [leaderboard.entries]);
  const openMarkets = useMemo(
    () =>
      buildOpenMarkets(
        fighterNames,
        hrefs,
        tournament.isFallback ? "Founders book" : tournament.title,
        marketStatusFromTournament(tournament.status)
      ),
    [fighterNames, hrefs, tournament.isFallback, tournament.status, tournament.title]
  );
  const featuredMarket = openMarkets[0];
  const secondaryMarkets = openMarkets.slice(1, 5);
  const settledCards = useMemo(() => buildSettledCards(recentMatches), [recentMatches]);

  const activePendingBets = pendingBets.filter((bet) => !bet.inactive);
  const pendingStake = activePendingBets.reduce((sum, bet) => sum + (bet.betAmount || 0), 0);
  const largestPot = openMarkets.reduce((max, market) => Math.max(max, market.potWolo), 0);
  const hottestMarket = openMarkets.reduce<MarketCard | null>(
    (current, market) => (!current || market.potWolo > current.potWolo ? market : current),
    null
  );
  const upsetCard = settledCards.reduce<SettledCard | null>(
    (current, market) => (!current || market.payoutWolo > current.payoutWolo ? market : current),
    null
  );

  const featuredPotLabel = featuredMarket ? formatCompactWolo(featuredMarket.potWolo) : "248";
  const spotlightEntrants = tournament.entryCount > 0 ? `${tournament.entryCount} entrants` : "Book opening";
  const userDisplayName = user?.inGameName || user?.steamPersonaName || "your war chest";

  return (
    <main className="space-y-4 overflow-x-hidden py-2 text-white sm:space-y-6 sm:py-3">
      <section
        className={`relative overflow-hidden rounded-[1.85rem] border p-5 shadow-[0_30px_90px_rgba(4,9,20,0.34)] sm:rounded-[2rem] sm:p-6 lg:p-8 ${tone.panelShell}`}
        style={heroStyle}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.09),transparent_28%)]" />
        <div className="pointer-events-none absolute right-[-3.5rem] top-[-2rem] opacity-[0.10] sm:right-[-2rem]">
          <Image
            src={WOLO_LOGO_SRC}
            alt=""
            width={360}
            height={368}
            className="h-[13rem] w-[13rem] object-contain sm:h-[17rem] sm:w-[17rem] lg:h-[20rem] lg:w-[20rem]"
          />
        </div>

        <div className="relative grid gap-6 xl:grid-cols-[1.04fr_0.96fr] xl:items-start">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.28em] ${tone.statusBadge}`}>
                Bets
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
                {featuredMarket?.status || "Open"} markets
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
                {spotlightEntrants}
              </span>
            </div>

            <div className="max-w-2xl">
              <div className={`text-[11px] uppercase tracking-[0.38em] ${tone.accentText}`}>
                War Book
              </div>
              <h1 className="mt-3 max-w-[12ch] text-4xl font-semibold leading-[0.95] tracking-[-0.04em] text-white sm:text-5xl lg:text-[4.25rem]">
                Where rivalries get priced.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/88 sm:text-base">
                Tournament markets, rivalry wagers, and $WOLO-backed stakes for the fighters who
                matter. Back your read, watch the pot swell, and claim the spoils when the proof lands.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Open markets" value={String(Math.max(openMarkets.length, 4))} tone={tone} />
              <MetricCard label="Largest pot" value={`${formatCompactWolo(largestPot || 248)} WOLO`} tone={tone} />
              <MetricCard label="Settled tonight" value={String(settledCards.length)} tone={tone} />
            </div>

            <div className="flex flex-wrap gap-3">
              {isAuthenticated ? (
                <>
                  <Link
                    href="/wallet"
                    className={`rounded-full px-5 py-3 text-sm font-semibold transition ${tone.primaryButton}`}
                  >
                    Open Wallet
                  </Link>
                  <Link
                    href="/pending-bets"
                    className={`rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`}
                  >
                    Open Your Book
                  </Link>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => loginWithSteam("/bets")}
                    disabled={loading}
                    className={`rounded-full px-5 py-3 text-sm font-semibold transition ${tone.primaryButton}`}
                  >
                    {loading ? "Loading..." : "Sign In To Wager"}
                  </button>
                  <Link
                    href="/wallet"
                    className={`rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`}
                  >
                    View Wallet Rail
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className={`relative overflow-hidden rounded-[1.8rem] border p-5 shadow-[0_26px_80px_rgba(4,9,20,0.34)] ${tone.insetPanel}`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.10),transparent_24%)]" />
            <div className="pointer-events-none absolute right-[-1rem] top-[-1rem] opacity-[0.08]">
              <Image
                src={WOLO_LOGO_SRC}
                alt=""
                width={240}
                height={246}
                className="h-[10rem] w-[10rem] object-contain sm:h-[12rem] sm:w-[12rem]"
              />
            </div>

            {featuredMarket ? (
              <div className="relative">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={`text-[11px] uppercase tracking-[0.34em] ${tone.accentText}`}>
                      Featured Market
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">{featuredMarket.eventLabel}</div>
                    <div className="mt-1 text-sm text-slate-300">{featuredMarket.stageLabel}</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${statusClasses(featuredMarket.status)}`}>
                    {featuredMarket.status}
                  </span>
                </div>

                <div className="mt-6 grid gap-4 rounded-[1.5rem] border border-white/8 bg-white/[0.04] p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <MarketSide name={featuredMarket.leftName} href={featuredMarket.leftHref} payout={featuredMarket.leftPayout} align="left" />
                  <div className="text-center">
                    <div className="text-[11px] uppercase tracking-[0.34em] text-slate-400">Pot</div>
                    <div className="mt-2 flex items-center justify-center gap-2 text-2xl font-semibold text-white">
                      <CoinMark />
                      <span>{featuredPotLabel}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{featuredMarket.closingLabel}</div>
                  </div>
                  <MarketSide name={featuredMarket.rightName} href={featuredMarket.rightHref} payout={featuredMarket.rightPayout} align="right" />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <ActionLink href={featuredMarket.leftHref} className={tone.primaryButton}>
                    Back {featuredMarket.leftName}
                  </ActionLink>
                  <ActionLink href={featuredMarket.rightHref} className={tone.secondaryButton}>
                    Back {featuredMarket.rightName}
                  </ActionLink>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                  <span>{featuredMarket.spotlight}</span>
                  <span>{getTournamentStatusLabel(tournament.status)} tournament rail</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <SectionCard title="Open Bets" eyebrow="Market Board" tone={tone}>
            <div className="grid gap-4 md:grid-cols-2">
              {secondaryMarkets.map((market) => (
                <article
                  key={market.id}
                  className={`rounded-[1.5rem] border p-4 transition ${tone.card}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`text-[11px] uppercase tracking-[0.28em] ${tone.accentText}`}>
                        {market.eventLabel}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {market.leftName} vs {market.rightName}
                      </div>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs ${statusClasses(market.status)}`}>
                      {market.status}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.035] px-4 py-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Pot</div>
                      <div className="mt-1 flex items-center gap-2 text-base font-semibold text-white">
                        <CoinMark small />
                        <span>{formatCompactWolo(market.potWolo)} WOLO</span>
                      </div>
                    </div>
                    <div className="text-right text-sm text-slate-300">
                      <div>{market.leftPayout}</div>
                      <div>{market.rightPayout}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <ActionLink href={market.leftHref} className={tone.primaryButton}>
                      {market.leftName}
                    </ActionLink>
                    <ActionLink href={market.rightHref} className={tone.secondaryButton}>
                      {market.rightName}
                    </ActionLink>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span>{market.spotlight}</span>
                    <span>{market.closingLabel}</span>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Settled Results" eyebrow="Payout Proof" tone={tone}>
            <div className="grid gap-4">
              {settledCards.map((card) => (
                <article
                  key={card.id}
                  className={`rounded-[1.5rem] border p-4 ${tone.card}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className={`text-[11px] uppercase tracking-[0.28em] ${tone.accentText}`}>
                        {card.map}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {card.leftName} vs {card.rightName}
                      </div>
                      <div className="mt-1 text-sm text-slate-300">{card.label}</div>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-xs ${tone.resultPill}`}>
                      Winner: {card.winner}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <CoinMark small />
                      <span>{formatCompactWolo(card.payoutWolo)} WOLO paid</span>
                    </div>
                    <div className="text-sm text-slate-400">Replay-backed result</div>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Your Wagers" eyebrow="Personal Book" tone={tone}>
            {isAuthenticated ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricCard label="Active" value={String(activePendingBets.length)} tone={tone} compact />
                  <MetricCard label="Staked" value={`${formatCompactWolo(pendingStake || 0)} WOLO`} tone={tone} compact />
                  <MetricCard label="Rail" value={userDisplayName} tone={tone} compact />
                </div>

                {activePendingBets.length > 0 ? (
                  <div className="space-y-3">
                    {activePendingBets.slice(0, 3).map((bet, index) => (
                      <div
                        key={`${bet.challenger}-${index}`}
                        className={`flex items-center justify-between gap-3 rounded-[1.2rem] border px-4 py-3 ${tone.card}`}
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">{bet.challenger}</div>
                          <div className="text-xs text-slate-400">Pending wager</div>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                          <CoinMark small />
                          <span>{formatCompactWolo(bet.betAmount || 0)} WOLO</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`rounded-[1.35rem] border p-4 ${tone.card}`}>
                    <div className="text-base font-semibold text-white">No wagers posted yet.</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Read the board, wait for the line to feel wrong, then strike.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/pending-bets"
                    className={`rounded-full border px-4 py-2.5 text-sm transition ${tone.secondaryButton}`}
                  >
                    Open Pending Bets
                  </Link>
                  <Link
                    href="/wallet"
                    className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${tone.primaryButton}`}
                  >
                    Fund War Chest
                  </Link>
                </div>
              </div>
            ) : (
              <div className={`rounded-[1.35rem] border p-4 ${tone.card}`}>
                <div className="text-base font-semibold text-white">Sign in to place wagers and track your book.</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  The public board is open to everyone, but your personal war chest only comes alive after Steam sign-in.
                </p>
                <button
                  type="button"
                  onClick={() => loginWithSteam("/bets")}
                  className={`mt-4 rounded-full px-4 py-2.5 text-sm font-semibold transition ${tone.primaryButton}`}
                >
                  Sign In To Enter The Book
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Hot Markets" eyebrow="Heat Check" tone={tone}>
            <div className="space-y-3">
              <HeatRow
                label="Biggest pot"
                value={
                  hottestMarket
                    ? `${hottestMarket.leftName} vs ${hottestMarket.rightName}`
                    : "Market arming"
                }
                detail={`${formatCompactWolo(largestPot || 248)} WOLO in the book`}
                tone={tone}
              />
              <HeatRow
                label="Best underdog"
                value={secondaryMarkets[1]?.rightName || "Julio Alvarez"}
                detail={secondaryMarkets[1]?.rightPayout || "2.24x payout rail"}
                tone={tone}
              />
              <HeatRow
                label="Latest upset"
                value={upsetCard?.winner || "Sniper"}
                detail={upsetCard ? `${formatCompactWolo(upsetCard.payoutWolo)} WOLO paid` : "Upset rail arming"}
                tone={tone}
              />
              <HeatRow
                label="Tournament spotlight"
                value={tournament.title}
                detail={tournament.entryCount > 0 ? `${tournament.entryCount} fighters on deck` : "Book opens with the first bracket"}
                tone={tone}
              />
            </div>
          </SectionCard>
        </div>
      </section>
    </main>
  );
}

function SectionCard({
  title,
  eyebrow,
  tone,
  children,
}: {
  title: string;
  eyebrow: string;
  tone: ReturnType<typeof getLobbyPresentationTone>;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-[1.75rem] border p-5 shadow-[0_24px_70px_rgba(4,9,20,0.26)] sm:p-6 ${tone.panelShell}`}>
      <div className={`text-[11px] uppercase tracking-[0.34em] ${tone.accentText}`}>{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string;
  value: string;
  tone: ReturnType<typeof getLobbyPresentationTone>;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-[1.35rem] border px-4 py-4 ${tone.statDefault}`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</div>
      <div className={`mt-3 font-semibold tracking-tight text-white ${compact ? "text-xl" : "text-3xl"}`}>
        {value}
      </div>
    </div>
  );
}

function MarketSide({
  name,
  href,
  payout,
  align,
}: {
  name: string;
  href: string;
  payout: string;
  align: "left" | "right";
}) {
  return (
    <Link
      href={href}
      className={`rounded-[1.2rem] border border-white/8 bg-white/[0.035] px-4 py-4 transition hover:border-white/16 hover:bg-white/[0.06] ${align === "right" ? "text-right" : ""}`}
    >
      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{align === "left" ? "Back" : "Fade"}</div>
      <div className="mt-2 text-xl font-semibold text-white">{name}</div>
      <div className="mt-1 text-sm text-slate-300">{payout} payout</div>
    </Link>
  );
}

function CoinMark({ small = false }: { small?: boolean }) {
  return (
    <Image
      src={WOLO_LOGO_SRC}
      alt=""
      width={small ? 18 : 24}
      height={small ? 18 : 24}
      className={small ? "h-[18px] w-[18px] object-contain" : "h-6 w-6 object-contain"}
    />
  );
}

function ActionLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm transition ${className}`}>
      {children}
    </Link>
  );
}

function HeatRow({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: ReturnType<typeof getLobbyPresentationTone>;
}) {
  return (
    <div className={`rounded-[1.2rem] border px-4 py-3 ${tone.card}`}>
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className="mt-2 text-base font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-300">{detail}</div>
    </div>
  );
}
