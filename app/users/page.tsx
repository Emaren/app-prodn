import Link from "next/link";

import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OnlineUsersPage() {
  const prisma = getPrisma();
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      inGameName: { not: null },
      lastSeen: { gt: twoMinutesAgo },
    },
    orderBy: { lastSeen: "desc" },
    take: 100,
    select: {
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      verified: true,
      verificationLevel: true,
      lastSeen: true,
    },
  });

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.15),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-emerald-200/70">Player Directory</div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">Online Warriors</h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              Public-facing profiles for players who have been active in the last two minutes.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
          >
            Back To Lobby
          </Link>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Roster</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Active Player Profiles</h2>
          </div>
          <div className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
            {users.length} active
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {users.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
              No live presence yet. As signed-in players browse the site, they will appear here.
            </div>
          ) : (
            users.map((user) => (
              <Link
                key={user.uid}
                href={`/players/${user.uid}`}
                className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-emerald-300/30 hover:bg-white/10"
              >
                <div>
                  <div className="font-medium text-white">
                    {user.inGameName || user.steamPersonaName || user.uid}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                    {user.verified
                      ? `Replay verified · level ${user.verificationLevel}`
                      : `Steam linked · level ${user.verificationLevel}`}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`rounded-full px-3 py-1 text-xs ${
                      user.verified ? "bg-emerald-500/15 text-emerald-200" : "bg-white/8 text-slate-300"
                    }`}
                  >
                    {user.verified ? "Trusted" : "New"}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    {user.lastSeen ? user.lastSeen.toLocaleTimeString() : ""}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
