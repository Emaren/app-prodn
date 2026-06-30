import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Gem,
  Hammer,
  Landmark,
  PackageCheck,
  Plus,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Store,
  Swords,
} from "lucide-react";

import {
  AvatarCommissionScroll,
  MarketplaceDeliveryRail,
  OpenShopDesk,
} from "@/components/market/MarketplaceRequestDesks";
import { MARKETPLACE_CONFIG } from "@/lib/marketplace";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.webp";

export const metadata: Metadata = {
  title: "The Marketplace",
  description:
    "The AoE2WAR Marketplace: player-built shops, custom identities, strategy, craft, and commerce inside the kingdom.",
  alternates: {
    canonical: "/market",
  },
};

const IDENTITY_EXAMPLES = [
  {
    src: "/champions/players/emaren.card.webp",
    label: "The sovereign",
    tone: "border-amber-100/22",
  },
  {
    src: "/champions/players/jim.card.webp",
    label: "The veteran",
    tone: "border-sky-100/18",
  },
  {
    src: "/champions/players/sniper.card.webp",
    label: "The shadow",
    tone: "border-rose-100/18",
  },
] as const;

const MARKET_PRINCIPLES = [
  {
    icon: Hammer,
    title: "Craft becomes offer",
    detail: "A useful skill earns an awning.",
  },
  {
    icon: ShieldCheck,
    title: "Delivery earns trust",
    detail: "Work lands where players live.",
  },
  {
    icon: Gem,
    title: "Trust becomes economy",
    detail: "One stall makes room for the next.",
  },
] as const;

export default function MarketPage() {
  return (
    <main className="space-y-6 py-3 text-white sm:space-y-8 sm:py-5">
      <section className="relative isolate min-h-[40rem] overflow-hidden rounded-[2.2rem] border border-amber-100/16 bg-[#03060c] shadow-[0_40px_125px_rgba(0,0,0,0.45)] sm:min-h-[45rem]">
        <Image
          src="/market/agora-marketplace.webp"
          alt="The torchlit AoE2WAR Agora filled with ancient merchant awnings"
          fill
          priority
          sizes="(max-width: 1536px) 100vw, 1536px"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,5,13,0.97)_0%,rgba(2,5,13,0.88)_30%,rgba(2,5,13,0.45)_58%,rgba(2,5,13,0.12)_100%),linear-gradient(180deg,rgba(2,5,13,0.12),rgba(2,5,13,0.22)_58%,rgba(2,5,13,0.94)_100%)]" />
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />

        <div className="relative flex min-h-[40rem] max-w-[53rem] flex-col justify-between px-6 pb-32 pt-12 sm:min-h-[45rem] sm:px-10 sm:py-12 lg:px-14">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/22 bg-black/38 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100 backdrop-blur-md">
                <Landmark className="h-3.5 w-3.5" />
                The Agora is open
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-100/18 bg-black/38 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-100 backdrop-blur-md">
                <Store className="h-3.5 w-3.5" />
                First shop trading
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/18 bg-black/38 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-50 backdrop-blur-md">
                <Image
                  src={WOLO_LOGO_SRC}
                  alt="WOLO"
                  width={22}
                  height={22}
                  className="h-[1.35rem] w-[1.35rem] object-contain drop-shadow-[0_3px_8px_rgba(245,158,11,0.34)]"
                />
                WOLO economy
              </span>
            </div>

            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.42em] text-slate-400">
              AoE2WAR · The Marketplace
            </p>
          </div>

          <div className="max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-100/18 bg-black/55 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-50 backdrop-blur-lg">
              <Image
                src={WOLO_LOGO_SRC}
                alt=""
                width={24}
                height={24}
                className="h-5 w-5 object-contain"
              />
              {MARKETPLACE_CONFIG.avatarPriceWolo} WOLO founding commission
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="#stalls"
              className="market-gold-button group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-black sm:min-h-14 sm:min-w-[13.5rem] sm:px-8 sm:text-base"
            >
              Walk the Agora
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
            <Link
              href="#open-shop"
              className="market-iron-button inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold sm:min-h-14 sm:min-w-[13.5rem] sm:px-8 sm:text-base"
            >
              Open a shop
              <Plus className="h-4 w-4 text-amber-100" />
            </Link>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-4 bottom-4 hidden grid-cols-3 gap-2 sm:grid lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[38rem]">
          {[
            ["01", "Founding shop"],
            [`${MARKETPLACE_CONFIG.avatarPriceWolo} WOLO`, "First commission"],
            ["∞", "Room to build"],
          ].map(([value, label]) => (
            <div
              key={label}
              className="rounded-[1rem] border border-white/10 bg-slate-950/62 px-4 py-3 backdrop-blur-xl"
            >
              <div className="market-display-title market-display-gold font-serif text-lg font-semibold">
                {value}
              </div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        id="stalls"
        className="scroll-mt-24 rounded-[2rem] border border-white/9 bg-[linear-gradient(145deg,rgba(13,18,31,0.94),rgba(3,6,14,0.96))] p-5 sm:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.34em] text-amber-100/65">
            <Store className="h-4 w-4" />
            Market street
          </div>
          <span className="rounded-full border border-white/8 bg-white/[0.025] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Three awnings
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <Link
            href="#visage-forge"
            className="group relative flex min-h-[22rem] flex-col overflow-hidden rounded-[1.7rem] border border-rose-100/18 bg-[radial-gradient(circle_at_75%_15%,rgba(244,63,94,0.16),transparent_30%),linear-gradient(145deg,#26100f,#090b12_72%)] p-5 transition hover:-translate-y-1 hover:border-rose-100/35"
          >
            <div className="absolute inset-x-0 top-0 h-5 bg-[repeating-linear-gradient(90deg,#5a1818_0_44px,#bd9b5d_44px_88px)] opacity-90" />
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="rounded-full border border-amber-100/18 bg-amber-200/[0.08] px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-amber-100">
                Founding shop
              </span>
              <Crown className="h-5 w-5 text-amber-100/80" />
            </div>
            <div className="mt-auto">
              <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-rose-100/55">
                {MARKETPLACE_CONFIG.avatarCraftName}
              </div>
              <h3 className="market-display-title market-display-ember mt-2 font-serif text-[2rem] font-medium leading-none tracking-[-0.035em]">
                {MARKETPLACE_CONFIG.avatarShopName}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Custom identities forged from your own words.
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                <span className="inline-flex items-center gap-1.5 text-sm font-black text-amber-100">
                  <Image
                    src={WOLO_LOGO_SRC}
                    alt=""
                    width={22}
                    height={22}
                    className="h-5 w-5 object-contain"
                  />
                  {MARKETPLACE_CONFIG.avatarPriceWolo} WOLO
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
                  Enter forge
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>

          <Link
            href="/academy"
            className="group relative flex min-h-[22rem] flex-col overflow-hidden rounded-[1.7rem] border border-violet-100/16 bg-[radial-gradient(circle_at_75%_15%,rgba(124,58,237,0.19),transparent_32%),linear-gradient(145deg,#121128,#070913_72%)] p-5 transition hover:-translate-y-1 hover:border-violet-100/34"
          >
            <div className="absolute inset-x-0 top-0 h-5 bg-[repeating-linear-gradient(90deg,#352363_0_44px,#a78b6d_44px_88px)] opacity-90" />
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="rounded-full border border-violet-100/18 bg-violet-300/[0.08] px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-violet-100">
                Academy dispatch
              </span>
              <Swords className="h-5 w-5 text-violet-100/80" />
            </div>
            <div className="mt-auto">
              <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-violet-100/55">
                Strategic counsel
              </div>
              <h3 className="market-display-title market-display-violet mt-2 max-w-sm font-serif text-[2rem] font-medium leading-[1.02] tracking-[-0.035em]">
                Train under proven players.
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Replay study, battlefield judgment, and direct advice.
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Academy wing
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-violet-100">
                  Enter Academy
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>

          <Link
            href="#open-shop"
            className="group relative flex min-h-[22rem] flex-col overflow-hidden rounded-[1.7rem] border border-dashed border-amber-100/20 bg-[radial-gradient(circle_at_50%_26%,rgba(251,191,36,0.10),transparent_28%),rgba(5,8,15,0.9)] p-5 transition hover:-translate-y-1 hover:border-amber-100/42"
          >
            <div className="absolute inset-x-0 top-0 h-5 bg-[repeating-linear-gradient(90deg,#6c532d_0_44px,#2e2619_44px_88px)] opacity-60" />
            <div className="mt-auto text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.5rem] border border-amber-100/18 bg-amber-200/[0.07] text-amber-100 transition group-hover:scale-105 group-hover:bg-amber-200/10">
                <Plus className="h-9 w-9" />
              </div>
              <div className="mt-6 text-[10px] font-bold uppercase tracking-[0.26em] text-amber-100/55">
                Empty awning
              </div>
              <h3 className="market-display-title market-display-gold mx-auto mt-2 font-serif text-[2rem] font-medium leading-[1.02] tracking-[-0.035em]">
                Your craft belongs here.
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-400">
                Skins, banners, overlays, analysis—or the thing nobody has
                named yet.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-amber-100">
                Raise an awning
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        </div>
      </section>

      <section
        id="visage-forge"
        className="scroll-mt-24 overflow-hidden rounded-[2.1rem] border border-rose-100/15 bg-[radial-gradient(circle_at_10%_10%,rgba(127,29,29,0.2),transparent_31%),radial-gradient(circle_at_85%_18%,rgba(251,191,36,0.1),transparent_26%),linear-gradient(145deg,#120b0c,#050711_62%)] p-5 shadow-[0_35px_110px_rgba(0,0,0,0.36)] sm:p-8"
      >
        <div className="grid gap-8 xl:grid-cols-[minmax(0,0.92fr)_minmax(32rem,1.08fr)] xl:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-100/18 bg-rose-300/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.23em] text-rose-100">
                <Hammer className="h-3.5 w-3.5" />
                Founding craft
              </span>
              <span className="rounded-full border border-amber-100/16 bg-amber-200/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-100">
                Profile delivery
              </span>
            </div>
            <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.34em] text-amber-100/55">
              The {MARKETPLACE_CONFIG.avatarCraftName}
            </p>
            <h2 className="market-display-title market-display-ember mt-3 font-serif text-4xl font-medium leading-[0.96] tracking-[-0.04em] sm:text-6xl">
              The Visage Forge
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
              Armor, colour, bearing, belt, atmosphere—shaped into a new
              profile identity.
            </p>

            <div className="mt-7 grid grid-cols-3 gap-3">
              {IDENTITY_EXAMPLES.map((identity) => (
                <div
                  key={identity.label}
                  className={`group overflow-hidden rounded-[1.2rem] border bg-black/30 ${identity.tone}`}
                >
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <Image
                      src={identity.src}
                      alt=""
                      fill
                      sizes="(max-width: 1280px) 30vw, 13vw"
                      className="object-cover object-top opacity-88 transition duration-500 group-hover:scale-[1.035] group-hover:opacity-100"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute inset-x-2 bottom-2 text-center text-[9px] font-black uppercase tracking-[0.16em] text-white">
                      {identity.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[1.35rem] border border-amber-100/15 bg-amber-200/[0.055] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Image
                    src={WOLO_LOGO_SRC}
                    alt="WOLO"
                    width={48}
                    height={48}
                    className="h-11 w-11 object-contain drop-shadow-[0_8px_18px_rgba(245,158,11,0.26)]"
                  />
                  <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-amber-100/55">
                    Custom identity
                  </div>
                  <div className="market-display-title market-display-gold mt-1 font-serif text-3xl font-semibold">
                    {MARKETPLACE_CONFIG.avatarPriceWolo}{" "}
                    <span className="text-sm text-amber-100">WOLO</span>
                  </div>
                  </div>
                </div>
                <span className="rounded-full border border-white/8 bg-black/20 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Profile vault
                </span>
              </div>
              <div className="mt-4 flex items-start gap-2 border-t border-amber-100/10 pt-4 text-xs leading-5 text-slate-400">
                <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
                Finished work enters your profile avatar vault, ready to select
                beside your existing identities.
              </div>
            </div>

            <div className="mt-5">
              <MarketplaceDeliveryRail />
            </div>
          </div>

          <AvatarCommissionScroll />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {MARKET_PRINCIPLES.map(({ icon: Icon, title, detail }, index) => (
          <article
            key={title}
            className="group flex items-center gap-4 rounded-[1.45rem] border border-white/9 bg-[linear-gradient(145deg,rgba(15,23,42,0.82),rgba(3,7,18,0.9))] p-4 transition hover:-translate-y-0.5 hover:border-amber-100/20 sm:p-5"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[1rem] border border-amber-100/15 bg-amber-200/[0.07] text-amber-100">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-600">
                Agora law 0{index + 1}
              </div>
              <h3 className="mt-1 font-serif text-base font-medium text-amber-50/85">
                {title}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
            </div>
          </article>
        ))}
      </section>

      <section
        id="open-shop"
        className="scroll-mt-24 overflow-hidden rounded-[2.1rem] border border-amber-100/14 bg-[radial-gradient(circle_at_15%_20%,rgba(251,191,36,0.12),transparent_27%),linear-gradient(145deg,#13100b,#050710_70%)] p-5 sm:p-8"
      >
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.72fr)] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.34em] text-amber-100/65">
              <Sparkles className="h-4 w-4" />
              The next awning
            </div>
            <h2 className="market-display-title market-display-gold mt-4 max-w-3xl font-serif text-3xl font-medium leading-[1.02] tracking-[-0.035em] sm:text-5xl">
              Build a business inside the kingdom.
            </h2>
            <p className="mt-5 max-w-2xl font-serif text-lg font-medium leading-8 text-slate-300">
              If the AoE2 world can use it, the Agora can hold it.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "Skins",
                "Clan banners",
                "Stream craft",
                "Replay analysis",
                "Tournament tools",
                "Something new",
              ].map((idea) => (
                <span
                  key={idea}
                  className="rounded-full border border-white/9 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-slate-300"
                >
                  {idea}
                </span>
              ))}
            </div>
            <div className="mt-7 flex max-w-xl items-start gap-3 rounded-[1.2rem] border border-white/8 bg-white/[0.025] p-4">
              <ScrollText className="mt-0.5 h-5 w-5 shrink-0 text-amber-100" />
              <p className="text-sm leading-6 text-slate-400">
                Start with the useful thing you can deliver. The market keeper
                will help turn it into a clear stall, price, and path.
              </p>
            </div>
          </div>
          <OpenShopDesk />
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2rem] border border-white/9 bg-slate-950/55 px-5 py-7 text-center sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/35 to-transparent" />
        <Crown className="mx-auto h-6 w-6 text-amber-100/70" />
        <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.32em] text-amber-100/55">
          The first street of a larger world
        </p>
        <h2 className="market-display-title market-display-silver mx-auto mt-3 max-w-3xl font-serif text-3xl font-medium leading-[1.04] tracking-[-0.035em] sm:text-5xl">
          The Visage Forge is one shop. What can you bring?
        </h2>
      </section>
    </main>
  );
}
