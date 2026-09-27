"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Shield, Swords, Trophy, UsersRound } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/context/UserAuthContext";
import { payWoloOnChain } from "@/lib/clientMarketplacePayment";
import type { LeagueMode, LeagueTeamSize, PublicLeague } from "@/lib/leagues";

type LeaguePaymentQuote = {
  ok: true;
  requestId: string;
  amountWolo: number;
  recipientAddress: string;
  recipientUid: string;
  recipientLabel: string;
  memo: string;
};

type LeagueCreationResponse = {
  ok: true;
  href: string;
  league: PublicLeague;
};

type PendingLeaguePayment = {
  requestId: string;
  name: string;
  description: string;
  teamSize: LeagueTeamSize;
  mode: LeagueMode;
  txHash: string;
  fromAddress: string;
};

const FORMATS: Array<{ teamSize: LeagueTeamSize; label: string; detail: string }> = [
  { teamSize: 1, label: "1v1", detail: "The pure duel. One throne, one rival, nowhere to hide." },
  { teamSize: 2, label: "2v2", detail: "Pairs, chemistry, rescues, collapses, and shared pressure." },
  { teamSize: 3, label: "3v3", detail: "Three-front warfare where one weak flank can break a kingdom." },
  { teamSize: 4, label: "4v4", detail: "The full war table. Eight players and a map full of consequences." },
];

function modeLabel(mode: LeagueMode) {
  return mode === "rm" ? "RM" : "DM";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

async function readJson<T>(response: Response) {
  return (await response.json().catch(() => ({}))) as T & { detail?: string };
}

export default function LeaguesPageClient({
  leagues,
}: {
  leagues: PublicLeague[];
}) {
  const router = useRouter();
  const { uid } = useUserAuth();
  const [laneModes, setLaneModes] = useState<Record<number, LeagueMode>>({
    1: "rm",
    2: "rm",
    3: "rm",
    4: "rm",
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamSize, setTeamSize] = useState<LeagueTeamSize>(1);
  const [mode, setMode] = useState<LeagueMode>("rm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<LeagueCreationResponse | null>(null);
  const [pendingPayment, setPendingPayment] =
    useState<PendingLeaguePayment | null>(null);

  const leagueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const league of leagues) {
      const key = `${league.teamSize}:${league.mode}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [leagues]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!uid || busy) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give the league a name.");
      return;
    }

    setBusy(true);
    setError(null);
    setCreated(null);

    try {
      let charter = pendingPayment;

      if (!charter) {
        const requestId = crypto.randomUUID();
        const quoteResponse = await fetch(
          `/api/leagues/quote?requestId=${encodeURIComponent(requestId)}`,
          { cache: "no-store" },
        );
        const quote = await readJson<LeaguePaymentQuote>(quoteResponse);
        if (!quoteResponse.ok || !quote.ok) {
          throw new Error(quote.detail || "League creation quote unavailable.");
        }

        const payment = await payWoloOnChain({
          recipientAddress: quote.recipientAddress,
          amountWolo: quote.amountWolo,
          memo: quote.memo,
        });

        charter = {
          requestId,
          name: trimmedName,
          description,
          teamSize,
          mode,
          txHash: payment.transactionHash,
          fromAddress: payment.walletAddress,
        };
        setPendingPayment(charter);
      }

      const response = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(charter),
      });
      const payload = await readJson<LeagueCreationResponse>(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.detail || "League creation failed.");
      }

      setCreated(payload);
      setPendingPayment(null);
      setName("");
      setDescription("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The league could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[96rem] space-y-8 overflow-x-hidden px-3 py-4 text-white sm:px-5 sm:py-6">
      <section className="overflow-hidden rounded-[2.4rem] border border-amber-100/14 bg-[radial-gradient(circle_at_14%_18%,rgba(251,191,36,0.16),transparent_25%),radial-gradient(circle_at_82%_16%,rgba(59,130,246,0.15),transparent_28%),linear-gradient(135deg,#07101c,#050814_54%,#100812)] p-6 shadow-[0_44px_140px_rgba(0,0,0,0.46)] sm:p-8 lg:p-10">
        <div className="max-w-4xl">
          <div className="text-[10px] font-black uppercase tracking-[0.38em] text-amber-100/60">
            AoE2WAR competition system
          </div>
          <h1 className="mt-4 font-serif text-5xl font-semibold tracking-[-0.045em] text-white sm:text-6xl">
            LEAGUES
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">
            Four formats. Two rule sets. A permanent place for recurring competition.
            Every format has its own RM and DM lane, and any signed-in warrior can found
            a new league with one verified 100 WOLO transaction.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
            {["1v1", "2v2", "3v3", "4v4", "RM", "DM"].map((label) => (
              <span key={label} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
              The four war tables
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Choose the battlefield</h2>
          </div>
          <div className="text-xs text-slate-500">RM / DM toggles are independent per format</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {FORMATS.map((format) => {
            const activeMode = laneModes[format.teamSize] ?? "rm";
            const count = leagueCounts.get(`${format.teamSize}:${activeMode}`) ?? 0;
            return (
              <article
                key={format.teamSize}
                className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.94),rgba(3,7,18,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-amber-100">
                      <UsersRound className="h-4 w-4" />
                      <span className="text-[10px] font-black uppercase tracking-[0.24em]">
                        {format.teamSize === 1 ? "Duel league" : "Team league"}
                      </span>
                    </div>
                    <h3 className="mt-3 font-serif text-4xl font-semibold">{format.label}</h3>
                  </div>
                  <div className="flex rounded-full border border-white/10 bg-black/25 p-1">
                    {(["rm", "dm"] as LeagueMode[]).map((nextMode) => (
                      <button
                        key={nextMode}
                        type="button"
                        onClick={() =>
                          setLaneModes((current) => ({
                            ...current,
                            [format.teamSize]: nextMode,
                          }))
                        }
                        aria-pressed={activeMode === nextMode}
                        className={`rounded-full px-4 py-2 text-xs font-black transition ${
                          activeMode === nextMode
                            ? "bg-amber-300 text-slate-950"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {modeLabel(nextMode)}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="mt-4 min-h-[3.5rem] text-sm leading-6 text-slate-400">
                  {format.detail}
                </p>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-[1rem] border border-white/8 bg-black/22 px-4 py-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Ruleset</div>
                    <div className="mt-1 text-lg font-semibold text-white">{modeLabel(activeMode)}</div>
                  </div>
                  <div className="rounded-[1rem] border border-white/8 bg-black/22 px-4 py-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Community leagues</div>
                    <div className="mt-1 text-lg font-semibold text-amber-100">{count}</div>
                  </div>
                </div>

                <div className="mt-5 rounded-[1rem] border border-dashed border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-slate-400">
                  Founding season. Standings, schedules, promotion, and trophies attach here as this lane fills.
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-amber-100">
            <Trophy className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.28em]">Community league registry</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold">Founded by warriors</h2>

          <div className="mt-5 grid gap-3">
            {leagues.length ? leagues.map((league) => (
              <Link
                key={league.publicId}
                href={`/leagues/${encodeURIComponent(league.slug)}`}
                className="group rounded-[1.25rem] border border-white/8 bg-white/[0.025] p-4 transition hover:border-amber-200/24 hover:bg-amber-300/[0.05]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white group-hover:text-amber-100">{league.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Founded by {league.creatorDisplayName} · {formatDate(league.createdAt)}
                    </div>
                  </div>
                  <span className="rounded-full border border-amber-200/18 bg-amber-300/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                    {league.teamSize}v{league.teamSize} · {modeLabel(league.mode)}
                  </span>
                </div>
                {league.description ? (
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">{league.description}</p>
                ) : null}
              </Link>
            )) : (
              <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
                <Swords className="mx-auto h-7 w-7 text-slate-600" />
                <div className="mt-3 font-semibold text-slate-300">No community league has been founded yet.</div>
                <div className="mt-1 text-sm text-slate-500">The first 100 WOLO charter writes the first name into the registry.</div>
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-[2rem] border border-amber-200/18 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_32%),linear-gradient(145deg,rgba(25,18,8,0.82),rgba(5,9,18,0.96))] p-5 sm:p-6"
        >
          <div className="flex items-center gap-2 text-amber-100">
            <Shield className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.28em]">Found a league</span>
          </div>
          <h2 className="mt-3 font-serif text-3xl font-semibold">100 WOLO charter</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            One signed WoloChain transaction to the AoE2WAR Commissioner creates the league.
            The transaction hash and exact memo become permanent founding proof.
          </p>

          <label className="mt-5 block">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">League name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 160))}
              maxLength={160}
              disabled={Boolean(pendingPayment)}
              placeholder="Northern Siege League"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-200/30"
            />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Format</span>
              <select
                value={teamSize}
                disabled={Boolean(pendingPayment)}
                onChange={(event) => setTeamSize(Number(event.target.value) as LeagueTeamSize)}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#070b14] px-3 text-sm text-white outline-none"
              >
                {FORMATS.map((format) => (
                  <option key={format.teamSize} value={format.teamSize}>{format.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Ruleset</span>
              <select
                value={mode}
                disabled={Boolean(pendingPayment)}
                onChange={(event) => setMode(event.target.value as LeagueMode)}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#070b14] px-3 text-sm text-white outline-none"
              >
                <option value="rm">RM</option>
                <option value="dm">DM</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">League charter</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 1200))}
              maxLength={1200}
              disabled={Boolean(pendingPayment)}
              rows={5}
              placeholder="Who is this league for? What should its season feel like?"
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-amber-200/30"
            />
          </label>

          {pendingPayment ? (
            <div className="mt-4 rounded-xl border border-amber-200/18 bg-amber-300/[0.07] px-3 py-2.5 text-xs leading-5 text-amber-100">
              100 WOLO is already signed for this charter. Retry records the same transaction; it does not charge again.
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200/18 bg-rose-300/[0.07] px-3 py-2.5 text-xs leading-5 text-rose-100">
              {error}
            </div>
          ) : null}

          {created ? (
            <div className="mt-4 rounded-xl border border-emerald-200/18 bg-emerald-300/[0.07] p-4">
              <div className="flex items-center gap-2 font-semibold text-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
                League founded
              </div>
              <Link href={created.href} className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-amber-100 hover:text-amber-50">
                Enter {created.league.name}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}

          {uid ? (
            <button
              type="submit"
              disabled={busy}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-amber-200/30 bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {pendingPayment ? "Recording charter…" : "Signing 100 WOLO…"}
                </>
              ) : pendingPayment ? (
                <>
                  Retry charter · already paid
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Found league · 100 WOLO
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          ) : (
            <SteamLoginButton
              label="Sign in to found a league"
              returnTo="/leagues"
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-amber-200/30 bg-amber-300 px-5 text-sm font-black text-slate-950"
            />
          )}
        </form>
      </section>
    </main>
  );
}
