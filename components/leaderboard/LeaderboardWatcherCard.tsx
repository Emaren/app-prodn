import Image from "next/image";
import Link from "next/link";

export function LeaderboardWatcherCard({
  compact = false,
  bare = false,
}: {
  compact?: boolean;
  bare?: boolean;
}) {
  return (
    <aside
      className={
        bare
          ? "group/watcher relative inline-flex max-w-full rounded-2xl px-1.5 py-1 transition-[background-color,filter] duration-200 hover:bg-white/[0.025] hover:brightness-110"
          : `relative overflow-hidden border border-amber-200/24 bg-[radial-gradient(circle_at_18%_0%,rgba(251,191,36,0.11),transparent_42%),linear-gradient(145deg,rgba(8,17,29,0.96),rgba(3,8,15,0.98))] shadow-[0_22px_60px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.055)] ${
              compact
                ? "rounded-[1.2rem] px-4 py-3"
                : "rounded-[1.35rem] px-5 py-4"
            }`
      }
    >
      {!bare ? (
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/60 to-transparent" />
      ) : null}

      <div
        className={`flex items-center ${
          bare
            ? "gap-3"
            : "gap-4"
        }`}
      >
        <div
          className={`relative shrink-0 ${
            bare
              ? "h-10 w-10 lg:h-11 lg:w-11"
              : compact
                ? "h-16 w-16"
                : "h-24 w-24"
          }`}
        >
          <Image
            src="/watcher/aoe2hd-watcher-logo.webp"
            alt="AoE2HD Watcher"
            fill
            sizes={
              bare
                ? "44px"
                : compact
                  ? "64px"
                  : "96px"
            }
            className="object-contain drop-shadow-[0_10px_26px_rgba(0,0,0,0.42)]"
          />
        </div>

        <div
          className={`min-w-0 ${
            bare
              ? "border-l border-cyan-200/12 pl-3.5"
              : "border-l border-amber-100/14 pl-4"
          }`}
        >
          <div
            className={`flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.25em] ${
              bare
                ? "text-slate-500"
                : "text-amber-200/75"
            }`}
          >
            {bare ? (
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/80 shadow-[0_0_10px_rgba(103,232,249,0.55)]" />
            ) : null}

            AoE2WAR Watcher
          </div>

          <Link
            href="/download"
            className={`inline-flex cursor-pointer font-semibold text-cyan-200 transition hover:text-white ${
              bare
                ? "mt-1 text-[11px] text-cyan-200/85 no-underline hover:text-white"
                : "mt-3 text-xs underline decoration-cyan-300/30 underline-offset-4"
            }`}
          >
            Run the Watcher for fresher ranks →
          </Link>
        </div>
      </div>
    </aside>
  );
}
