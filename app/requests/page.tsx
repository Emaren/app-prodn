import Link from "next/link";

import RequestsBoard from "@/components/requests/RequestsBoard";
import {
  ABOUT_PILLARS,
  ABOUT_SIGNALS,
  ABOUT_SURFACES,
  ROADMAP_LAST_UPDATED_AT,
  ROADMAP_MODULES,
  ROADMAP_UPDATES,
} from "@/lib/siteRoadmapContent";

export const dynamic = "force-dynamic";

export default function RequestsPage() {
  return (
    <main className="space-y-6 py-2 text-white sm:space-y-8 sm:py-3">
      <section id="requests" className="space-y-4 sm:space-y-6">
        <RequestsBoard />
      </section>

      <section id="updates" className="space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.36em] text-emerald-200/70">Updates</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">What just moved.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Requests lead the page now. The rest of the utility deck lives underneath: updates,
            product stance, then roadmap pressure.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {ROADMAP_UPDATES.map((update, index) => (
            <section
              key={update.title}
              className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6"
            >
              <div className="text-[11px] uppercase tracking-[0.28em] text-white/45">
                Update {String(index + 1).padStart(2, "0")}
              </div>
              <h3 className="mt-3 text-2xl font-semibold text-white">{update.title}</h3>
              <p className="mt-4 text-sm leading-6 text-slate-300">{update.detail}</p>
              <div className="mt-4 text-xs text-slate-500">Updated {ROADMAP_LAST_UPDATED_AT}</div>
            </section>
          ))}
        </div>
      </section>

      <section id="about" className="space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.36em] text-sky-200/70">About</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">What this product is trying to be.</h2>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_28%),linear-gradient(135deg,_#0f172a,_#111827_56%,_#020617)] p-6 shadow-[0_30px_90px_rgba(2,6,23,0.35)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {ABOUT_PILLARS.map((pillar) => (
                  <span
                    key={pillar}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200"
                  >
                    {pillar}
                  </span>
                ))}
              </div>

              <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                AoE2HDBets is trying to make the important part obvious: who matters, what happened,
                why the rivalry matters, and where the real proof lives.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {ABOUT_SIGNALS.map((signal) => (
                <MiniStat key={signal.label} label={signal.label} value={signal.value} />
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {ABOUT_SURFACES.map((surface) => (
              <Link
                key={surface.href}
                href={surface.href}
                className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
              >
                <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">Surface</div>
                <div className="mt-3 text-3xl font-semibold text-white">{surface.title}</div>
                <div className="mt-3 text-sm leading-6 text-slate-300">{surface.note}</div>
              </Link>
            ))}
          </div>
        </section>
      </section>

      <section id="roadmap" className="space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.36em] text-amber-200/70">Roadmap</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">Where the pressure goes next.</h2>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.14),_transparent_26%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-5">
              <div className="text-sm uppercase tracking-[0.4em] text-emerald-200/70">Roadmap</div>
              <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                Updates first, product stance second, roadmap lanes last. The utility hub now owns
                the whole picture in one place.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/lobby"
                  className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
                >
                  Back To Lobby
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <MiniStat label="Updates" value={String(ROADMAP_UPDATES.length)} />
              <MiniStat label="Top Score" value="83 / 100" />
              <MiniStat label="Theme Pass" value="War Room next" />
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {ROADMAP_MODULES.map((module) => (
            <ModuleCard key={module.title} updatedAt={ROADMAP_LAST_UPDATED_AT} {...module} />
          ))}
        </div>
      </section>
    </main>
  );
}

function ModuleCard({
  title,
  score,
  status,
  detail,
  updatedAt,
}: {
  title: string;
  score: number;
  status: string;
  detail: string;
  updatedAt: string;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-white/45">{status}</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">{title}</h3>
          <div className="mt-2 text-xs text-slate-400">Updated {updatedAt}</div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white">
          {score} / 100
        </div>
      </div>

      <div className="mt-5 h-2 rounded-full bg-white/10">
        <div
          className="h-2 rounded-full bg-[linear-gradient(90deg,#34d399,#fbbf24)]"
          style={{ width: `${score}%` }}
        />
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-300">{detail}</p>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}
