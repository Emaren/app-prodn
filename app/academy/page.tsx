export const metadata = {
  title: "Academy — AoE2WAR",
};

export default function AcademyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <section className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200/80">AOE2WAR ACADEMY</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Academy</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
          Lessons, build orders, replay study, and training paths for players who want to sharpen their game.
        </p>
      </section>
    </main>
  );
}
