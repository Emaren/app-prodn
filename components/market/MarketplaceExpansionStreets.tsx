import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Plus,
  Store,
} from "lucide-react";

type StreetTheme = {
  section: string;
  header: string;
  headerIcon: string;
  topLine: string;
  card: string;
  cardHover: string;
  awning: string;
  badge: string;
  eyebrow: string;
  title: string;
  action: string;
  dividerLine: string;
  dividerEyebrow: string;
  dividerAccent: string;
};

type StreetDefinition = {
  id: string;
  label: string;
  theme: StreetTheme;
};

const STREETS: StreetDefinition[] = [
  {
    id: "second-street",
    label: "2nd Street",
    theme: {
      section:
        "bg-[radial-gradient(circle_at_12%_0%,rgba(20,184,166,0.12),transparent_32%),radial-gradient(circle_at_90%_100%,rgba(180,83,9,0.08),transparent_34%),linear-gradient(145deg,rgba(5,27,30,0.96),rgba(3,7,16,0.98))]",
      header:
        "text-teal-100/70",
      headerIcon:
        "text-teal-100/75",
      topLine:
        "from-transparent via-teal-100/30 to-transparent",
      card:
        "border-teal-100/16 bg-[radial-gradient(circle_at_78%_15%,rgba(20,184,166,0.14),transparent_31%),linear-gradient(145deg,#092323,#060a13_72%)]",
      cardHover:
        "hover:border-teal-100/34",
      awning:
        "bg-[repeating-linear-gradient(90deg,#174a48_0_44px,#9b8054_44px_88px)] shadow-[0_10px_24px_rgba(20,110,105,0.18)]",
      badge:
        "border-teal-100/18 bg-teal-300/[0.07] text-teal-100/85",
      eyebrow:
        "text-teal-100/55",
      title:
        "market-display-gold",
      action:
        "text-teal-100",
      dividerLine:
        "from-transparent via-teal-100/32 to-transparent",
      dividerEyebrow:
        "text-teal-100/55",
      dividerAccent:
        "text-[#7fd6cf]",
    },
  },
  {
    id: "third-street",
    label: "3rd Street",
    theme: {
      section:
        "bg-[radial-gradient(circle_at_88%_0%,rgba(59,130,246,0.13),transparent_34%),radial-gradient(circle_at_8%_100%,rgba(99,102,241,0.08),transparent_34%),linear-gradient(145deg,rgba(8,18,38,0.96),rgba(3,6,15,0.98))]",
      header:
        "text-sky-100/70",
      headerIcon:
        "text-sky-100/75",
      topLine:
        "from-transparent via-sky-100/30 to-transparent",
      card:
        "border-sky-100/16 bg-[radial-gradient(circle_at_78%_15%,rgba(59,130,246,0.15),transparent_31%),linear-gradient(145deg,#0b1830,#060913_72%)]",
      cardHover:
        "hover:border-sky-100/34",
      awning:
        "bg-[repeating-linear-gradient(90deg,#1e3a5f_0_44px,#8b91a1_44px_88px)] shadow-[0_10px_24px_rgba(34,82,145,0.2)]",
      badge:
        "border-sky-100/18 bg-sky-300/[0.07] text-sky-100/85",
      eyebrow:
        "text-sky-100/55",
      title:
        "market-display-silver",
      action:
        "text-sky-100",
      dividerLine:
        "from-transparent via-sky-100/32 to-transparent",
      dividerEyebrow:
        "text-sky-100/55",
      dividerAccent:
        "text-[#9fc8ef]",
    },
  },
  {
    id: "fourth-street",
    label: "4th Street",
    theme: {
      section:
        "bg-[radial-gradient(circle_at_10%_0%,rgba(132,204,22,0.09),transparent_32%),radial-gradient(circle_at_92%_92%,rgba(180,83,9,0.11),transparent_34%),linear-gradient(145deg,rgba(22,24,12,0.96),rgba(4,7,14,0.98))]",
      header:
        "text-lime-100/65",
      headerIcon:
        "text-lime-100/70",
      topLine:
        "from-transparent via-lime-100/26 to-transparent",
      card:
        "border-lime-100/14 bg-[radial-gradient(circle_at_78%_15%,rgba(132,204,22,0.09),transparent_31%),linear-gradient(145deg,#20200d,#070a12_72%)]",
      cardHover:
        "hover:border-lime-100/30",
      awning:
        "bg-[repeating-linear-gradient(90deg,#4a4720_0_44px,#98703f_44px_88px)] shadow-[0_10px_24px_rgba(113,93,35,0.2)]",
      badge:
        "border-lime-100/16 bg-lime-300/[0.055] text-lime-100/80",
      eyebrow:
        "text-lime-100/50",
      title:
        "market-display-gold",
      action:
        "text-lime-100",
      dividerLine:
        "from-transparent via-amber-100/30 to-transparent",
      dividerEyebrow:
        "text-amber-100/55",
      dividerAccent:
        "text-[#d0aa5c]",
    },
  },
];

function StreetAwning({
  street,
  slot,
}: {
  street: StreetDefinition;
  slot: number;
}) {
  const { theme } = street;

  return (
    <Link
      href="#open-shop"
      className={`group relative flex min-h-[22rem] flex-col overflow-hidden rounded-[1.7rem] border p-5 transition hover:-translate-y-1 ${theme.card} ${theme.cardHover}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-5 opacity-85 ${theme.awning}`}
      />

      <div className="relative mt-5 flex items-center justify-between gap-3">
        <span
          className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${theme.badge}`}
        >
          Empty awning
        </span>

        <Plus
          className={`h-5 w-5 transition group-hover:rotate-90 ${theme.headerIcon}`}
        />
      </div>

      <div className="relative mt-auto">
        <div
          className={`text-[10px] font-bold uppercase tracking-[0.26em] ${theme.eyebrow}`}
        >
          Awning 0{slot}
        </div>

        <h3
          className={`market-display-title ${theme.title} mt-2 min-h-[5rem] font-serif text-[2rem] font-medium leading-[1.05] tracking-[-0.035em]`}
        >
          Your craft belongs here.
        </h3>

        <p className="min-h-[3.25rem] text-sm leading-6 text-slate-400">
          A new place for the next merchant, service, craft, or idea inside the
          AoE2WAR marketplace.
        </p>

        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
            Your idea
          </span>

          <span
            className={`inline-flex items-center gap-2 text-sm font-bold ${theme.action}`}
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
}: {
  street: StreetDefinition;
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
        {[1, 2, 3].map((slot) => (
          <StreetAwning
            key={slot}
            street={street}
            slot={slot}
          />
        ))}
      </div>
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
          final
            ? "text-amber-100/70"
            : theme.headerIcon
        }`}
      />

      <p
        className={`mt-4 text-[10px] font-bold uppercase tracking-[0.32em] ${
          final
            ? "text-amber-100/55"
            : theme.dividerEyebrow
        }`}
      >
        {final
          ? "Four streets of a larger world"
          : `${street.label} continues the marketplace`}
      </p>

      <h2 className="mx-auto mt-3 max-w-3xl text-balance font-serif text-3xl font-normal leading-[1.08] tracking-[-0.03em] text-[#c9c2b4] sm:text-4xl">
        {final ? (
          <>
            Four streets. Still room to build.{" "}
            <span className="text-[#d0aa5c]">
              What can you bring?
            </span>
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

export default function MarketplaceExpansionStreets() {
  const secondStreet = STREETS[0];
  const thirdStreet = STREETS[1];
  const fourthStreet = STREETS[2];

  return (
    <>
      <MarketplaceStreet
        street={secondStreet}
      />

      <StreetDivider
        street={secondStreet}
        nextStreet={thirdStreet}
      />

      <MarketplaceStreet
        street={thirdStreet}
      />

      <StreetDivider
        street={thirdStreet}
        nextStreet={fourthStreet}
      />

      <MarketplaceStreet
        street={fourthStreet}
      />

      <StreetDivider
        street={fourthStreet}
        final
      />
    </>
  );
}
