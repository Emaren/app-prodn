"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  Coins,
  Crown,
  FileClock,
  Gem,
  History,
  Home,
  Images,
  Link2,
  Loader2,
  RefreshCw,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Swords,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { useUserAuth } from "@/context/UserAuthContext";
import type {
  TrophyChallengeRow,
  TrophyCommandSnapshot,
  TrophyEventRow,
  TrophyRow,
} from "@/lib/trophies/types";

type TabKey =
  | "overview"
  | "belts"
  | "artifacts"
  | "challenges"
  | "payouts"
  | "chain"
  | "settings"
  | "audit";

const TABS: Array<{ key: TabKey; label: string; Icon: typeof Crown }> = [
  { key: "overview", label: "Overview", Icon: Crown },
  { key: "belts", label: "Belts", Icon: Shield },
  { key: "artifacts", label: "Artifacts", Icon: Gem },
  { key: "challenges", label: "Challenges", Icon: Swords },
  { key: "payouts", label: "Payouts", Icon: WalletCards },
  { key: "chain", label: "Chain Events", Icon: Link2 },
  { key: "settings", label: "Settings", Icon: Settings },
  { key: "audit", label: "Audit Log", Icon: History },
];

const ADMIN_NAV = [
  { href: "/admin", label: "Admin Home", Icon: Home },
  { href: "/admin/events", label: "Event Studio", Icon: CalendarRange },
  { href: "/admin/trophies", label: "Trophy Command", Icon: Crown },
  { href: "/admin/media-assets", label: "Media Assets", Icon: Images },
  { href: "/admin/wolochain", label: "WoloChain", Icon: Coins },
  { href: "/admin/user-list", label: "User Command", Icon: UsersRound },
] as const;

const CHAIN_EVENT_TYPES = new Set([
  "NFT_MINT_REQUESTED",
  "NFT_MINT_CONFIRMED",
  "NFT_ASSIGN_REQUESTED",
  "NFT_ASSIGN_CONFIRMED",
  "NFT_REASSIGN_REQUESTED",
  "NFT_REASSIGN_CONFIRMED",
  "NFT_RETIRE_REQUESTED",
  "NFT_RETIRE_CONFIRMED",
  "NFT_BURN_REQUESTED",
  "PAYOUT_REQUESTED",
  "PAYOUT_CONFIRMED",
  "CHAIN_QUERY_FAILED",
  "CHAIN_TX_FAILED",
  "APP_CHAIN_MISMATCH",
  "WATCHER_PROOF_ATTACHED",
  "REPLAY_VERIFIED",
  "SETTLEMENT_DRY_RUN",
  "SETTLEMENT_FAILED",
]);

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function shortAddress(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 20) return value;
  return `${value.slice(0, 10)}…${value.slice(-7)}`;
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (
    normalized.includes("active") ||
    normalized.includes("held") ||
    normalized.includes("settled") ||
    normalized.includes("confirmed") ||
    normalized.includes("paid")
  ) {
    return "border-emerald-300/24 bg-emerald-400/10 text-emerald-100";
  }
  if (
    normalized.includes("failed") ||
    normalized.includes("disputed") ||
    normalized.includes("forfeiture") ||
    normalized.includes("mismatch")
  ) {
    return "border-rose-300/24 bg-rose-400/10 text-rose-100";
  }
  if (
    normalized.includes("pending") ||
    normalized.includes("dry_run") ||
    normalized.includes("guardian") ||
    normalized.includes("retry")
  ) {
    return "border-amber-300/24 bg-amber-400/10 text-amber-100";
  }
  return "border-white/10 bg-white/[0.05] text-slate-300";
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusTone(value)}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function JsonDetails({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  if (value === null || typeof value === "undefined") return null;
  return (
    <details className="rounded-xl border border-white/8 bg-black/18 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-slate-300">{label}</summary>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-5 text-slate-400">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function StatCard({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string | number;
  detail?: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        warning
          ? "border-rose-300/22 bg-rose-400/8"
          : "border-white/10 bg-white/[0.045]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      {detail ? <div className="mt-2 text-xs leading-5 text-slate-400">{detail}</div> : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full min-w-0 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-200/35";

function Button({
  children,
  onClick,
  disabled,
  tone = "neutral",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "gold" | "danger";
}) {
  const classes = {
    neutral: "border-white/10 bg-white/[0.045] text-slate-200 hover:border-white/22",
    gold: "border-amber-200/20 bg-amber-300/12 text-amber-100 hover:bg-amber-300/18",
    danger: "border-rose-300/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/16",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${classes}`}
    >
      {children}
    </button>
  );
}

export default function TrophyCommandCenter() {
  const { isAuthenticated, isAdmin } = useUserAuth();
  const [snapshot, setSnapshot] = useState<TrophyCommandSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/admin/trophies", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as
        | TrophyCommandSnapshot
        | { detail?: string };
      if (!response.ok || !("overview" in payload)) {
        throw new Error("detail" in payload ? payload.detail : "Trophy Command failed to load.");
      }
      setSnapshot(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Trophy Command failed to load.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/trophies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const next = (await response.json().catch(() => ({}))) as
        | TrophyCommandSnapshot
        | { detail?: string };
      if (!response.ok || !("overview" in next)) {
        throw new Error("detail" in next ? next.detail : "Trophy Command action failed.");
      }
      setSnapshot(next);
      setNotice(success);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Trophy Command action failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="rounded-[2rem] border border-rose-300/20 bg-slate-950/80 p-8">
          <AlertTriangle className="h-8 w-8 text-rose-200" />
          <h1 className="mt-4 text-3xl font-semibold">Admin access required</h1>
          <p className="mt-3 text-slate-400">Trophy custody, payouts, and settlement controls are operator-only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[96rem] space-y-5 overflow-x-hidden py-6 text-white">
      <section className="relative overflow-hidden rounded-[2rem] border border-amber-200/16 bg-[radial-gradient(circle_at_16%_0%,rgba(251,191,36,0.18),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.12),transparent_28%),linear-gradient(145deg,rgba(15,12,8,0.98),rgba(4,10,20,0.98))] p-5 shadow-[0_36px_120px_rgba(0,0,0,0.42)] sm:p-7">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-amber-100/72">
              <Crown className="h-4 w-4" />
              AoE2WAR Trophy Command
            </div>
            <h1 className="mt-3 font-serif text-3xl font-semibold uppercase tracking-[0.08em] text-amber-50 sm:text-5xl">
              War Trophy Control Tower
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Belts, artifacts, Guardian custody, replay proof, dry-run payouts, NFT intent diagnostics, and the permanent audit trail.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busy}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm text-slate-200 transition hover:border-white/24 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <nav className="relative z-10 mt-6 flex gap-2 overflow-x-auto pb-1">
          {ADMIN_NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${
                href === "/admin/trophies"
                  ? "border-amber-200/28 bg-amber-300/12 text-amber-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-300/24 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-300/24 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/8 bg-black/20 p-2">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              activeTab === key
                ? "bg-amber-300 text-slate-950"
                : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {loading || !snapshot ? (
        <div className="grid min-h-64 place-items-center rounded-[2rem] border border-white/10 bg-black/20">
          <Loader2 className="h-8 w-8 animate-spin text-amber-200" />
        </div>
      ) : (
        <>
          {activeTab === "overview" ? <Overview snapshot={snapshot} /> : null}
          {activeTab === "belts" ? (
            <TrophyDefinitions
              trophies={snapshot.trophies.filter((trophy) => trophy.kind === "belt")}
              users={snapshot.users}
              busy={busy}
              onAction={runAction}
            />
          ) : null}
          {activeTab === "artifacts" ? (
            <ArtifactDefinitions
              trophies={snapshot.trophies.filter((trophy) => trophy.kind === "artifact")}
              users={snapshot.users}
              busy={busy}
              onAction={runAction}
            />
          ) : null}
          {activeTab === "challenges" ? (
            <Challenges
              snapshot={snapshot}
              busy={busy}
              onAction={runAction}
            />
          ) : null}
          {activeTab === "payouts" ? (
            <Payouts snapshot={snapshot} busy={busy} onAction={runAction} />
          ) : null}
          {activeTab === "chain" ? (
            <EventLedger
              events={snapshot.events.filter((event) => CHAIN_EVENT_TYPES.has(event.eventType))}
              title="Chain and proof black box"
              body="NFT intents are logged here even while app-only mode is authoritative. No private keys or chain writes live in this repo."
              busy={busy}
              onAction={runAction}
            />
          ) : null}
          {activeTab === "settings" ? (
            <TrophySettings snapshot={snapshot} busy={busy} onAction={runAction} />
          ) : null}
          {activeTab === "audit" ? (
            <EventLedger
              events={snapshot.events}
              title="Permanent Trophy audit"
              body="Holder, Guardian, nationality, economics, proof, settlement, payout, and NFT-intent changes."
              busy={busy}
              onAction={runAction}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function Overview({ snapshot }: { snapshot: TrophyCommandSnapshot }) {
  const overview = snapshot.overview;
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Active" value={overview.activeTrophies} detail="Held and earning." />
        <StatCard label="Vacant" value={overview.vacantTrophies} detail="Open throne state." />
        <StatCard label="Guardian-held" value={overview.guardianHeldTrophies} detail="Activation fights." />
        <StatCard label="App-only" value={overview.appOnlyTrophies} detail="Current custody source." />
        <StatCard label="Chain-backed" value={overview.chainBackedTrophies} detail={`${overview.mintedNfts} minted NFTs`} />
        <StatCard
          label="Eligibility conflicts"
          value={overview.eligibilityConflicts}
          detail="Nationality or ELO drift."
          warning={overview.eligibilityConflicts > 0}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.7rem] border border-white/10 bg-black/22 p-5">
          <div className="text-xs uppercase tracking-[0.28em] text-slate-500">War economy</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Daily tribute" value={`${overview.totalDailyTribute} WOLO`} />
            <StatCard label="Daily bounty growth" value={`${overview.totalDailyBountyGrowth} WOLO`} />
            <StatCard label="Yearly exposure" value={`${overview.estimatedYearlyExposure.toLocaleString()} WOLO`} />
            <StatCard label="Pending payouts" value={overview.pendingPayouts} warning={overview.failedPayouts > 0} />
          </div>
        </div>
        <div className="rounded-[1.7rem] border border-amber-200/14 bg-[linear-gradient(145deg,rgba(251,191,36,0.10),rgba(0,0,0,0.28))] p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-amber-100/70">
            <WalletCards className="h-4 w-4" />
            Tribute Engine
          </div>
          <div className="mt-4 text-xl font-semibold text-white">
            {overview.trophyRewardsWalletStatus}
          </div>
          <div className="mt-2 text-2xl font-black text-amber-100">
            {overview.trophyRewardsWalletBalanceWolo !== null
              ? `${overview.trophyRewardsWalletBalanceWolo.toLocaleString(undefined, { maximumFractionDigits: 6 })} WOLO`
              : "Balance unavailable"}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {overview.trophyRewardsWalletDetail}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl border border-white/10 bg-black/24 p-3">
              <div className="uppercase tracking-[0.18em] text-slate-500">Due now</div>
              <div className="mt-1 text-lg font-bold text-white">{overview.trophyTributeDueNow}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/24 p-3">
              <div className="uppercase tracking-[0.18em] text-slate-500">Paid today</div>
              <div className="mt-1 text-lg font-bold text-white">{overview.trophyTributePaidToday}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/24 p-3">
              <div className="uppercase tracking-[0.18em] text-slate-500">Failed</div>
              <div className="mt-1 text-lg font-bold text-white">{overview.trophyTributeFailed}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/24 p-3">
              <div className="uppercase tracking-[0.18em] text-slate-500">Next UTC day</div>
              <div className="mt-1 text-lg font-bold text-white">{overview.trophyTributeNextUtcDay}</div>
            </div>
          </div>
          {overview.trophyTributeLastTxHash ? (
            <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-400/10 p-3 text-xs text-emerald-100">
              Last tribute: {overview.trophyTributeLastRecipient || "holder"} · {shortAddress(overview.trophyTributeLastTxHash)}
            </div>
          ) : null}
          {overview.trophyRewardsWalletAddress ? (
            <div className="mt-3 text-[11px] text-slate-500">
              Wallet: {shortAddress(overview.trophyRewardsWalletAddress)}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pending challenges" value={overview.pendingChallenges} />
        <StatCard label="Failed payouts" value={overview.failedPayouts} warning={overview.failedPayouts > 0} />
        <StatCard label="Failed chain events" value={overview.failedChainEvents} warning={overview.failedChainEvents > 0} />
      </section>
    </div>
  );
}

function TrophyDefinitions({
  trophies,
  users,
  busy,
  onAction,
}: {
  trophies: TrophyRow[];
  users: TrophyCommandSnapshot["users"];
  busy: boolean;
  onAction: (payload: Record<string, unknown>, success: string) => Promise<void>;
}) {
  const [trophyKey, setTrophyKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [family, setFamily] = useState<"national" | "elo">("national");
  const [eligibleNationality, setEligibleNationality] = useState("Canada");
  const [eloBandMin, setEloBandMin] = useState("");
  const [eloBandMax, setEloBandMax] = useState("");
  const [dailyWolo, setDailyWolo] = useState("1");

  return (
    <section className="space-y-4">
      <div className="rounded-[1.5rem] border border-white/10 bg-black/22 p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-amber-100/70">Belt registry</div>
        <h2 className="mt-2 text-2xl font-semibold">National and ELO custody</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Holder assignment enforces eligibility unless an admin override is explicitly recorded. Guardian custody never changes the Guardian&apos;s nationality.
        </p>
      </div>
      <div className="rounded-[1.5rem] border border-amber-200/12 bg-amber-300/[0.035] p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-amber-100/65">Definition foundry</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <Field label="Belt id">
            <input className={inputClass} value={trophyKey} onChange={(event) => setTrophyKey(event.target.value)} placeholder="legend_champion_belt" />
          </Field>
          <Field label="Display name">
            <input className={inputClass} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Legend Championship" />
          </Field>
          <Field label="Family">
            <select className={inputClass} value={family} onChange={(event) => setFamily(event.target.value as "national" | "elo")}>
              <option value="national">National</option>
              <option value="elo">ELO</option>
            </select>
          </Field>
          {family === "national" ? (
            <Field label="Eligible nationality">
              <select className={inputClass} value={eligibleNationality} onChange={(event) => setEligibleNationality(event.target.value)}>
                {["Canada", "USA", "Mexico", "UK"].map((country) => <option key={country}>{country}</option>)}
              </select>
            </Field>
          ) : (
            <>
              <Field label="ELO minimum">
                <input className={inputClass} inputMode="numeric" value={eloBandMin} onChange={(event) => setEloBandMin(event.target.value)} />
              </Field>
              <Field label="ELO maximum">
                <input className={inputClass} inputMode="numeric" value={eloBandMax} onChange={(event) => setEloBandMax(event.target.value)} />
              </Field>
            </>
          )}
          <Field label="Tribute / bounty day">
            <input className={inputClass} inputMode="numeric" value={dailyWolo} onChange={(event) => setDailyWolo(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button
              tone="gold"
              disabled={busy || !trophyKey || !displayName}
              onClick={() =>
                void onAction(
                  {
                    action: "create_trophy",
                    trophyKey,
                    displayName,
                    kind: "belt",
                    family,
                    tier: family === "national" ? "National" : "ELO",
                    eligibleNationality: family === "national" ? eligibleNationality : null,
                    eloBandMin: family === "elo" ? eloBandMin : null,
                    eloBandMax: family === "elo" ? eloBandMax : null,
                    tributeAmountWolo: dailyWolo,
                    bountyGrowthWolo: dailyWolo,
                  },
                  `${displayName} belt definition created.`
                )
              }
            >
              Create belt
            </Button>
          </div>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {trophies.map((trophy) => (
          <TrophyControlCard
            key={`${trophy.id}:${trophy.updatedAt}`}
            trophy={trophy}
            users={users}
            busy={busy}
            onAction={onAction}
          />
        ))}
      </div>
    </section>
  );
}

function TrophyControlCard({
  trophy,
  users,
  busy,
  onAction,
}: {
  trophy: TrophyRow;
  users: TrophyCommandSnapshot["users"];
  busy: boolean;
  onAction: (payload: Record<string, unknown>, success: string) => Promise<void>;
}) {
  const [holderUserId, setHolderUserId] = useState(String(trophy.currentHolderUserId || ""));
  const [guardianUserId, setGuardianUserId] = useState(String(trophy.guardianHolderUserId || ""));
  const [tribute, setTribute] = useState(String(trophy.tributeAmountWolo));
  const [growth, setGrowth] = useState(String(trophy.bountyGrowthWolo));
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [chainOwner, setChainOwner] = useState(trophy.chainOwnerAddress || "");
  const [chainStatus, setChainStatus] = useState(trophy.chainStatus);
  const eligibleUsers = trophy.family === "national"
    ? users.filter((user) => user.representedCountry === trophy.eligibleNationality)
    : trophy.family === "elo"
      ? users.filter(
          (user) =>
            user.rating !== null &&
            (trophy.eloBandMax === null || user.rating <= trophy.eloBandMax)
        )
      : users;

  return (
    <article className="min-w-0 rounded-[1.7rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.045),rgba(0,0,0,0.24))] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/60">
            {trophy.family} · {trophy.tier || "Open"}
          </div>
          <h3 className="mt-2 text-xl font-semibold">{trophy.displayName}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge value={trophy.status} />
            <StatusBadge value={trophy.chainStatus} />
            {trophy.forfeitureNeeded ? <StatusBadge value="forfeiture needed" /> : null}
            {trophy.appChainMismatch ? <StatusBadge value="app chain mismatch" /> : null}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200/16 bg-amber-300/8 px-4 py-3 text-right">
          <div className="text-[9px] uppercase tracking-[0.22em] text-amber-100/60">Estimated bounty</div>
          <div className="mt-1 text-2xl font-semibold text-amber-50">
            {trophy.projectedBountyWolo.toLocaleString()} WOLO
          </div>
          <div className="mt-1 text-xs text-amber-100/60">+{trophy.bountyGrowthWolo}/day</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-black/18 p-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">App holder</div>
          <div className="mt-2 font-semibold">{trophy.currentHolderDisplayName || "Vacant"}</div>
          <div className="mt-1 text-xs text-slate-500">{shortAddress(trophy.currentHolderWoloAddress)}</div>
          <div className="mt-2 text-xs text-slate-400">
            Eligibility: {trophy.currentHolderEligible === null ? "Unknown" : trophy.currentHolderEligible ? "Eligible" : "Conflict"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/18 p-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Guardian / Chain owner</div>
          <div className="mt-2 font-semibold">{trophy.guardianHolderDisplayName || "No Guardian"}</div>
          <div className="mt-1 text-xs text-slate-500">{shortAddress(trophy.chainOwnerAddress)}</div>
          <div className="mt-2 text-xs text-slate-400">
            {trophy.eligibleNationality || `${trophy.eloBandMin ?? "open"}-${trophy.eloBandMax ?? "open"} ELO`}
          </div>
        </div>
      </div>

      {trophy.eligibilityNote ? (
        <div className="mt-3 rounded-xl border border-amber-200/12 bg-amber-300/8 px-3 py-2 text-xs leading-5 text-amber-50/80">
          {trophy.eligibilityNote}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={`Assign holder · ${eligibleUsers.length} eligible`}>
          <select className={inputClass} value={holderUserId} onChange={(event) => setHolderUserId(event.target.value)}>
            <option value="">Choose player</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.representedCountry || "No country"} · {user.rating ?? "No ELO"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assign Commissioner Guardian">
          <select className={inputClass} value={guardianUserId} onChange={(event) => setGuardianUserId(event.target.value)}>
            <option value="">Choose Guardian</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} />
        Record an explicit eligibility override
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          tone="gold"
          disabled={busy || !holderUserId}
          onClick={() => {
            const user = users.find((item) => item.id === Number(holderUserId));
            void onAction(
              {
                action: "assign_holder",
                trophyId: trophy.id,
                userId: Number(holderUserId),
                rating: user?.rating ?? null,
                eligibilityOverride: override,
              },
              `${trophy.displayName} holder updated.`
            );
          }}
        >
          Assign holder
        </Button>
        <Button
          disabled={busy || !guardianUserId}
          onClick={() =>
            void onAction(
              { action: "assign_guardian", trophyId: trophy.id, userId: Number(guardianUserId) },
              `${trophy.displayName} Guardian updated.`
            )
          }
        >
          Assign Guardian
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            void onAction(
              { action: "change_status", trophyId: trophy.id, status: "vacant" },
              `${trophy.displayName} vacated with audit history.`
            )
          }
        >
          Vacate
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            void onAction(
              { action: "change_status", trophyId: trophy.id, status: trophy.status === "paused" ? "active" : "paused" },
              `${trophy.displayName} status updated.`
            )
          }
        >
          {trophy.status === "paused" ? "Activate" : "Pause"}
        </Button>
        {trophy.forfeitureNeeded ? (
          <Button
            tone="danger"
            disabled={busy}
            onClick={() =>
              void onAction(
                { action: "force_forfeiture", trophyId: trophy.id, reason: "Admin resolved national eligibility conflict." },
                `${trophy.displayName} forfeiture resolved and title vacated.`
              )
            }
          >
            Force forfeiture
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/8 bg-black/18 p-3 sm:grid-cols-[1fr_1fr_1.4fr]">
        <Field label="Tribute WOLO/day">
          <input className={inputClass} inputMode="numeric" value={tribute} onChange={(event) => setTribute(event.target.value)} />
        </Field>
        <Field label="Bounty growth/day">
          <input className={inputClass} inputMode="numeric" value={growth} onChange={(event) => setGrowth(event.target.value)} />
        </Field>
        <Field label="Change reason">
          <input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why economics changed" />
        </Field>
        <div className="sm:col-span-3">
          <Button
            tone="gold"
            disabled={busy}
            onClick={() =>
              void onAction(
                {
                  action: "update_economics",
                  trophyId: trophy.id,
                  tributeAmountWolo: tribute,
                  bountyGrowthWolo: growth,
                  payoutFrequency: trophy.payoutFrequency,
                  bountyAccrualFrequency: trophy.bountyAccrualFrequency,
                  reason,
                },
                `${trophy.displayName} economics version created.`
              )
            }
          >
            Save versioned economics
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/8 bg-black/18 p-3 sm:grid-cols-2">
        <Field label="Chain status">
          <select className={inputClass} value={chainStatus} onChange={(event) => setChainStatus(event.target.value)}>
            <option value="app_only">App only</option>
            <option value="mint_requested">Mint requested</option>
            <option value="minted">Minted</option>
            <option value="retired">Retired</option>
            <option value="failed">Failed</option>
          </select>
        </Field>
        <Field label="Chain owner address">
          <input className={inputClass} value={chainOwner} onChange={(event) => setChainOwner(event.target.value)} placeholder="wolo1…" />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button
            disabled={busy}
            onClick={() =>
              void onAction(
                {
                  action: "update_trophy",
                  trophyId: trophy.id,
                  chainStatus,
                  chainOwnerAddress: chainOwner,
                },
                `${trophy.displayName} NFT diagnostics updated.`
              )
            }
          >
            Save NFT diagnostics
          </Button>
          <Button disabled={busy} onClick={() => void onAction({ action: "nft_action", trophyId: trophy.id, operation: "mint" }, "Mint request logged.")}>
            Request mint
          </Button>
          <Button disabled={busy} onClick={() => void onAction({ action: "nft_action", trophyId: trophy.id, operation: "retire" }, "NFT retirement request logged.")}>
            Retire NFT
          </Button>
          <Button
            tone="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Log a destructive NFT burn request? Retire is safer and preferred.")) {
                void onAction({ action: "nft_action", trophyId: trophy.id, operation: "burn" }, "NFT burn request logged separately from retirement.");
              }
            }}
          >
            Burn request
          </Button>
          <Link href={trophy.nftMetadataUri || `/api/trophies/${trophy.trophyId}/metadata`} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300">
            Metadata <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-white/8 bg-black/18 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-300">Economics history ({trophy.economics.length})</summary>
        <div className="mt-3 space-y-2">
          {trophy.economics.map((version) => (
            <div key={version.id} className="rounded-xl border border-white/8 px-3 py-2 text-xs text-slate-400">
              <span className="font-semibold text-white">{version.tributeAmountWolo} tribute</span>
              {" · "}
              <span>{version.bountyGrowthWolo} bounty/day</span>
              {" · "}
              <span>{formatDate(version.effectiveFrom)}</span>
              {version.reason ? <div className="mt-1">{version.reason}</div> : null}
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

function ArtifactDefinitions({
  trophies,
  users,
  busy,
  onAction,
}: {
  trophies: TrophyRow[];
  users: TrophyCommandSnapshot["users"];
  busy: boolean;
  onAction: (payload: Record<string, unknown>, success: string) => Promise<void>;
}) {
  const [trophyKey, setTrophyKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tier, setTier] = useState("Common");
  const [tribute, setTribute] = useState("1");
  return (
    <section className="space-y-4">
      <div className="rounded-[1.7rem] border border-violet-200/14 bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.14),transparent_30%),rgba(0,0,0,0.22)] p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-violet-100/70">
          <Sparkles className="h-4 w-4" />
          Artifact foundry
        </div>
        <h2 className="mt-2 text-2xl font-semibold">Create the future collectible lanes.</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Artifact id">
            <input className={inputClass} value={trophyKey} onChange={(event) => setTrophyKey(event.target.value)} placeholder="relic_baron" />
          </Field>
          <Field label="Display name">
            <input className={inputClass} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Relic Baron" />
          </Field>
          <Field label="Tier">
            <select className={inputClass} value={tier} onChange={(event) => setTier(event.target.value)}>
              {["Common", "Rare", "Epic", "Mythic", "Legend"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </Field>
          <Field label="Bonus / bounty per day">
            <input className={inputClass} value={tribute} onChange={(event) => setTribute(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button
              tone="gold"
              disabled={busy || !trophyKey || !displayName}
              onClick={() =>
                void onAction(
                  {
                    action: "create_trophy",
                    trophyKey,
                    displayName,
                    kind: "artifact",
                    family: "artifact",
                    tier,
                    tributeAmountWolo: tribute,
                    bountyGrowthWolo: tribute,
                  },
                  `${displayName} artifact definition created.`
                )
              }
            >
              Create artifact
            </Button>
          </div>
        </div>
      </div>

      {trophies.length === 0 ? (
        <div className="rounded-[1.7rem] border border-dashed border-white/12 bg-black/18 p-8 text-center text-slate-400">
          The artifact schema and rarity lanes are ready. Create the first record artifact above.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {trophies.map((trophy) => (
            <TrophyControlCard key={`${trophy.id}:${trophy.updatedAt}`} trophy={trophy} users={users} busy={busy} onAction={onAction} />
          ))}
        </div>
      )}
    </section>
  );
}

function Challenges({
  snapshot,
  busy,
  onAction,
}: {
  snapshot: TrophyCommandSnapshot;
  busy: boolean;
  onAction: (payload: Record<string, unknown>, success: string) => Promise<void>;
}) {
  const [trophyId, setTrophyId] = useState(String(snapshot.trophies[0]?.id || ""));
  const [challengerUserId, setChallengerUserId] = useState("");
  const challenger = snapshot.users.find((user) => user.id === Number(challengerUserId));
  return (
    <section className="space-y-4">
      <div className="rounded-[1.7rem] border border-white/10 bg-black/22 p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-amber-100/70">Create trophy challenge</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_auto]">
          <Field label="Target trophy">
            <select className={inputClass} value={trophyId} onChange={(event) => setTrophyId(event.target.value)}>
              {snapshot.trophies.map((trophy) => (
                <option key={trophy.id} value={trophy.id}>{trophy.displayName} · {trophy.status}</option>
              ))}
            </select>
          </Field>
          <Field label="Challenger">
            <select className={inputClass} value={challengerUserId} onChange={(event) => setChallengerUserId(event.target.value)}>
              <option value="">Choose challenger</option>
              {snapshot.users.map((user) => (
                <option key={user.id} value={user.id}>{user.name} · {user.representedCountry || "No country"} · {user.rating ?? "No ELO"}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button
              tone="gold"
              disabled={busy || !trophyId || !challengerUserId}
              onClick={() =>
                void onAction(
                  {
                    action: "create_challenge",
                    trophyId: Number(trophyId),
                    challengerUserId: Number(challengerUserId),
                    challengerRating: challenger?.rating ?? null,
                  },
                  "Trophy challenge created with eligibility snapshot."
                )
              }
            >
              Create challenge
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {snapshot.challenges.length === 0 ? (
          <div className="rounded-[1.7rem] border border-dashed border-white/12 bg-black/18 p-8 text-center text-slate-400">
            No trophy fights have entered the command rail yet.
          </div>
        ) : (
          snapshot.challenges.map((challenge) => (
            <ChallengeCard key={`${challenge.id}:${challenge.updatedAt}`} challenge={challenge} snapshot={snapshot} busy={busy} onAction={onAction} />
          ))
        )}
      </div>
    </section>
  );
}

function ChallengeCard({
  challenge,
  snapshot,
  busy,
  onAction,
}: {
  challenge: TrophyChallengeRow;
  snapshot: TrophyCommandSnapshot;
  busy: boolean;
  onAction: (payload: Record<string, unknown>, success: string) => Promise<void>;
}) {
  const [replayId, setReplayId] = useState(String(challenge.replayId || ""));
  const [winnerUserId, setWinnerUserId] = useState(String(challenge.winnerUserId || ""));
  const winnerOptions = [
    { id: challenge.challengerUserId, name: challenge.challengerName },
    challenge.defenderUserId && challenge.defenderName ? { id: challenge.defenderUserId, name: challenge.defenderName } : null,
    challenge.guardianUserId && challenge.guardianName ? { id: challenge.guardianUserId, name: challenge.guardianName } : null,
  ].filter((value): value is { id: number; name: string } => Boolean(value));
  return (
    <article className="min-w-0 rounded-[1.7rem] border border-white/10 bg-black/22 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-100/60">
            Challenge #{challenge.id} · {challenge.challengeKind}
          </div>
          <h3 className="mt-2 text-xl font-semibold">{challenge.trophyName}</h3>
          <div className="mt-2 text-sm text-slate-300">
            {challenge.challengerName} vs {challenge.defenderName || challenge.guardianName || "Open title"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={challenge.status} />
          <StatusBadge value={challenge.settlementStatus} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/8 p-3 text-xs text-slate-400">
          <div className="uppercase tracking-[0.2em] text-slate-600">Eligibility</div>
          <div className="mt-2">{challenge.requiredNationality || `${challenge.requiredEloMin ?? "open"}-${challenge.requiredEloMax ?? "open"} ELO`}</div>
          <div className="mt-1">{challenge.eligibilityOverride ? "Admin override recorded" : "Normal rules"}</div>
        </div>
        <div className="rounded-xl border border-white/8 p-3 text-xs text-slate-400">
          <div className="uppercase tracking-[0.2em] text-slate-600">Watcher</div>
          <div className="mt-2 break-all">{challenge.watcherSessionId || "Not attached"}</div>
          <div className="mt-1">{challenge.watcherPairingId || "No pairing id"}</div>
        </div>
        <div className="rounded-xl border border-white/8 p-3 text-xs text-slate-400">
          <div className="uppercase tracking-[0.2em] text-slate-600">Replay</div>
          <div className="mt-2">{challenge.replayLabel || "Not attached"}</div>
        </div>
        <div className="rounded-xl border border-white/8 p-3 text-xs text-slate-400">
          <div className="uppercase tracking-[0.2em] text-slate-600">Winner</div>
          <div className="mt-2">{challenge.winnerName || "Not verified"}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Attach parsed replay">
          <select className={inputClass} value={replayId} onChange={(event) => setReplayId(event.target.value)}>
            <option value="">Choose replay proof</option>
            {snapshot.replays.map((replay) => <option key={replay.id} value={replay.id}>{replay.label}</option>)}
          </select>
        </Field>
        <Field label="Verify winner">
          <select className={inputClass} value={winnerUserId} onChange={(event) => setWinnerUserId(event.target.value)}>
            <option value="">Choose verified winner</option>
            {winnerOptions.map((winner) => <option key={winner.id} value={winner.id}>{winner.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void onAction({ action: "challenge_action", challengeId: challenge.id, operation: "approve" }, "Challenge approved.")}>
          Approve
        </Button>
        <Button disabled={busy || !replayId} onClick={() => void onAction({ action: "challenge_action", challengeId: challenge.id, operation: "attach_replay", replayId: Number(replayId) }, "Replay proof attached.")}>
          Attach replay
        </Button>
        <Button tone="gold" disabled={busy || !winnerUserId} onClick={() => void onAction({ action: "challenge_action", challengeId: challenge.id, operation: "verify", winnerUserId: Number(winnerUserId) }, "Challenge result verified.")}>
          Verify result
        </Button>
        <Button tone="gold" disabled={busy || !challenge.winnerUserId} onClick={() => void onAction({ action: "challenge_action", challengeId: challenge.id, operation: "dry_run" }, "Settlement dry-run recorded.")}>
          Settlement dry-run
        </Button>
        <Button disabled={busy || !challenge.winnerUserId} onClick={() => void onAction({ action: "challenge_action", challengeId: challenge.id, operation: "settle" }, "Settlement action completed or chain intent recorded.")}>
          Settle
        </Button>
        <Button disabled={busy} onClick={() => void onAction({ action: "challenge_action", challengeId: challenge.id, operation: "retry" }, "Settlement retry requested.")}>
          Retry
        </Button>
        <Button tone="danger" disabled={busy} onClick={() => void onAction({ action: "challenge_action", challengeId: challenge.id, operation: "dispute" }, "Challenge marked disputed.")}>
          Dispute
        </Button>
        <Button tone="danger" disabled={busy} onClick={() => void onAction({ action: "challenge_action", challengeId: challenge.id, operation: "cancel" }, "Challenge cancelled.")}>
          Cancel
        </Button>
      </div>

      {challenge.verificationSummary ? <div className="mt-3 rounded-xl border border-white/8 px-3 py-2 text-xs leading-5 text-slate-400">{challenge.verificationSummary}</div> : null}
      {challenge.errorState ? <div className="mt-3 rounded-xl border border-rose-300/18 bg-rose-400/8 px-3 py-2 text-xs text-rose-100">{challenge.errorState}</div> : null}
      <div className="mt-3">
        <JsonDetails label="Eligibility snapshot / raw proof context" value={challenge.eligibilitySnapshot} />
      </div>
    </article>
  );
}

function Payouts({
  snapshot,
  busy,
  onAction,
}: {
  snapshot: TrophyCommandSnapshot;
  busy: boolean;
  onAction: (payload: Record<string, unknown>, success: string) => Promise<void>;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-[1.7rem] border border-amber-200/14 bg-amber-300/8 p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-amber-100/70">Payout rail</div>
        <h2 className="mt-2 text-2xl font-semibold">Dry-run first, money truth second.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Pending rows are operator obligations, not proof of escrow. Tx hashes only appear after a real payout rail records them.
        </p>
      </div>
      <div className="overflow-x-auto rounded-[1.7rem] border border-white/10 bg-black/22">
        <table className="min-w-[70rem] w-full text-left text-xs">
          <thead className="border-b border-white/8 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Trophy</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tx / Error</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.payouts.map((payout) => (
              <tr key={payout.id} className="border-b border-white/[0.055] align-top">
                <td className="px-4 py-3 text-slate-400">{formatDate(payout.createdAt)}</td>
                <td className="px-4 py-3 font-semibold text-white">{payout.trophyName}</td>
                <td className="px-4 py-3 text-slate-300">
                  {payout.recipientName || "Unlinked"}
                  <div className="mt-1 text-slate-600">{shortAddress(payout.recipientWoloAddress)}</div>
                </td>
                <td className="px-4 py-3 text-slate-300">{payout.payoutKind.replace(/_/g, " ")}</td>
                <td className="px-4 py-3 font-semibold text-amber-100">{payout.amountWolo.toLocaleString()} WOLO</td>
                <td className="px-4 py-3"><StatusBadge value={payout.status} /></td>
                <td className="max-w-xs px-4 py-3 text-slate-400">
                  {payout.txHash ? shortAddress(payout.txHash) : payout.errorState || "No chain tx"}
                  <div className="mt-2 space-y-1">
                    <JsonDetails label="Raw request" value={payout.rawRequest} />
                    <JsonDetails label="Raw response" value={payout.rawResponse} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      tone="gold"
                      disabled={busy || payout.status === "paid" || Boolean(payout.txHash) || !payout.recipientWoloAddress}
                      onClick={() => void onAction({ action: "payout_action", payoutId: payout.id, operation: "execute" }, "Payout executed through Founder Rewards.")}
                    >
                      Execute
                    </Button>
                    <Button disabled={busy || payout.status === "paid" || Boolean(payout.txHash)} onClick={() => void onAction({ action: "payout_action", payoutId: payout.id, operation: "dry_run" }, "Payout returned to dry-run.")}>Dry-run</Button>
                    <Button disabled={busy || payout.status === "paid" || Boolean(payout.txHash)} onClick={() => void onAction({ action: "payout_action", payoutId: payout.id, operation: "retry" }, "Payout retry requested.")}>Retry</Button>
                    <Button tone="danger" disabled={busy || payout.status === "paid" || Boolean(payout.txHash)} onClick={() => void onAction({ action: "payout_action", payoutId: payout.id, operation: "cancel" }, "Payout cancelled.")}>Cancel</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {snapshot.payouts.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No payout rows yet.</div> : null}
      </div>
    </section>
  );
}

function EventLedger({
  events,
  title,
  body,
  busy,
  onAction,
}: {
  events: TrophyEventRow[];
  title: string;
  body: string;
  busy: boolean;
  onAction: (payload: Record<string, unknown>, success: string) => Promise<void>;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-[1.7rem] border border-white/10 bg-black/22 p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
          <ScrollText className="h-4 w-4" />
          Event recorder
        </div>
        <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{body}</p>
      </div>
      <div className="max-h-[66rem] space-y-2 overflow-y-auto pr-1">
        {events.map((event) => (
          <article key={event.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{formatDate(event.createdAt)}</div>
                <div className="mt-1 font-semibold text-white">{event.eventType.replace(/_/g, " ")}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {event.trophyName}
                  {event.challengeId ? ` · Challenge #${event.challengeId}` : ""}
                  {event.actorName ? ` · ${event.actorName}` : ""}
                </div>
              </div>
              <StatusBadge value={event.status} />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
              <div>From: {event.fromHolderName || shortAddress(event.fromWoloAddress)}</div>
              <div>To: {event.toHolderName || shortAddress(event.toWoloAddress)}</div>
              <div>Tx: {shortAddress(event.chainTxHash)}</div>
            </div>
            {event.errorMessage ? <div className="mt-3 rounded-xl border border-rose-300/18 bg-rose-400/8 px-3 py-2 text-xs text-rose-100">{event.errorMessage}</div> : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <JsonDetails label="Raw request" value={event.rawRequest} />
              <JsonDetails label="Raw response" value={event.rawResponse} />
            </div>
            {event.status === "failed" || event.errorMessage ? (
              <div className="mt-3">
                <Button disabled={busy} onClick={() => void onAction({ action: "retry_event", eventId: event.id }, "Event retry requested.")}>
                  Retry event · attempt {event.retryCount + 1}
                </Button>
              </div>
            ) : null}
          </article>
        ))}
        {events.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-500">No events in this lane.</div> : null}
      </div>
    </section>
  );
}

function TrophySettings({
  snapshot,
  busy,
  onAction,
}: {
  snapshot: TrophyCommandSnapshot;
  busy: boolean;
  onAction: (payload: Record<string, unknown>, success: string) => Promise<void>;
}) {
  const settingMap = useMemo(() => new Map(snapshot.settings.map((setting) => [setting.key, setting])), [snapshot.settings]);
  const boolSetting = (key: string) => settingMap.get(key)?.value === true;
  const numberSetting = (key: string) => {
    const value = settingMap.get(key)?.value;
    return typeof value === "number" ? value : 0;
  };
  const [cooldown, setCooldown] = useState(String(numberSetting("nationality_change_cooldown_days")));
  const [eloGrace, setEloGrace] = useState(String(numberSetting("elo_belt_grace_period_days")));
  const [nationalityUserId, setNationalityUserId] = useState("");
  const [representedCountry, setRepresentedCountry] = useState("");
  return (
    <section className="space-y-4">
      <div className="rounded-[1.7rem] border border-white/10 bg-black/22 p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Feature and safety gates</div>
        <h2 className="mt-2 text-2xl font-semibold">Trophy system settings</h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {[
          {
            key: "chain_backed_trophies_enabled",
            label: "Chain-backed trophy mode",
            body: "Records NFT transfer intent. WoloChain execution remains outside app-prodn.",
          },
          {
            key: "app_only_fallback_enabled",
            label: "App-only fallback",
            body: "Allows verified challenges to update app custody when chain mode is off.",
          },
          {
            key: "dry_run_only",
            label: "Dry-run-only mode",
            body: "Blocks final settlement while letting operators inspect every resulting action.",
          },
          {
            key: "trophy_tribute_auto_execute",
            label: "Auto-execute belt tributes",
            body: "When enabled, daily belt tribute payouts execute automatically after being queued. When disabled, payouts remain queued for manual review.",
          },
        ].map((setting) => {
          const enabled = boolSetting(setting.key);
          return (
            <div key={setting.key} className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
              <div className="font-semibold text-white">{setting.label}</div>
              <p className="mt-2 min-h-16 text-sm leading-6 text-slate-400">{setting.body}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void onAction(
                    {
                      action: "update_setting",
                      key: setting.key,
                      value: !enabled,
                      reason: `Admin ${enabled ? "disabled" : "enabled"} ${setting.label}.`,
                    },
                    `${setting.label} ${enabled ? "disabled" : "enabled"}.`
                  )
                }
                className={`mt-4 w-full rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  enabled
                    ? "border-emerald-300/24 bg-emerald-400/10 text-emerald-100"
                    : "border-white/10 bg-white/[0.04] text-slate-300"
                }`}
              >
                {enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <Field label="Nationality change cooldown placeholder · days">
            <input className={inputClass} value={cooldown} onChange={(event) => setCooldown(event.target.value)} />
          </Field>
          <div className="mt-3">
            <Button disabled={busy} onClick={() => void onAction({ action: "update_setting", key: "nationality_change_cooldown_days", value: Number(cooldown), reason: "Nationality cooldown updated." }, "Nationality cooldown updated.")}>
              Save cooldown
            </Button>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
          <Field label="ELO band grace placeholder · days">
            <input className={inputClass} value={eloGrace} onChange={(event) => setEloGrace(event.target.value)} />
          </Field>
          <div className="mt-3">
            <Button disabled={busy} onClick={() => void onAction({ action: "update_setting", key: "elo_belt_grace_period_days", value: Number(eloGrace), reason: "ELO grace period updated." }, "ELO grace period updated.")}>
              Save grace period
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-[1.7rem] border border-amber-200/12 bg-amber-300/[0.035] p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-amber-100/65">Eligibility operator</div>
        <h3 className="mt-2 text-xl font-semibold text-white">Representing Country</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          An admin country change is audited. If the player holds a conflicting national belt, the belt is flagged for explicit forfeiture review and is never silently reassigned.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto]">
          <Field label="Player">
            <select className={inputClass} value={nationalityUserId} onChange={(event) => {
              const nextId = event.target.value;
              setNationalityUserId(nextId);
              setRepresentedCountry(snapshot.users.find((user) => user.id === Number(nextId))?.representedCountry || "");
            }}>
              <option value="">Choose player</option>
              {snapshot.users.map((user) => (
                <option key={user.id} value={user.id}>{user.name} · {user.representedCountry || "No country"}</option>
              ))}
            </select>
          </Field>
          <Field label="New country">
            <select className={inputClass} value={representedCountry} onChange={(event) => setRepresentedCountry(event.target.value)}>
              <option value="">Unset</option>
              {["Canada", "USA", "Mexico", "UK"].map((country) => <option key={country}>{country}</option>)}
            </select>
          </Field>
          <div className="flex items-end">
            <Button
              tone="gold"
              disabled={busy || !nationalityUserId}
              onClick={() =>
                void onAction(
                  {
                    action: "update_user_nationality",
                    userId: Number(nationalityUserId),
                    representedCountry: representedCountry || null,
                  },
                  "Representing Country updated and trophy eligibility audited."
                )
              }
            >
              Update + audit
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-[1.7rem] border border-white/10 bg-black/22 p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
          <FileClock className="h-4 w-4" />
          Current setting ledger
        </div>
        <div className="mt-4 grid gap-2">
          {snapshot.settings.map((setting) => (
            <div key={setting.key} className="grid gap-2 rounded-xl border border-white/8 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="font-semibold text-white">{setting.key}</div>
              <div className="break-all text-slate-400">{JSON.stringify(setting.value)}</div>
              <div className="text-slate-600">{formatDate(setting.updatedAt)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
