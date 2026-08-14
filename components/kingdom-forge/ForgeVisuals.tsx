import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Anvil,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Coins,
  Crown,
  Flame,
  Gem,
  Hammer,
  Landmark,
  Scale,
  ShieldCheck,
  Sparkles,
  Swords,
} from "lucide-react";

const FORGE_ASSETS = {
  academy: "/kingdom-forge/academy-intelligence.jpg",
  battleCam: "/kingdom-forge/battle-cam.jpg",
  chamber: "/kingdom-forge/council-chamber.jpg",
  construction: "/kingdom-forge/construction.jpg",
  vision: "/kingdom-forge/forge-vision.jpg",
  round: "/kingdom-forge/round-chamber.jpg",
  tournament: "/kingdom-forge/tournament-engine.jpg",
} as const;

type ForgeHeroProps = {
  kingdomStake: string;
  forgeCapacity: string;
  powerSignalled: string;
  openProjects: number;
  activePatrons: number;
  utilization: number;
};

function ForgeStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="relative overflow-hidden border border-white/10 bg-black/55 px-4 py-4 backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.7),transparent)]" />
      <div className="text-[9px] font-black uppercase tracking-[0.28em] text-[#ffbf3f]">
        {label}
      </div>
      <div className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl">
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-5 text-white/50">{detail}</div>
    </div>
  );
}

export function ForgeHero({
  kingdomStake,
  forgeCapacity,
  powerSignalled,
  openProjects,
  activePatrons,
  utilization,
}: ForgeHeroProps) {
  return (
    <section className="relative min-h-[610px] overflow-hidden border-b border-orange-300/20">
      <Image
        src={FORGE_ASSETS.construction}
        alt="The Kingdom rising under construction"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.78)_40%,rgba(0,0,0,0.22)_73%,rgba(0,0,0,0.52)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.25)_0%,transparent_38%,rgba(2,3,4,0.92)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_42%,rgba(249,115,22,0.22),transparent_30%),radial-gradient(circle_at_20%_15%,rgba(245,158,11,0.12),transparent_26%)]" />

      <div className="relative mx-auto flex min-h-[610px] max-w-[1900px] flex-col justify-between px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="max-w-[850px]">
          <div className="inline-flex items-center gap-2 border border-orange-300/30 bg-black/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.32em] text-orange-200 backdrop-blur">
            <Flame className="h-4 w-4 text-orange-400" />
            The Economic Engine of AoE2WAR
          </div>

          <h1 className="mt-6 max-w-4xl text-4xl font-black uppercase leading-[0.92] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
            Kingdom{" "}
            <span className="bg-[linear-gradient(180deg,#fff7d6_0%,#ffc24b_46%,#f97316_100%)] bg-clip-text text-transparent">
              Forge
            </span>
          </h1>

          <div className="mt-5 h-[3px] w-28 bg-[linear-gradient(90deg,#f97316,#fbbf24,transparent)]" />

          <p className="mt-5 text-xl font-black uppercase tracking-[0.04em] text-[#ffd166] sm:text-2xl">
            The first million earns. The rest builds.
          </p>

          <p className="mt-4 max-w-2xl text-sm font-medium leading-7 text-white/78 sm:text-base">
            Your Crown Stake earns the ordinary Kingdom reward. Excess stake becomes
            Forge Power: choose what AoE2WAR should become, then place real capital
            at risk only when you deliberately ignite Build Fuel.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="#projects"
              className="group inline-flex min-h-12 items-center gap-2 bg-[linear-gradient(135deg,#ff8a00,#ffc547)] px-5 py-3 text-xs font-black uppercase tracking-[0.13em] text-black shadow-[0_0_34px_rgba(249,115,22,0.28)] transition hover:brightness-110"
            >
              Enter the Great Anvils
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>

            <Link
              href="/staking"
              className="inline-flex min-h-12 items-center gap-2 border border-cyan-300/30 bg-[#04141a]/80 px-5 py-3 text-xs font-black uppercase tracking-[0.13em] text-cyan-100 backdrop-blur transition hover:border-cyan-200/60 hover:bg-cyan-400/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Staking
            </Link>

            <a
              href="/kingdom-forge/kingdom-forge-constitution.pdf"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 items-center gap-2 border border-white/18 bg-black/55 px-5 py-3 text-xs font-black uppercase tracking-[0.13em] text-white transition hover:border-amber-300/45"
            >
              <BookOpen className="h-4 w-4 text-amber-300" />
              Read the Constitution
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-[9px] font-black uppercase tracking-[0.21em] text-white/45">
            <span>Hold</span><span className="text-orange-400">→</span>
            <span>Stake</span><span className="text-orange-400">→</span>
            <span>Choose</span><span className="text-orange-400">→</span>
            <span>Fuel</span><span className="text-orange-400">→</span>
            <span>Build</span><span className="text-orange-400">→</span>
            <span>Own</span><span className="text-orange-400">→</span>
            <span>Earn</span><span className="text-orange-400">→</span>
            <span>Legacy</span>
          </div>
        </div>

        <div className="mt-10 grid gap-px border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
          <ForgeStat
            label="Crown Reward Weight"
            value={kingdomStake}
            detail="The reward-bearing first-million lane"
          />
          <ForgeStat
            label="Forge Power"
            value={forgeCapacity}
            detail="Excess stake available to build"
          />
          <ForgeStat
            label="Power Pledged"
            value={powerSignalled}
            detail={`${utilization.toFixed(1)}% of visible Forge Power`}
          />
          <ForgeStat
            label="Great Anvils"
            value={String(openProjects)}
            detail={`${activePatrons} active patrons`}
          />
        </div>
      </div>
    </section>
  );
}

function LawCard({
  icon,
  number,
  title,
  body,
  tone,
}: {
  icon: ReactNode;
  number: string;
  title: string;
  body: string;
  tone: "gold" | "fire" | "cyan";
}) {
  const tones = {
    gold: "border-amber-300/20 bg-amber-400/[0.055] text-amber-300",
    fire: "border-orange-400/25 bg-orange-500/[0.06] text-orange-300",
    cyan: "border-cyan-300/20 bg-cyan-400/[0.05] text-cyan-200",
  } as const;

  return (
    <div className={`relative overflow-hidden border p-5 ${tones[tone]}`}>
      <div className="absolute right-3 top-2 text-5xl font-black text-white/[0.035]">
        {number}
      </div>
      <div className="flex h-10 w-10 items-center justify-center border border-current/30 bg-black/30">
        {icon}
      </div>
      <div className="mt-4 text-[9px] font-black uppercase tracking-[0.28em] opacity-70">
        Law {number}
      </div>
      <div className="mt-2 text-lg font-black uppercase tracking-tight text-white">
        {title}
      </div>
      <p className="mt-2 text-xs leading-6 text-white/55">{body}</p>
    </div>
  );
}

export function ForgeDoctrine() {
  return (
    <section className="relative overflow-hidden border border-white/10 bg-[#060708] p-5 shadow-[0_35px_100px_rgba(0,0,0,0.35)] sm:p-7 lg:p-9">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(249,115,22,0.13),transparent_30%),radial-gradient(circle_at_100%_100%,rgba(34,211,238,0.08),transparent_28%)]" />

      <div className="relative">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.32em] text-orange-300">
              <Swords className="h-4 w-4" />
              Constitutional Economy
            </div>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-[-0.025em] text-white sm:text-4xl">
              The Law of the Forge
            </h2>
          </div>

          <div className="border-l-2 border-orange-400 pl-4 text-right">
            <div className="text-sm font-black uppercase text-[#ffc24b]">
              Forge Power chooses.
            </div>
            <div className="mt-1 text-sm font-black uppercase text-white">
              Build Fuel builds.
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <LawCard
            number="I"
            icon={<Crown className="h-5 w-5" />}
            title="Crown Stake"
            body="The first 1,000,000 staked WOLO earns ordinary staking distributions."
            tone="gold"
          />
          <LawCard
            number="II"
            icon={<Anvil className="h-5 w-5" />}
            title="Forge Power"
            body="Everything above the Crown cap remains staked and becomes productive capacity."
            tone="fire"
          />
          <LawCard
            number="III"
            icon={<Flame className="h-5 w-5" />}
            title="Ignition"
            body="A pledge moves no money. Ignition is the separate act that places WOLO into project escrow."
            tone="fire"
          />
          <LawCard
            number="IV"
            icon={<Hammer className="h-5 w-5" />}
            title="Build"
            body="Consumed Build Fuel earns Finance Points. Accepted work earns Builder Points."
            tone="cyan"
          />
          <LawCard
            number="V"
            icon={<Gem className="h-5 w-5" />}
            title="Seal & Own"
            body="A successful Forge creates exactly 10,000 deeds: 70% patrons, 20% builders, 10% Kingdom."
            tone="gold"
          />
        </div>

        <div className="mt-6 grid gap-px border border-white/10 bg-white/10 md:grid-cols-3">
          <div className="bg-black/55 p-5">
            <Landmark className="h-5 w-5 text-amber-300" />
            <div className="mt-3 text-2xl font-black text-white">1,000,000</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
              Crown Stake cap
            </div>
          </div>
          <div className="bg-black/55 p-5">
            <Gem className="h-5 w-5 text-orange-300" />
            <div className="mt-3 text-2xl font-black text-white">100 deeds = 1%</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
              Simple ownership math
            </div>
          </div>
          <div className="bg-black/55 p-5">
            <Scale className="h-5 w-5 text-cyan-300" />
            <div className="mt-3 text-2xl font-black text-white">70 / 20 / 10</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
              Patrons · Builders · Kingdom
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const METER_TONES = {
  gold: {
    label: "text-amber-300",
    bar: "bg-[linear-gradient(90deg,#d97706,#fbbf24,#fde68a)]",
  },
  fire: {
    label: "text-orange-300",
    bar: "bg-[linear-gradient(90deg,#b91c1c,#f97316,#fbbf24)]",
  },
  steel: {
    label: "text-cyan-200",
    bar: "bg-[linear-gradient(90deg,#0891b2,#22d3ee,#a5f3fc)]",
  },
} as const;

export function ForgeHealthMeter({
  label,
  value,
  detail,
  percent,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  percent: number | null;
  tone: keyof typeof METER_TONES;
}) {
  const palette = METER_TONES[tone];
  const clamped =
    percent == null ? null : Math.max(0, Math.min(100, percent));

  return (
    <div className="border border-white/10 bg-black/45 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className={`text-[9px] font-black uppercase tracking-[0.25em] ${palette.label}`}>
          {label}
        </div>
        <div className="text-xs font-black text-white">{value}</div>
      </div>

      <div className="mt-3 h-2 overflow-hidden bg-white/[0.07]">
        {clamped == null ? (
          <div className="h-full w-full bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.08)_0px,rgba(255,255,255,0.08)_8px,transparent_8px,transparent_16px)]" />
        ) : (
          <div
            className={`h-full ${palette.bar}`}
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>

      <div className="mt-2 text-[10px] leading-5 text-white/42">{detail}</div>
    </div>
  );
}

function projectImage(title: string, slug: string) {
  const haystack = `${title} ${slug}`.toLowerCase();

  if (haystack.includes("battle") || haystack.includes("cam")) {
    return FORGE_ASSETS.battleCam;
  }

  if (haystack.includes("tournament")) {
    return FORGE_ASSETS.tournament;
  }

  if (
    haystack.includes("academy") ||
    haystack.includes("intelligence") ||
    haystack.includes("ai")
  ) {
    return FORGE_ASSETS.academy;
  }

  return FORGE_ASSETS.construction;
}

export function ForgeProjectArt({
  title,
  slug,
}: {
  title: string;
  slug: string;
}) {
  return (
    <div className="relative -mx-5 -mt-5 mb-6 h-52 overflow-hidden border-b border-white/10 sm:-mx-7 sm:-mt-7 sm:h-64">
      <Image
        src={projectImage(title, slug)}
        alt={`${title} Forge project`}
        fill
        loading="lazy"
        sizes="(max-width: 1279px) 100vw, 50vw"
        className="object-cover object-center transition duration-700 group-hover:scale-[1.035]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0.12)_42%,rgba(5,6,8,0.95)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(251,146,60,0.7),transparent)]" />
    </div>
  );
}

function VisionPanel({
  src,
  eyebrow,
  title,
  body,
  children,
  large = false,
}: {
  src: string;
  eyebrow: string;
  title: string;
  body: string;
  children?: ReactNode;
  large?: boolean;
}) {
  return (
    <article
      className={`group relative overflow-hidden border border-white/10 bg-black ${
        large ? "min-h-[390px] xl:col-span-2" : "min-h-[330px]"
      }`}
    >
      <Image
        src={src}
        alt={title}
        fill
        loading="lazy"
        sizes={large ? "100vw" : "(max-width: 1279px) 100vw, 50vw"}
        className="object-cover object-center transition duration-700 group-hover:scale-[1.02]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.7)_45%,rgba(0,0,0,0.24)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(0,0,0,0.92)_100%)]" />

      <div className="relative flex min-h-[inherit] max-w-2xl flex-col justify-end p-6 sm:p-8">
        <div className="text-[9px] font-black uppercase tracking-[0.3em] text-orange-300">
          {eyebrow}
        </div>
        <h3 className="mt-2 text-2xl font-black uppercase text-white sm:text-3xl">
          {title}
        </h3>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/60">{body}</p>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </article>
  );
}

export function ForgeWorldPanels() {
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.32em] text-amber-300">
            <Sparkles className="h-4 w-4" />
            The Kingdom Beyond Yield
          </div>
          <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
            Build something worth owning.
          </h2>
        </div>

        <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">
          Capital · Labour · Ownership · Legacy
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <VisionPanel
          src={FORGE_ASSETS.vision}
          eyebrow="The Master Plan"
          title="The Forge becomes the Kingdom's development engine."
          body="Stake is only the beginning. The Forge turns excess productive capacity into visible projects, public mandates, auditable construction and finite ownership."
          large
        >
          <a
            href="/kingdom-forge/kingdom-forge-constitution.pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 bg-[linear-gradient(135deg,#f97316,#fbbf24)] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-black"
          >
            <BookOpen className="h-4 w-4" />
            Open the 58-page Constitution
          </a>
        </VisionPanel>

        <VisionPanel
          src={FORGE_ASSETS.chamber}
          eyebrow="Law Above Whim"
          title="Ownership follows constitutional math."
          body="Every successful Forge seals exactly 10,000 deeds. No post-Seal dilution. No silent rewrite. No successor can escape the obligations of the feature it replaces."
        >
          <div className="flex gap-2">
            <span className="border border-amber-300/25 bg-black/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
              7,000 Patrons
            </span>
            <span className="border border-orange-300/25 bg-black/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-orange-200">
              2,000 Builders
            </span>
            <span className="border border-cyan-300/25 bg-black/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">
              1,000 Kingdom
            </span>
          </div>
        </VisionPanel>

        <VisionPanel
          src={FORGE_ASSETS.round}
          eyebrow="Mandate Before Money"
          title="The Kingdom chooses before capital burns."
          body="Forge Power is a reversible signal. Citizens can move it between proposed projects. Only explicit Ignition converts real WOLO into project-restricted Build Fuel."
        >
          <Link
            href="/round-chamber"
            className="inline-flex items-center gap-2 border border-cyan-300/30 bg-black/60 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100 transition hover:border-cyan-200/60"
          >
            Enter the Round Chamber
            <ArrowRight className="h-4 w-4" />
          </Link>
        </VisionPanel>
      </div>

      <div className="mt-4 border border-orange-300/15 bg-[linear-gradient(90deg,rgba(249,115,22,0.09),rgba(0,0,0,0.72),rgba(34,211,238,0.06))] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-orange-300" />
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-white">
                Lore above. Accounting beneath.
              </div>
              <div className="mt-1 text-[11px] text-white/45">
                Every pledge, ignition, milestone, point, deed and distribution must remain inspectable.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
            <Coins className="h-4 w-4" />
            One WOLO is always one WOLO
          </div>
        </div>
      </div>
    </section>
  );
}
