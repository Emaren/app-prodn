"use client";

import Link from "next/link";
import {
  CalendarDays,
  Crown,
  Flame,
  Play,
  Radio,
  Swords,
  Trophy,
  Wallet,
} from "lucide-react";

const ASSETS = {
  belt: {
    src: "/uploads/managed-assets/wolomania/aoe2war_champ.png",
    fallback: "/uploads/managed-assets/belt/world-1781561316794-0a26a86e.png",
  },
  emaren: {
    src: "/uploads/managed-assets/wolomania/emaren_warrior_2.png",
    fallback: "/uploads/managed-assets/avatar/emaren-1781569822986-d51b50eb.png",
  },
  jim: {
    src: "/uploads/managed-assets/wolomania/jim_warrior.png",
    fallback: "/uploads/managed-assets/avatar/jim-1781560436622-52fb61a1.png",
  },
  julio: {
    src: "/uploads/managed-assets/wolomania/julio_warrior.png",
    fallback: "/uploads/managed-assets/avatar/julio-alvarez-1781569866259-256b2ad7.png",
  },
};

type Asset = {
  src: string;
  fallback: string;
};

function PromoImage({
  asset,
  alt,
  className,
}: {
  asset: Asset;
  alt: string;
  className: string;
}) {
  return (
    <img
      src={asset.src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(event) => {
        const image = event.currentTarget;
        if (image.dataset.fallbackUsed === "1") {
          image.style.display = "none";
          return;
        }
        image.dataset.fallbackUsed = "1";
        image.src = asset.fallback;
      }}
    />
  );
}

const facts = [
  ["July 10, 2026", CalendarDays],
  ["8:00 PM UTC", Radio],
  ["Best of 7", Swords],
  ["100,000 WOLO", Trophy],
] as const;

export function WolomaniaPromoTile() {
  return (
    <section className="relative overflow-hidden rounded-[2.35rem] border border-amber-200/18 bg-black shadow-[0_38px_130px_rgba(0,0,0,0.52)]">
      <Link
        href="/wolomania"
        aria-label="Open Wolomania I"
        className="group relative block overflow-hidden rounded-[2.35rem] bg-[radial-gradient(circle_at_50%_8%,rgba(251,191,36,0.24),transparent_28%),radial-gradient(circle_at_5%_45%,rgba(127,29,29,0.48),transparent_38%),radial-gradient(circle_at_95%_45%,rgba(30,64,175,0.35),transparent_38%),linear-gradient(160deg,#150704_0%,#05070d_52%,#071225_100%)] p-5 pb-6 sm:hidden"
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:34px_34px]" />

        <div className="relative z-10">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/28 bg-black/62 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-amber-100 backdrop-blur">
              <Flame className="h-3.5 w-3.5 text-amber-300" />
              July 10 · First Chapter
            </span>
          </div>

          <div className="mt-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/48 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-200">
              <Crown className="h-3.5 w-3.5" />
              World Championship Event
            </div>
            <h2 className="mt-4 font-serif text-[clamp(3.4rem,16vw,4.8rem)] font-black uppercase leading-[0.78] tracking-[-0.045em] text-amber-100 drop-shadow-[0_7px_0_rgba(0,0,0,0.72)]">
              Wolomania I
            </h2>
          </div>

          <div className="relative mt-5 h-[19rem] overflow-hidden rounded-[1.6rem] border border-amber-200/14 bg-black/18">
            <PromoImage
              asset={ASSETS.jim}
              alt="Jim"
              className="absolute -bottom-4 -left-10 h-[94%] w-[70%] object-contain object-bottom drop-shadow-[0_24px_50px_rgba(0,0,0,0.85)] [mask-image:linear-gradient(to_bottom,black_0%,black_82%,transparent_100%)]"
            />
            <PromoImage
              asset={ASSETS.julio}
              alt="Julio Alvarez"
              className="absolute -bottom-4 -right-10 h-[94%] w-[70%] object-contain object-bottom drop-shadow-[0_24px_50px_rgba(0,0,0,0.85)] [mask-image:linear-gradient(to_bottom,black_0%,black_82%,transparent_100%)]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/65 to-transparent" />
            <PromoImage
              asset={ASSETS.belt}
              alt="AoE2WAR championship belt"
              className="absolute left-1/2 top-[57%] z-20 h-32 w-[92%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_24px_55px_rgba(0,0,0,0.9)] transition duration-500 group-hover:scale-[1.025]"
            />
            <div className="absolute inset-x-4 bottom-4 z-30 grid grid-cols-2 gap-5 text-center">
              <div>
                <div className="text-xl font-black uppercase text-white">Jim</div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-300">
                  🇺🇸 United States
                </div>
              </div>
              <div>
                <div className="text-xl font-black uppercase text-white">Julio</div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-300">
                  🇲🇽 Mexico
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {facts.map(([label, Icon]) => (
              <span
                key={label}
                className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-amber-200/14 bg-white/[0.045] px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.1em] text-stone-100"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                {label}
              </span>
            ))}
          </div>

          <span className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-200 to-amber-500 px-5 py-3.5 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[0_18px_55px_rgba(251,191,36,0.25)]">
            Enter Wolomania <Play className="h-4 w-4 fill-black" />
          </span>
        </div>
      </Link>

      <Link
        href="/wolomania"
        aria-label="Open Wolomania I"
        className="group relative hidden min-h-[48rem] overflow-hidden rounded-[2.35rem] bg-[radial-gradient(circle_at_50%_10%,rgba(251,191,36,0.25),transparent_30%),radial-gradient(circle_at_8%_48%,rgba(127,29,29,0.44),transparent_34%),radial-gradient(circle_at_92%_48%,rgba(30,64,175,0.30),transparent_34%),linear-gradient(135deg,#120704_0%,#05070d_48%,#071225_100%)] sm:block xl:min-h-[51rem]"
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.10] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(120,20,20,0.30),transparent_25%,transparent_75%,rgba(20,55,150,0.28)),linear-gradient(180deg,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0.24)_52%,rgba(0,0,0,0.97)_100%)]" />

        <div className="absolute left-5 top-5 z-50 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/24 bg-black/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-amber-100 backdrop-blur">
            <Flame className="h-3.5 w-3.5 text-amber-300" />
            July 10 · First Chapter
          </span>
          <span className="hidden items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100 backdrop-blur sm:inline-flex">
            <Wallet className="h-3.5 w-3.5" />
            On-chain payout
          </span>
        </div>

        <div className="absolute right-5 top-5 z-50 hidden rounded-full border border-amber-200/20 bg-amber-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100 backdrop-blur md:inline-flex">
          Featured Event
        </div>

        <div className="absolute inset-x-4 top-14 z-40 text-center sm:top-16">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/62 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-amber-200">
            <Crown className="h-3.5 w-3.5" />
            The World Championship Event
          </div>

          <h2 className="mx-auto w-full text-center font-serif text-[clamp(4.1rem,9.2vw,10rem)] font-black uppercase leading-[0.78] tracking-[-0.045em] text-amber-100 drop-shadow-[0_8px_0_rgba(0,0,0,0.72)]">
            WOLOMANIA I
          </h2>
        </div>

        <PromoImage
          asset={ASSETS.jim}
          alt="Jim"
          className="absolute bottom-[1.5rem] left-[5%] z-30 h-[64%] w-[33%] object-contain object-bottom opacity-98 drop-shadow-[0_24px_60px_rgba(0,0,0,0.82)] [mask-image:linear-gradient(to_bottom,black_0%,black_80%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_80%,transparent_100%)] sm:h-[68%]"
        />

        <PromoImage
          asset={ASSETS.julio}
          alt="Julio Alvarez"
          className="absolute bottom-[1.5rem] right-[5%] z-30 h-[65%] w-[34%] object-contain object-bottom opacity-98 drop-shadow-[0_24px_60px_rgba(0,0,0,0.82)] [mask-image:linear-gradient(to_bottom,black_0%,black_80%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_80%,transparent_100%)] sm:h-[69%]"
        />

        <PromoImage
          asset={ASSETS.emaren}
          alt="Emaren"
          className="absolute bottom-[15.35rem] left-[39%] z-[24] h-[38%] w-[17%] -translate-x-1/2 -rotate-2 object-contain object-bottom opacity-76 drop-shadow-[0_24px_70px_rgba(0,0,0,0.95)] [mask-image:linear-gradient(to_bottom,black_0%,black_50%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_50%,transparent_100%)]"
        />

        <div className="pointer-events-none absolute left-[39%] top-[47.6%] z-[80] -translate-x-1/2 text-center">
          <div className="relative isolate inline-block text-[10px] font-black uppercase tracking-[0.32em] text-amber-300 [text-shadow:0_2px_10px_rgba(0,0,0,0.98),0_0_20px_rgba(0,0,0,0.72),0_0_10px_rgba(251,191,36,0.30)] before:pointer-events-none before:absolute before:inset-[-0.16em_-0.36em] before:-z-10 before:rounded-[0.45rem] before:bg-black/42 before:blur-[7px] before:content-[''] drop-shadow-[0_0_14px_rgba(251,191,36,0.42)]">
            THE COMMISSIONER
          </div>
        </div>

        <div className="pointer-events-none absolute left-[39%] top-[56.8%] z-[28] h-[20rem] w-[25rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.70)_0%,rgba(0,0,0,0.48)_34%,rgba(0,0,0,0.24)_66%,transparent_100%)] blur-md" />

        
        <div
          data-wolo-layer="emaren-belt-veil"
          className="pointer-events-none absolute left-[42%] top-[61.2%] z-[50] h-[19rem] w-[31rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.66)_34%,rgba(0,0,0,0.30)_66%,transparent_100%)] blur-xl"
        />

        <PromoImage
          asset={ASSETS.belt}
          alt="AoE2WAR championship belt"
          className="absolute left-1/2 top-[63.9%] z-[52] h-56 w-[42rem] max-w-[72%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-97 drop-shadow-[0_34px_90px_rgba(0,0,0,0.88)] transition duration-700 group-hover:scale-[1.02] sm:h-64 xl:h-72"
        />

        <div className="pointer-events-none absolute left-1/2 top-[84.4%] z-[70] -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="rounded-full border border-amber-200/38 bg-black/82 px-4 py-1.5 shadow-[0_12px_34px_rgba(0,0,0,0.58)] backdrop-blur">
            <span className="font-serif text-[1.85rem] font-black leading-none text-amber-100 drop-shadow-[0_0_18px_rgba(251,191,36,0.36)]">
              VS
            </span>
          </div>
        </div>

        <div className="absolute bottom-[8.1rem] left-[5%] z-50 w-[33%] text-center">
          <div className="text-3xl font-black uppercase tracking-[0.04em] text-white drop-shadow-[0_4px_22px_rgba(0,0,0,0.85)]">
            Jim
          </div>
          <div className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-stone-200 drop-shadow-[0_3px_18px_rgba(0,0,0,0.85)]">
            🇺🇸 United States
          </div>
        </div>

        <div className="absolute bottom-[8.1rem] right-[5%] z-50 w-[34%] text-center">
          <div className="text-3xl font-black uppercase tracking-[0.04em] text-white drop-shadow-[0_4px_22px_rgba(0,0,0,0.85)]">
            Julio Alvarez
          </div>
          <div className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-stone-200 drop-shadow-[0_3px_18px_rgba(0,0,0,0.85)]">
            🇲🇽 Mexico
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-[5.8rem] z-[35] h-[9rem] bg-gradient-to-t from-black via-black/72 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black via-black/88 to-transparent px-5 pb-5 pt-28">
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {facts.map(([label, Icon]) => (
                <span
                  key={label}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200/16 bg-white/[0.045] px-3 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-stone-100"
                >
                  <Icon className="h-4 w-4 text-amber-300" />
                  {label}
                </span>
              ))}
            </div>

            <span className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-200 to-amber-500 px-7 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_55px_rgba(251,191,36,0.25)] transition group-hover:scale-[1.02]">
              Enter Wolomania <Play className="h-4 w-4 fill-black" />
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
            <span>Recorded forever on AoE2WAR</span>
            <span className="hidden h-1 w-1 rounded-full bg-amber-300/50 sm:block" />
            <span>Verifiable · Immutable · On-chain</span>
          </div>
        </div>
      </Link>
    </section>
  );
}
