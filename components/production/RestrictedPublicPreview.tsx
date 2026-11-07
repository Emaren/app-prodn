import Link from "next/link";

/** Truthful read-only degraded public view, never a substitute for finance. */
export default function RestrictedPublicPreview({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 text-white">
      <section
        role="status"
        aria-live="polite"
        data-public-read-model="unavailable"
        className="rounded-[2rem] border border-amber-200/25 bg-slate-950/80 px-6 py-12 shadow-2xl sm:px-10"
      >
        <div className="text-xs font-bold uppercase tracking-[0.24em] text-amber-200/80">
          AoE2WAR · Read-only preview
        </div>
        <h1 className="mt-5 font-serif text-4xl font-semibold sm:text-6xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300">{description}</p>
        <p className="mt-4 text-sm leading-7 text-slate-400">
          Detailed public records are temporarily unavailable while the restricted
          read model is being qualified. No wagers, wallets, or settlement operations
          can be initiated from this preview.
        </p>
        <nav aria-label="Other public districts" className="mt-8 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/players" className="rounded-full border border-white/20 px-5 py-3 hover:border-amber-200/60">Players</Link>
          <Link href="/champions" className="rounded-full border border-white/20 px-5 py-3 hover:border-amber-200/60">Champions</Link>
          <Link href="/game-stats" className="rounded-full border border-white/20 px-5 py-3 hover:border-amber-200/60">Game Stats</Link>
        </nav>
      </section>
    </main>
  );
}
