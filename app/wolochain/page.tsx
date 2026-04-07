import type { ReactNode } from "react";
import Link from "next/link";

type TreasurySlice = {
  label: string;
  amount: string;
  amountRaw: number;
  purpose: string;
  tone: "amber" | "emerald" | "sky" | "violet" | "rose" | "slate";
};

const treasurySlices: TreasurySlice[] = [
  {
    label: "Founder Cold",
    amount: "60,000,000",
    amountRaw: 60,
    purpose: "Long-hold reserve. Hard-anchor scarcity.",
    tone: "amber",
  },
  {
    label: "Founder Operating",
    amount: "5,000,000",
    amountRaw: 5,
    purpose: "Build speed. Shipping budget. Firepower.",
    tone: "sky",
  },
  {
    label: "Community Treasury",
    amount: "10,000,000",
    amountRaw: 10,
    purpose: "Betting-fee home. Protocol war chest.",
    tone: "emerald",
  },
  {
    label: "DEX Liquidity",
    amount: "10,000,000",
    amountRaw: 10,
    purpose: "Market depth. Listings. Tradable rail.",
    tone: "violet",
  },
  {
    label: "Faucet Growth",
    amount: "7,000,000",
    amountRaw: 7,
    purpose: "Onboarding fuel for new bettors.",
    tone: "rose",
  },
  {
    label: "Validator Ops",
    amount: "5,000,000",
    amountRaw: 5,
    purpose: "Validator-side ops and chain running costs.",
    tone: "sky",
  },
  {
    label: "Ecosystem Bounties",
    amount: "3,000,000",
    amountRaw: 3,
    purpose: "Missions, tooling, sharp contributors.",
    tone: "slate",
  },
];

const chainFacts = [
  ["Chain ID", "wolo-testnet"],
  ["Ticker", "WOLO"],
  ["Base Denom", "uwolo"],
  ["Prefix", "wolo1…"],
  ["Decimals", "6"],
  ["Supply Model", "Fixed · 100,000,000 max"],
] as const;

const validatorSteps = [
  {
    step: "01",
    title: "Get stake",
    body: "Hold enough WOLO to matter. Serious operators only.",
  },
  {
    step: "02",
    title: "Sync a node",
    body: "Run the chain clean. Full sync. Stable box. Real uptime.",
  },
  {
    step: "03",
    title: "Create validator",
    body: "Publish moniker, commission, public identity, and sign honestly.",
  },
  {
    step: "04",
    title: "Stay sharp",
    body: "No double-signing. No sloppy keys. No falling asleep at the wheel.",
  },
] as const;

export default function WoloChainExplainerPage() {
  return (
    <main className="space-y-6 py-3 text-white sm:space-y-7 sm:py-4">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_24%),radial-gradient(circle_at_78%_18%,_rgba(56,189,248,0.16),_transparent_20%),radial-gradient(circle_at_65%_78%,_rgba(52,211,153,0.12),_transparent_22%),linear-gradient(135deg,_#08111f,_#0b1324_44%,_#050814)] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.42)] sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent,rgba(255,255,255,0.035),transparent)]" />

        <div className="relative z-10 grid gap-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-start">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <TonePill tone="amber">WoloChain</TonePill>
              <TonePill tone="emerald">1 validator live</TonePill>
              <TonePill tone="sky">100,000,000 fixed</TonePill>
              <TonePill tone="slate">AoE2HD betting rail</TonePill>
            </div>

            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-[0.38em] text-amber-200/70">
                Serious chain. Serious game.
              </div>
              <h1 className="max-w-5xl text-4xl font-semibold leading-[0.95] tracking-[-0.045em] text-white sm:text-5xl lg:text-7xl">
                Clean rail. Hard cap.
                <br className="hidden sm:block" />
                No inflation games.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                WOLO is the fixed-supply settlement rail for AoE2HD betting. One token. One hard cap.
                Clean transfers, clean balances, clean payout logic. Built for players who want the
                chain to feel as sharp as the game.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroStat label="Supply" value="100M" sublabel="No mint games" />
              <HeroStat label="Validators" value="1" sublabel="More wanted" />
              <HeroStat label="Bet Fees" value="Treasury" sublabel="Community pot" />
              <HeroStat label="Tx Fees" value="Validator" sublabel="Stake-led split" />
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/wolo"
                className="inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Open $WOLO Wallet
              </Link>
              <Link
                href="/bets"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm text-white/90 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                Open Bets
              </Link>
              <Link
                href="/contact-emaren"
                className="inline-flex items-center justify-center rounded-full border border-emerald-400/22 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-100 transition hover:border-emerald-300/38 hover:bg-emerald-500/15"
              >
                Become a Validator
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(9,14,26,0.96),rgba(5,8,20,0.98))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
                    Live chain facts
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Chain brief</h2>
                </div>
                <TonePill tone="slate">Fast read</TonePill>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {chainFacts.map(([label, value]) => (
                  <FactTile key={label} label={label} value={value} />
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <GlassPanel
                eyebrow="Fee rail"
                title="Betting fees"
                body="App-side market fees are aimed at Community Treasury. That is the protocol pot."
                footer="Current house logic: treasury-first."
                tone="emerald"
              />
              <GlassPanel
                eyebrow="Chain rail"
                title="Tx fees"
                body="Chain fees follow validator economics. Right now one validator means one validator lane."
                footer="More validators = stake-led split."
                tone="sky"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.9rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.28)] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">Supply map</div>
            <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Protocol split</h2>
          </div>
          <TonePill tone="amber">Fixed forever</TonePill>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.78fr_1.22fr] xl:items-center">
          <div className="flex justify-center">
            <TokenRingChart />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {treasurySlices.map((slice) => (
              <AllocationRow key={slice.label} slice={slice} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.28)] lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">Why it exists</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Three rules. That’s the whole vibe.</h2>
            </div>
            <TonePill tone="amber">Minimal by design</TonePill>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <FeatureCard
              title="Scarcity"
              body="100,000,000 max. No silent minting. No weird supply creep."
              tone="amber"
            />
            <FeatureCard
              title="Settlement"
              body="Balances, transfers, payout truth. The rail is the rail."
              tone="emerald"
            />
            <FeatureCard
              title="Arena"
              body="Made for AoE2HD betting, not generic chain cosplay."
              tone="sky"
            />
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.28)]">
          <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">Current validator set</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">1 validator live right now</h2>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            That keeps the rail alive, but it is not the end state. WoloChain wants more real operators.
            Not fake decentralization theater. Real boxes. Real uptime. Real keys.
          </p>
          <div className="mt-5 rounded-[1.4rem] border border-cyan-300/16 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(8,13,25,0.96)_52%,rgba(9,30,39,0.74))] p-4">
            <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/68">Why it matters</div>
            <div className="mt-2 text-lg font-semibold text-white">More operators. Better chain.</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Validator count is not a cosmetic number. More serious operators means better uptime,
              better resilience, and a stronger trust story when real money is moving.
            </p>
          </div>
        </section>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
        <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.28)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">Validator lane</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">How to join the set</h2>
            </div>
            <TonePill tone="emerald">Operator grade</TonePill>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {validatorSteps.map((item) => (
              <ValidatorStepCard
                key={item.step}
                step={item.step}
                title={item.title}
                body={item.body}
              />
            ))}
          </div>

          <div className="mt-5 rounded-[1.4rem] border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            <div className="font-medium text-white">Important</div>
            Validators do <span className="font-semibold">not</span> share one hot validator wallet.
            Each validator runs its own validator identity and signing keys. Fee share tracks validator
            stake and commission. Shared treasury policy is fine. Shared validator keys are not.
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.28)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">Revenue read</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Where the money goes</h2>
            </div>
            <TonePill tone="sky">One-glance</TonePill>
          </div>

          <div className="mt-5 space-y-3">
            <RevenueRail
              title="Betting fees"
              body="Market-side fees are meant to feed Community Treasury. That is the protocol bankroll, growth chest, and future-fire budget."
              trail="bet → house cut → communitytreasury"
              tone="emerald"
            />
            <RevenueRail
              title="Transaction fees"
              body="Normal chain fees go through validator economics. With one validator live, that lane is effectively one lane."
              trail="tx fee → validator rewards / commission"
              tone="sky"
            />
            <RevenueRail
              title="When validator #2 joins"
              body="Revenue does not split by handshake vibes. It tracks stake, validator share, and commission policy."
              trail="more stake → more validator share"
              tone="violet"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/wolo"
              className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white/90 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
            >
              Back to $WOLO
            </Link>
            <Link
              href="/contact-emaren"
              className="inline-flex items-center justify-center rounded-full bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
            >
              Raise validator hand
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}

function TonePill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "amber" | "emerald" | "sky" | "violet" | "slate";
}) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-400/20 bg-emerald-500/12 text-emerald-100"
        : tone === "sky"
          ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
          : tone === "violet"
            ? "border-violet-300/20 bg-violet-400/10 text-violet-100"
            : "border-white/10 bg-white/5 text-slate-200";

  return (
    <div className={`rounded-full border px-3 py-1.5 text-xs font-medium ${toneClasses}`}>
      {children}
    </div>
  );
}

function HeroStat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-2 text-xs text-slate-400">{sublabel}</div>
    </div>
  );
}

function TokenRingChart() {
  return (
    <div className="relative flex h-72 w-72 items-center justify-center sm:h-80 sm:w-80">
      <div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(circle, rgba(251,191,36,0.22) 0%, rgba(56,189,248,0.14) 36%, rgba(5,8,20,0) 72%)",
        }}
      />
      <div
        className="absolute inset-0 rounded-full border border-white/10 shadow-[inset_0_10px_30px_rgba(255,255,255,0.08),0_25px_80px_rgba(2,6,23,0.55)]"
        style={{
          background:
            "conic-gradient(from 220deg, rgba(251,191,36,0.96) 0deg 216deg, rgba(56,189,248,0.88) 216deg 234deg, rgba(16,185,129,0.9) 234deg 270deg, rgba(168,85,247,0.88) 270deg 306deg, rgba(244,63,94,0.86) 306deg 331deg, rgba(71,85,105,0.88) 331deg 342deg, rgba(14,165,233,0.9) 342deg 360deg)",
        }}
      />
      <div className="absolute inset-[14%] rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(9,14,26,0.98),rgba(5,8,20,0.98))] shadow-[inset_0_6px_24px_rgba(255,255,255,0.05)]" />
      <div className="relative z-10 text-center">
        <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">Supply</div>
        <div className="mt-2 text-5xl font-semibold tracking-[-0.045em] text-white">100M</div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.34em] text-amber-100/76">WOLO</div>
      </div>
    </div>
  );
}

function AllocationRow({ slice }: { slice: TreasurySlice }) {
  const toneBar =
    slice.tone === "amber"
      ? "from-amber-300 to-amber-500"
      : slice.tone === "emerald"
        ? "from-emerald-300 to-emerald-500"
        : slice.tone === "sky"
          ? "from-cyan-300 to-sky-500"
          : slice.tone === "violet"
            ? "from-violet-300 to-violet-500"
            : slice.tone === "rose"
              ? "from-rose-300 to-rose-500"
              : "from-slate-300 to-slate-500";

  return (
    <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.035] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">{slice.label}</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{slice.purpose}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-white">{slice.amount}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
            {slice.amountRaw}%
          </div>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/5">
        <div
          className={`h-2 rounded-full bg-gradient-to-r ${toneBar}`}
          style={{ width: `${slice.amountRaw}%` }}
        />
      </div>
    </div>
  );
}

function GlassPanel({
  eyebrow,
  title,
  body,
  footer,
  tone,
}: {
  eyebrow: string;
  title: string;
  body: string;
  footer: string;
  tone: "emerald" | "sky";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/18 bg-emerald-500/10 text-emerald-100"
      : "border-cyan-300/18 bg-cyan-400/10 text-cyan-100";

  return (
    <div className="rounded-[1.45rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,13,24,0.96),rgba(5,8,20,0.98))] p-5">
      <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">{eyebrow}</div>
      <div className="mt-2 text-xl font-semibold text-white">{title}</div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
      <div className={`mt-4 rounded-full border px-3 py-1.5 text-xs font-medium ${toneClass}`}>
        {footer}
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "amber" | "emerald" | "sky";
}) {
  const accent =
    tone === "amber"
      ? "from-amber-300/25 via-amber-400/10 to-transparent"
      : tone === "emerald"
        ? "from-emerald-300/25 via-emerald-400/10 to-transparent"
        : "from-cyan-300/25 via-cyan-400/10 to-transparent";

  return (
    <div className="relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${accent}`} />
      <div className="relative z-10">
        <div className="text-xl font-semibold text-white">{title}</div>
        <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
      </div>
    </div>
  );
}

function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.3rem] border border-white/8 bg-white/5 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-3 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function ValidatorStepCard({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.34em] text-emerald-200/70">Step {step}</div>
        <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-400">
          Validator
        </div>
      </div>
      <div className="mt-3 text-xl font-semibold text-white">{title}</div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}

function RevenueRail({
  title,
  body,
  trail,
  tone,
}: {
  title: string;
  body: string;
  trail: string;
  tone: "emerald" | "sky" | "violet";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/18 bg-emerald-500/10 text-emerald-100"
      : tone === "sky"
        ? "border-cyan-300/18 bg-cyan-400/10 text-cyan-100"
        : "border-violet-300/18 bg-violet-400/10 text-violet-100";

  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-white">{title}</div>
          <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
        </div>
        <div className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] ${toneClass}`}>
          live
        </div>
      </div>
      <div className="mt-4 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-300">
        {trail}
      </div>
    </div>
  );
}
