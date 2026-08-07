import PageHeroRotator from "@/components/page-heroes/PageHeroRotator";
import PageHeroViewToggle from "@/components/page-heroes/PageHeroViewToggle";
import type { PageHeroChain, PageHeroView } from "@/lib/pageHeroes";

export default function GameStatsHero({
  view,
  chain,
  metrics,
}: {
  view: PageHeroView;
  chain: PageHeroChain;
  metrics: Array<{ label: string; value: string }>;
}) {
  const visibleMetrics = view === "basic" ? metrics.slice(0, 3) : metrics;
  const minHeight =
    view === "basic"
      ? "min-h-[33rem]"
      : view === "advanced"
        ? "min-h-[38rem]"
        : "min-h-[42rem]";

  return (
    <section
      className={`game-stats-managed-hero relative isolate overflow-hidden rounded-[2.25rem] border border-cyan-100/14 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.14),transparent_31%),radial-gradient(circle_at_88%_14%,rgba(251,191,36,0.14),transparent_29%),linear-gradient(145deg,#071522,#05070d_62%)] shadow-[0_38px_120px_rgba(0,0,0,0.42)] ${minHeight}`}
    >
      <PageHeroRotator chain={chain} />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,7,16,0.94)_0%,rgba(2,7,16,0.79)_31%,rgba(2,7,16,0.42)_61%,rgba(2,7,16,0.18)_100%),linear-gradient(180deg,rgba(2,7,16,0.08),rgba(2,7,16,0.18)_50%,rgba(2,7,16,0.96)_100%)]" />
      <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/50 to-transparent" />
      <div className="pointer-events-none absolute -right-20 top-6 h-64 w-64 rounded-full bg-amber-300/8 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 top-20 h-64 w-64 rounded-full bg-cyan-300/8 blur-3xl" />

      <div className="absolute right-5 top-5 z-30 sm:right-7 sm:top-7">
        <PageHeroViewToggle view={view} basePath="/game-stats" />
      </div>

      <div className="relative z-20 flex min-h-[inherit] flex-col px-6 pb-6 pt-7 sm:px-9 sm:pb-9 sm:pt-9 lg:px-11">
        <div className="max-w-[calc(100%-7rem)]">
          <div className="text-[10px] font-black uppercase tracking-[0.42em] text-cyan-100/72">
            Public Parser Observatory
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-cyan-100/16 bg-black/38 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-50/82 backdrop-blur-lg">
              {view === "basic" ? "Slim B" : view === "advanced" ? "Wide A" : "Extreme E"}
            </span>
            <span className="rounded-full border border-amber-100/16 bg-black/38 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-amber-50/82 backdrop-blur-lg">
              Archive ≠ battle ≠ identity
            </span>
          </div>
        </div>

        <div className="mt-auto max-w-5xl pt-24">
          <h1
            className={`font-serif font-normal leading-[0.94] tracking-[-0.048em] text-white drop-shadow-[0_6px_28px_rgba(0,0,0,0.82)] ${
              view === "basic"
                ? "text-5xl sm:text-6xl"
                : view === "advanced"
                  ? "text-6xl sm:text-7xl"
                  : "text-6xl sm:text-7xl lg:text-[5.7rem]"
            }`}
          >
            Recovering the lost war record.
          </h1>

          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-200/88 sm:text-[15px]">
            One archive. Several counting grains. The Observatory separates battle truth,
            physical-file truth, and player-identity truth instead of manufacturing certainty.
          </p>

          <div
            className={`mt-7 grid gap-3 ${
              view === "basic"
                ? "sm:grid-cols-3"
                : view === "advanced"
                  ? "sm:grid-cols-2 xl:grid-cols-3"
                  : "sm:grid-cols-2 xl:grid-cols-6"
            }`}
          >
            {visibleMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[1rem] border border-white/10 bg-slate-950/58 px-4 py-3 backdrop-blur-xl"
              >
                <div className="text-[9px] font-bold uppercase tracking-[0.19em] text-slate-400">
                  {metric.label}
                </div>
                <div className="mt-1 font-serif text-xl font-semibold text-white">
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
