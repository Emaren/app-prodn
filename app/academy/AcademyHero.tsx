import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Flame, Orbit, Shield, Sparkles } from "lucide-react";

const ACADEMY_HERO_TITLE_IMAGE = "/academy/the-academy-title-gold.png";

export default function AcademyHero() {
  return (
    <section
      className="relative isolate min-h-[34rem] overflow-hidden rounded-[2.2rem] border border-amber-100/16 bg-[#05070d] bg-cover shadow-[0_38px_120px_rgba(0,0,0,0.42)] sm:min-h-[40rem]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(3,7,18,0.80) 0%, rgba(3,7,18,0.56) 32%, rgba(3,7,18,0.18) 58%, rgba(3,7,18,0.02) 100%), linear-gradient(180deg, rgba(3,7,18,0.02) 0%, rgba(3,7,18,0.06) 54%, rgba(3,7,18,0.34) 100%), url('/academy/academy-gates-red.webp')",
        backgroundPosition: "center, center, 62% center",
        backgroundSize: "cover, cover, cover",
      }}
    >
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />

      <div className="relative flex min-h-[34rem] flex-col px-6 py-10 sm:min-h-[40rem] sm:px-10 lg:px-14">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/22 bg-black/24 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100 backdrop-blur-md">
            <Flame className="h-3.5 w-3.5" />
            The gate is open
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-red-100/18 bg-black/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-red-100/88 backdrop-blur-md">
            <Shield className="h-3.5 w-3.5" />
            War counsel
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-100/16 bg-black/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-100/88 backdrop-blur-md">
            <Orbit className="h-3.5 w-3.5" />
            First advisor seated
          </span>
        </div>

        <div className="mt-auto max-w-[42rem] pb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.44em] text-slate-300/64">
            AoE2WAR · The Academy
          </p>
          <div className="academy-hero-title-art relative -ml-7 mb-4 mt-7 w-[min(59rem,calc(100vw-3rem))] overflow-visible [aspect-ratio:1672/520] sm:-ml-9 lg:-ml-12">
            <Image
              src={ACADEMY_HERO_TITLE_IMAGE}
              alt=""
              fill
              priority
              sizes="(max-width: 768px) 100vw, 59rem"
              aria-hidden="true"
              className="select-none object-cover object-center opacity-[0.98] mix-blend-screen drop-shadow-[0_22px_48px_rgba(0,0,0,0.52)] [mask-image:linear-gradient(90deg,transparent_0%,black_6%,black_93%,transparent_100%)]"
            />
          </div>
          <h1 className="sr-only">The Academy</h1>

          <div className="mt-5 h-px w-56 bg-gradient-to-r from-amber-200/70 via-amber-100/18 to-transparent" />

          <p className="mt-5 max-w-[34rem] text-base font-medium leading-7 text-slate-200/88 sm:text-lg">
            Read the field. Move with intent. Raise your ELO.
          </p>

          <p className="mt-3 max-w-[37rem] text-sm leading-6 text-slate-400/82">
            Replay study, battlefield judgment, and proven advice from real players.
            A cleaner war school for players who want to improve before they wager.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#advisors"
              className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-amber-100/26 bg-[linear-gradient(135deg,rgba(92,64,18,0.28),rgba(3,7,18,0.52))] px-5 py-2.5 text-xs font-semibold text-amber-50 shadow-[0_16px_42px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-100/40 hover:bg-amber-100/[0.075]"
            >
              Meet the advisors
              <ArrowRight className="h-3.5 w-3.5 text-amber-100/75 transition group-hover:translate-x-1" />
            </Link>
            <Link
              href="/zodiac"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/12 bg-black/20 px-5 py-2.5 text-xs font-semibold text-slate-300 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-violet-100/28 hover:bg-violet-300/[0.07] hover:text-slate-100"
            >
              Train under the Zodiac
              <Sparkles className="h-3.5 w-3.5 text-violet-200/75" />
            </Link>
          </div>
        </div>

        <div className="absolute bottom-6 right-6 hidden grid-cols-3 overflow-hidden rounded-[1.1rem] border border-amber-100/13 bg-black/24 text-left shadow-[0_18px_46px_rgba(0,0,0,0.28)] backdrop-blur-md lg:grid">
          <div className="border-r border-white/8 px-4 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">
              Doctrine
            </div>
            <div className="mt-1 text-sm font-bold text-amber-50">
              Field reads
            </div>
          </div>
          <div className="border-r border-white/8 px-4 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">
              Command
            </div>
            <div className="mt-1 text-sm font-bold text-amber-50">
              Timing
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">
              Proof
            </div>
            <div className="mt-1 text-sm font-bold text-amber-50">
              Replay war
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
