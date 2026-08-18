import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Plus,
  Store,
} from "lucide-react";

import MarketplaceInquiryComposer from "@/components/market/MarketplaceInquiryComposer";
import {
  loadPublicMarketplaceAwningListings,
  type PublicMarketplaceShop,
} from "@/lib/marketplaceBusiness";
import { getPrisma } from "@/lib/prisma";

type AwningTheme = {
  card: string;
  cardHover: string;
  awning: string;
  badge: string;
  icon: string;
  eyebrow: string;
  title: string;
  action: string;
};

type StreetTheme = {
  section: string;
  header: string;
  headerIcon: string;
  topLine: string;
  dividerLine: string;
  dividerEyebrow: string;
  dividerAccent: string;
};

type StreetDefinition = {
  id:
    | "second-street"
    | "third-street"
    | "fourth-street"
    | "fifth-street"
    | "sixth-street";
  label: "2nd Street" | "3rd Street" | "4th Street" | "5th Street" | "6th Street";
  theme: StreetTheme;
  awnings: readonly [AwningTheme, AwningTheme, AwningTheme];
};

const SECOND_STREET_AWNINGS = [
  {
    card:
      "border-blue-100/18 bg-[radial-gradient(circle_at_75%_15%,rgba(37,99,235,0.20),transparent_30%),linear-gradient(145deg,#091a38,#060910_72%)]",
    cardHover: "hover:border-blue-100/38",
    awning:
      "bg-[repeating-linear-gradient(90deg,#173b70_0_44px,#b89a61_44px_88px)] shadow-[0_10px_24px_rgba(34,79,155,0.24)]",
    badge:
      "border-blue-100/20 bg-blue-300/[0.075] text-blue-100",
    icon: "text-blue-100/82",
    eyebrow: "text-blue-100/58",
    title: "market-display-gold",
    action: "text-blue-100",
  },
  {
    card:
      "border-rose-100/17 bg-[radial-gradient(circle_at_75%_15%,rgba(190,24,93,0.16),transparent_31%),linear-gradient(145deg,#291119,#090b12_72%)]",
    cardHover: "hover:border-rose-100/34",
    awning:
      "bg-[repeating-linear-gradient(90deg,#652235_0_44px,#b99b71_44px_88px)] shadow-[0_10px_24px_rgba(122,35,55,0.2)]",
    badge:
      "border-rose-100/18 bg-rose-300/[0.07] text-rose-100",
    icon: "text-rose-100/80",
    eyebrow: "text-rose-100/55",
    title: "market-display-ember",
    action: "text-rose-100",
  },
  {
    card:
      "border-violet-100/17 bg-[radial-gradient(circle_at_75%_15%,rgba(124,58,237,0.18),transparent_31%),linear-gradient(145deg,#15132d,#070913_72%)]",
    cardHover: "hover:border-violet-100/34",
    awning:
      "bg-[repeating-linear-gradient(90deg,#3d2a69_0_44px,#a89572_44px_88px)] shadow-[0_10px_24px_rgba(72,47,137,0.2)]",
    badge:
      "border-violet-100/18 bg-violet-300/[0.075] text-violet-100",
    icon: "text-violet-100/80",
    eyebrow: "text-violet-100/55",
    title: "market-display-violet",
    action: "text-violet-100",
  },
] as const satisfies readonly [AwningTheme, AwningTheme, AwningTheme];

const THIRD_STREET_AWNINGS = [
  {
    card:
      "border-sky-100/17 bg-[radial-gradient(circle_at_75%_15%,rgba(59,130,246,0.17),transparent_31%),linear-gradient(145deg,#0c1d36,#070a13_72%)]",
    cardHover: "hover:border-sky-100/34",
    awning:
      "bg-[repeating-linear-gradient(90deg,#21456d_0_44px,#9ba4b4_44px_88px)] shadow-[0_10px_24px_rgba(34,82,145,0.2)]",
    badge:
      "border-sky-100/18 bg-sky-300/[0.07] text-sky-100",
    icon: "text-sky-100/80",
    eyebrow: "text-sky-100/55",
    title: "market-display-silver",
    action: "text-sky-100",
  },
  {
    card:
      "border-indigo-100/17 bg-[radial-gradient(circle_at_75%_15%,rgba(99,102,241,0.18),transparent_31%),linear-gradient(145deg,#171731,#080913_72%)]",
    cardHover: "hover:border-indigo-100/34",
    awning:
      "bg-[repeating-linear-gradient(90deg,#343b75_0_44px,#a39486_44px_88px)] shadow-[0_10px_24px_rgba(65,70,150,0.2)]",
    badge:
      "border-indigo-100/18 bg-indigo-300/[0.07] text-indigo-100",
    icon: "text-indigo-100/80",
    eyebrow: "text-indigo-100/55",
    title: "market-display-violet",
    action: "text-indigo-100",
  },
  {
    card:
      "border-amber-100/17 bg-[radial-gradient(circle_at_75%_15%,rgba(245,158,11,0.14),transparent_31%),linear-gradient(145deg,#2a2010,#080a12_72%)]",
    cardHover: "hover:border-amber-100/34",
    awning:
      "bg-[repeating-linear-gradient(90deg,#76531f_0_44px,#b9a27d_44px_88px)] shadow-[0_10px_24px_rgba(127,88,32,0.2)]",
    badge:
      "border-amber-100/18 bg-amber-300/[0.07] text-amber-100",
    icon: "text-amber-100/80",
    eyebrow: "text-amber-100/55",
    title: "market-display-gold",
    action: "text-amber-100",
  },
] as const satisfies readonly [AwningTheme, AwningTheme, AwningTheme];

const FOURTH_STREET_AWNINGS = [
  {
    card:
      "border-lime-100/15 bg-[radial-gradient(circle_at_75%_15%,rgba(132,204,22,0.11),transparent_31%),linear-gradient(145deg,#202312,#080a12_72%)]",
    cardHover: "hover:border-lime-100/32",
    awning:
      "bg-[repeating-linear-gradient(90deg,#4f5524_0_44px,#a48655_44px_88px)] shadow-[0_10px_24px_rgba(113,103,35,0.2)]",
    badge:
      "border-lime-100/17 bg-lime-300/[0.06] text-lime-100",
    icon: "text-lime-100/78",
    eyebrow: "text-lime-100/52",
    title: "market-display-gold",
    action: "text-lime-100",
  },
  {
    card:
      "border-red-100/16 bg-[radial-gradient(circle_at_75%_15%,rgba(220,38,38,0.14),transparent_31%),linear-gradient(145deg,#2b1110,#090a12_72%)]",
    cardHover: "hover:border-red-100/33",
    awning:
      "bg-[repeating-linear-gradient(90deg,#6a2520_0_44px,#ad8f63_44px_88px)] shadow-[0_10px_24px_rgba(120,39,32,0.2)]",
    badge:
      "border-red-100/17 bg-red-300/[0.065] text-red-100",
    icon: "text-red-100/78",
    eyebrow: "text-red-100/52",
    title: "market-display-ember",
    action: "text-red-100",
  },
  {
    card:
      "border-cyan-100/16 bg-[radial-gradient(circle_at_75%_15%,rgba(6,182,212,0.13),transparent_31%),linear-gradient(145deg,#0b252b,#070a12_72%)]",
    cardHover: "hover:border-cyan-100/33",
    awning:
      "bg-[repeating-linear-gradient(90deg,#185663_0_44px,#9c9a83_44px_88px)] shadow-[0_10px_24px_rgba(24,93,106,0.2)]",
    badge:
      "border-cyan-100/17 bg-cyan-300/[0.065] text-cyan-100",
    icon: "text-cyan-100/78",
    eyebrow: "text-cyan-100/52",
    title: "market-display-silver",
    action: "text-cyan-100",
  },
] as const satisfies readonly [AwningTheme, AwningTheme, AwningTheme];

const FIFTH_STREET_AWNINGS = [
  {
    card:
      "border-fuchsia-100/16 bg-[radial-gradient(circle_at_75%_15%,rgba(168,85,247,0.16),transparent_31%),linear-gradient(145deg,#24102e,#070913_72%)]",
    cardHover: "hover:border-fuchsia-100/33",
    awning:
      "bg-[repeating-linear-gradient(90deg,#5b2b72_0_44px,#b79b6b_44px_88px)] shadow-[0_10px_24px_rgba(106,52,137,0.2)]",
    badge: "border-fuchsia-100/17 bg-fuchsia-300/[0.065] text-fuchsia-100",
    icon: "text-fuchsia-100/78",
    eyebrow: "text-fuchsia-100/52",
    title: "market-display-gold",
    action: "text-fuchsia-100",
  },
  {
    card:
      "border-orange-100/16 bg-[radial-gradient(circle_at_75%_15%,rgba(234,88,12,0.14),transparent_31%),linear-gradient(145deg,#31160d,#090a12_72%)]",
    cardHover: "hover:border-orange-100/33",
    awning:
      "bg-[repeating-linear-gradient(90deg,#7b3320_0_44px,#b39a77_44px_88px)] shadow-[0_10px_24px_rgba(127,55,31,0.2)]",
    badge: "border-orange-100/17 bg-orange-300/[0.065] text-orange-100",
    icon: "text-orange-100/78",
    eyebrow: "text-orange-100/52",
    title: "market-display-ember",
    action: "text-orange-100",
  },
  {
    card:
      "border-emerald-100/16 bg-[radial-gradient(circle_at_75%_15%,rgba(16,185,129,0.14),transparent_31%),linear-gradient(145deg,#0d2a23,#070a12_72%)]",
    cardHover: "hover:border-emerald-100/33",
    awning:
      "bg-[repeating-linear-gradient(90deg,#1f6351_0_44px,#9d9f91_44px_88px)] shadow-[0_10px_24px_rgba(31,105,84,0.2)]",
    badge: "border-emerald-100/17 bg-emerald-300/[0.065] text-emerald-100",
    icon: "text-emerald-100/78",
    eyebrow: "text-emerald-100/52",
    title: "market-display-silver",
    action: "text-emerald-100",
  },
] as const satisfies readonly [AwningTheme, AwningTheme, AwningTheme];

const SIXTH_STREET_AWNINGS = [
  {
    card:
      "border-cyan-100/16 bg-[radial-gradient(circle_at_75%_15%,rgba(34,211,238,0.13),transparent_31%),linear-gradient(145deg,#0b2630,#070910_72%)]",
    cardHover: "hover:border-cyan-100/34",
    awning:
      "bg-[repeating-linear-gradient(90deg,#1f5b69_0_44px,#b2b9bc_44px_88px)] shadow-[0_10px_24px_rgba(31,103,119,0.2)]",
    badge: "border-cyan-100/17 bg-cyan-300/[0.065] text-cyan-100",
    icon: "text-cyan-100/80",
    eyebrow: "text-cyan-100/54",
    title: "market-display-silver",
    action: "text-cyan-100",
  },
  {
    card:
      "border-red-100/16 bg-[radial-gradient(circle_at_75%_15%,rgba(239,68,68,0.13),transparent_31%),linear-gradient(145deg,#30120d,#090912_72%)]",
    cardHover: "hover:border-red-100/34",
    awning:
      "bg-[repeating-linear-gradient(90deg,#722a21_0_44px,#b18750_44px_88px)] shadow-[0_10px_24px_rgba(130,45,34,0.2)]",
    badge: "border-red-100/17 bg-red-300/[0.065] text-red-100",
    icon: "text-red-100/80",
    eyebrow: "text-red-100/54",
    title: "market-display-gold",
    action: "text-red-100",
  },
  {
    card:
      "border-amber-100/17 bg-[radial-gradient(circle_at_75%_15%,rgba(245,158,11,0.15),transparent_31%),linear-gradient(145deg,#241d0d,#070810_72%)]",
    cardHover: "hover:border-amber-100/36",
    awning:
      "bg-[repeating-linear-gradient(90deg,#74551e_0_44px,#d0b271_44px_88px)] shadow-[0_10px_24px_rgba(130,95,30,0.22)]",
    badge: "border-amber-100/18 bg-amber-300/[0.07] text-amber-100",
    icon: "text-amber-100/82",
    eyebrow: "text-amber-100/55",
    title: "market-display-gold",
    action: "text-amber-100",
  },
] as const satisfies readonly [AwningTheme, AwningTheme, AwningTheme];

const STREETS: readonly StreetDefinition[] = [
  {
    id: "second-street",
    label: "2nd Street",
    theme: {
      section:
        "bg-[radial-gradient(circle_at_10%_0%,rgba(20,184,166,0.09),transparent_30%),radial-gradient(circle_at_92%_100%,rgba(190,24,93,0.055),transparent_32%),linear-gradient(145deg,rgba(13,18,31,0.94),rgba(3,6,14,0.96))]",
      header: "text-teal-100/70",
      headerIcon: "text-teal-100/75",
      topLine: "from-transparent via-teal-100/30 to-transparent",
      dividerLine: "from-transparent via-teal-100/32 to-transparent",
      dividerEyebrow: "text-teal-100/55",
      dividerAccent: "text-[#7fd6cf]",
    },
    awnings: SECOND_STREET_AWNINGS,
  },
  {
    id: "third-street",
    label: "3rd Street",
    theme: {
      section:
        "bg-[radial-gradient(circle_at_90%_0%,rgba(59,130,246,0.09),transparent_31%),radial-gradient(circle_at_8%_100%,rgba(245,158,11,0.05),transparent_31%),linear-gradient(145deg,rgba(13,18,31,0.94),rgba(3,6,14,0.96))]",
      header: "text-sky-100/70",
      headerIcon: "text-sky-100/75",
      topLine: "from-transparent via-sky-100/30 to-transparent",
      dividerLine: "from-transparent via-sky-100/32 to-transparent",
      dividerEyebrow: "text-sky-100/55",
      dividerAccent: "text-[#9fc8ef]",
    },
    awnings: THIRD_STREET_AWNINGS,
  },
  {
    id: "fourth-street",
    label: "4th Street",
    theme: {
      section:
        "bg-[radial-gradient(circle_at_10%_0%,rgba(132,204,22,0.07),transparent_30%),radial-gradient(circle_at_92%_92%,rgba(220,38,38,0.05),transparent_31%),linear-gradient(145deg,rgba(13,18,31,0.94),rgba(3,6,14,0.96))]",
      header: "text-lime-100/65",
      headerIcon: "text-lime-100/70",
      topLine: "from-transparent via-lime-100/26 to-transparent",
      dividerLine: "from-transparent via-amber-100/30 to-transparent",
      dividerEyebrow: "text-amber-100/55",
      dividerAccent: "text-[#d0aa5c]",
    },
    awnings: FOURTH_STREET_AWNINGS,
  },
  {
    id: "fifth-street",
    label: "5th Street",
    theme: {
      section:
        "bg-[radial-gradient(circle_at_10%_0%,rgba(168,85,247,0.07),transparent_30%),radial-gradient(circle_at_92%_92%,rgba(16,185,129,0.05),transparent_31%),linear-gradient(145deg,rgba(13,18,31,0.94),rgba(3,6,14,0.96))]",
      header: "text-fuchsia-100/65",
      headerIcon: "text-fuchsia-100/70",
      topLine: "from-transparent via-fuchsia-100/26 to-transparent",
      dividerLine: "from-transparent via-fuchsia-100/30 to-transparent",
      dividerEyebrow: "text-fuchsia-100/55",
      dividerAccent: "text-[#d7a5e8]",
    },
    awnings: FIFTH_STREET_AWNINGS,
  },
  {
    id: "sixth-street",
    label: "6th Street",
    theme: {
      section:
        "bg-[radial-gradient(circle_at_90%_0%,rgba(34,211,238,0.07),transparent_30%),radial-gradient(circle_at_10%_92%,rgba(245,158,11,0.05),transparent_31%),linear-gradient(145deg,rgba(13,18,31,0.94),rgba(3,6,14,0.96))]",
      header: "text-cyan-100/65",
      headerIcon: "text-cyan-100/70",
      topLine: "from-transparent via-cyan-100/26 to-transparent",
      dividerLine: "from-transparent via-amber-100/30 to-transparent",
      dividerEyebrow: "text-amber-100/55",
      dividerAccent: "text-[#d0aa5c]",
    },
    awnings: SIXTH_STREET_AWNINGS,
  },
];

function shopEyebrow(shop: PublicMarketplaceShop) {
  if (shop.kind === "player") {
    return (
      <>
        <span>Proprietor</span>
        {" · "}
        {shop.proprietorLabel}
      </>
    );
  }

  return shop.proprietorLabel;
}

function StreetAwning({
  street,
  slot,
  shop,
}: {
  street: StreetDefinition;
  slot: 1 | 2 | 3;
  shop: PublicMarketplaceShop | null;
}) {
  const awning = street.awnings[slot - 1];

  if (shop) {
    const deepHref =
      shop.kind === "player" ? `/market/shops/${shop.slug}` : shop.href;

    return (
      <article
        className={`group relative isolate flex min-h-[22rem] flex-col overflow-hidden rounded-[1.7rem] border p-5 transition hover:-translate-y-1 ${awning.card} ${awning.cardHover}`}
      >
        <div
          className={`absolute inset-x-0 top-0 h-5 opacity-90 ${awning.awning}`}
        />

        <div className="relative mt-5 flex items-center justify-between gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${awning.badge}`}
          >
            Open for trade
          </span>
          <Store className={`h-5 w-5 ${awning.icon}`} />
        </div>

        <div className="mt-6 grid flex-1 grid-rows-[1.25rem_5rem_3.25rem_auto]">
          <div
            className={`self-start text-[10px] font-bold uppercase tracking-[0.26em] ${awning.eyebrow}`}
          >
            {shopEyebrow(shop)}
          </div>

          <h3
            className={`market-display-title ${awning.title} self-start pt-2 font-serif text-[2rem] font-medium leading-[1.05] tracking-[-0.035em]`}
          >
            {shop.name}
          </h3>

          <p className="self-start text-sm leading-6 text-slate-300">
            {shop.offer}
          </p>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            {shop.kind === "player" ? (
              <MarketplaceInquiryComposer
                shopSlug={shop.slug}
                shopName={shop.name}
                compact
                compactTone={
                  street.id === "second-street" && slot === 1 ? "blue" : "teal"
                }
              />
            ) : (
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Kingdom shop
              </span>
            )}

            <Link
              href={deepHref}
              className={`inline-flex items-center gap-2 text-sm font-bold ${awning.action}`}
            >
              {shop.kind === "player" ? "Enter shop" : "Enter"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <Link
      href="#open-shop"
      className={`group relative flex min-h-[22rem] flex-col overflow-hidden rounded-[1.7rem] border p-5 transition hover:-translate-y-1 ${awning.card} ${awning.cardHover}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-5 opacity-90 ${awning.awning}`}
      />

      <div className="relative mt-5 flex items-center justify-between gap-3">
        <span
          className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${awning.badge}`}
        >
          Empty awning
        </span>

        <Plus
          className={`h-5 w-5 transition group-hover:rotate-90 ${awning.icon}`}
        />
      </div>

      <div className="mt-6 grid flex-1 grid-rows-[1.25rem_5rem_3.25rem_auto]">
        <div
          className={`self-start text-[10px] font-bold uppercase tracking-[0.26em] ${awning.eyebrow}`}
        >
          The next merchant
        </div>

        <h3
          className={`market-display-title ${awning.title} self-start pt-2 font-serif text-[2rem] font-medium leading-[1.05] tracking-[-0.035em]`}
        >
          Your craft belongs here.
        </h3>

        <p className="self-start text-sm leading-6 text-slate-400">
          A new place for the next merchant, service, craft, or idea inside the
          AoE2WAR marketplace.
        </p>

        <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
            Awning 0{slot}
          </span>

          <span
            className={`inline-flex items-center gap-2 text-sm font-bold ${awning.action}`}
          >
            Raise an awning
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function MarketplaceStreet({
  street,
  listings,
}: {
  street: StreetDefinition;
  listings: PublicMarketplaceShop[];
}) {
  const { theme } = street;

  return (
    <section
      id={street.id}
      className={`relative scroll-mt-24 overflow-hidden rounded-[2rem] border border-white/9 p-5 sm:p-8 ${theme.section}`}
    >
      <div
        className={`pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r ${theme.topLine}`}
      />

      <div className="relative flex items-center justify-between gap-3">
        <div
          className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.34em] ${theme.header}`}
        >
          <Store className="h-4 w-4" />
          {street.label}
        </div>

        <span className="rounded-full border border-white/8 bg-white/[0.025] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Three awnings
        </span>
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-3">
        {([1, 2, 3] as const).map((slot) => (
          <StreetAwning
            key={slot}
            street={street}
            slot={slot}
            shop={
              listings.find(
                (candidate) =>
                  candidate.streetKey === street.id &&
                  candidate.slot === slot
              ) || null
            }
          />
        ))}
      </div>
    </section>
  );
}

function StreetArrivalSign({
  street,
}: {
  street: StreetDefinition;
}) {
  const { theme } = street;

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/9 bg-slate-950/55 px-5 py-7 text-center sm:px-8 sm:py-10">
      <div
        className={`pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r ${theme.dividerLine}`}
      />

      <Crown className={`mx-auto h-6 w-6 ${theme.headerIcon}`} />

      <p
        className={`mt-4 text-[10px] font-bold uppercase tracking-[0.32em] ${theme.dividerEyebrow}`}
      >
        The marketplace continues
      </p>

      <h2 className="mx-auto mt-3 max-w-3xl text-balance font-serif text-3xl font-normal leading-[1.08] tracking-[-0.03em] text-[#c9c2b4] sm:text-4xl">
        The road opens ahead.{" "}
        <span className={theme.dividerAccent}>2nd Street is just ahead.</span>
      </h2>

      <Link
        href="#second-street"
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/13 bg-black/32 px-5 py-2.5 text-sm font-semibold text-slate-200 shadow-[0_16px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.055] hover:text-white sm:min-w-[12rem]"
      >
        Continue to 2nd Street
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

function StreetDivider({
  street,
  nextStreet,
  final = false,
}: {
  street: StreetDefinition;
  nextStreet?: StreetDefinition;
  final?: boolean;
}) {
  const { theme } = street;

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/9 bg-slate-950/55 px-5 py-7 text-center sm:px-8 sm:py-10">
      <div
        className={`pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r ${theme.dividerLine}`}
      />

      <Crown
        className={`mx-auto h-6 w-6 ${
          final ? "text-amber-100/70" : theme.headerIcon
        }`}
      />

      <p
        className={`mt-4 text-[10px] font-bold uppercase tracking-[0.32em] ${
          final ? "text-amber-100/55" : theme.dividerEyebrow
        }`}
      >
        {final
          ? "Six streets of a larger world"
          : `${street.label} continues the marketplace`}
      </p>

      <h2 className="mx-auto mt-3 max-w-3xl text-balance font-serif text-3xl font-normal leading-[1.08] tracking-[-0.03em] text-[#c9c2b4] sm:text-4xl">
        {final ? (
          <>
            Six streets. Still room to build.{" "}
            <span className="text-[#d0aa5c]">What can you bring?</span>
          </>
        ) : (
          <>
            The road continues.{" "}
            <span className={theme.dividerAccent}>
              {nextStreet?.label} is just ahead.
            </span>
          </>
        )}
      </h2>

      {final ? (
        <Link
          href="/contact-emaren"
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/13 bg-black/32 px-5 py-2.5 text-sm font-semibold text-slate-200 shadow-[0_16px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-100/25 hover:bg-white/[0.055] hover:text-white sm:min-w-[12rem]"
        >
          Contact Emaren
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <Link
          href={`#${nextStreet?.id}`}
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/13 bg-black/32 px-5 py-2.5 text-sm font-semibold text-slate-200 shadow-[0_16px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.055] hover:text-white sm:min-w-[12rem]"
        >
          Continue to {nextStreet?.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}

export default async function MarketplaceExpansionStreets() {
  const secondStreet = STREETS[0];
  const thirdStreet = STREETS[1];
  const fourthStreet = STREETS[2];
  const fifthStreet = STREETS[3];
  const sixthStreet = STREETS[4];
  const listings = await loadPublicMarketplaceAwningListings(getPrisma());

  return (
    <>
      <StreetArrivalSign street={secondStreet} />
      <MarketplaceStreet street={secondStreet} listings={listings} />
      <StreetDivider street={secondStreet} nextStreet={thirdStreet} />
      <MarketplaceStreet street={thirdStreet} listings={listings} />
      <StreetDivider street={thirdStreet} nextStreet={fourthStreet} />
      <MarketplaceStreet street={fourthStreet} listings={listings} />
      <StreetDivider street={fourthStreet} nextStreet={fifthStreet} />
      <MarketplaceStreet street={fifthStreet} listings={listings} />
      <StreetDivider street={fifthStreet} nextStreet={sixthStreet} />
      <MarketplaceStreet street={sixthStreet} listings={listings} />
      <StreetDivider street={sixthStreet} final />
    </>
  );
}
