import Image from "next/image";
import Link from "next/link";

export function LeaderboardWatcherCard({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <aside
      className={`relative overflow-hidden border border-amber-200/24 bg-[radial-gradient(circle_at_18%_0%,rgba(251,191,36,0.11),transparent_42%),linear-gradient(145deg,rgba(8,17,29,0.96),rgba(3,8,15,0.98))] shadow-[0_22px_60px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.055)] ${
        compact
          ? "rounded-[1.2rem] px-4 py-3"
          : "rounded-[1.35rem] px-5 py-4"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/60 to-transparent" />

      <div className="flex items-center gap-4">
        <div
          className={`relative shrink-0 ${
            compact ? "h-16 w-16" : "h-24 w-24"
          }`}
        >
          <Image
            src="/watcher/aoe2hd-watcher-logo.webp"
            alt="AoE2HD Watcher"
            fill
            sizes={compact ? "64px" : "96px"}
            className="object-contain drop-shadow-[0_10px_26px_rgba(0,0,0,0.42)]"
          />
        </div>

        <div className="min-w-0 border-l border-amber-100/14 pl-4">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/80">
            AoE2WAR Watcher
          </div>
          <Link
            href="/watch"
            className="mt-3 inline-flex cursor-pointer text-xs font-semibold text-cyan-200 underline decoration-cyan-300/30 underline-offset-4 transition hover:text-white"
          >
            Run the Watcher for fresher ranks →
          </Link>
        </div>
      </div>
    </aside>
  );
}
