export const metadata = {
  title: "Clans — AoE2WAR",
};

export default function ClansPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <section className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200/80">AOE2WAR CLANS</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Clans</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
          Clan halls, teams, banners, rival houses, and the social layer around AoE2WAR battles.
        </p>
      </section>
    </main>
  );
}
