import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Circle, Crown, History, Radio, Shield, Swords } from "lucide-react";

import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { loadChaosium } from "@/lib/champions/chaosium";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chaosium",
  description:
    "AoE2WAR championship belt lineage: current holders, previous reigns, transfer dates, and each belt's road from vacancy into history.",
};

function dateLabel(value: string | null) {
  if (!value) return "Date pending";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function ChaosiumPage() {
  const belts = await loadChaosium(getPrisma());

  return (
    <main className="mx-auto w-full max-w-[106rem] space-y-8 overflow-x-hidden px-3 py-4 text-white sm:px-5 sm:py-6">
      <SpeedReadyMarker route="/chaosium" />

      <section className="relative overflow-hidden rounded-[2.6rem] border border-violet-200/14 bg-[radial-gradient(circle_at_50%_-10%,rgba(139,92,246,0.22),transparent_36%),radial-gradient(circle_at_12%_25%,rgba(251,191,36,0.12),transparent_22%),linear-gradient(145deg,#080d19,#080612_55%,#130711)] px-6 py-10 shadow-[0_48px_160px_rgba(0,0,0,0.52)] sm:px-8 lg:px-10">
        <div className="max-w-4xl">
          <div className="flex items-center gap-2 text-violet-100/70">
            <History className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.38em]">
              The lineage chamber
            </span>
          </div>
          <h1 className="mt-4 font-serif text-6xl font-semibold tracking-[-0.055em] sm:text-7xl">
            CHAOSIUM
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">
            Belts remember. The current holder burns brightest at the top; every former
            champion remains below in the road that brought the title here. The final mark
            is where the belt entered the Kingdom.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          <span className="rounded-full border border-emerald-200/16 bg-emerald-300/7 px-3 py-1.5">
            Live holder beacon
          </span>
          <span className="rounded-full border border-white/9 bg-white/[0.025] px-3 py-1.5">
            Previous reigns preserved
          </span>
          <span className="rounded-full border border-white/9 bg-white/[0.025] px-3 py-1.5">
            Trophy events are authority
          </span>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
        {belts.map((belt) => (
          <article
            key={belt.id}
            className="relative overflow-hidden rounded-[2.1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(3,7,18,0.99))] shadow-[0_28px_100px_rgba(0,0,0,0.34)]"
          >
            <div className="relative min-h-[30rem] overflow-hidden border-b border-white/8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(251,191,36,0.12),transparent_40%)]" />

              {belt.currentHolderAvatarUrl ? (
                <Image
                  src={belt.currentHolderAvatarUrl}
                  alt=""
                  fill
                  priority
                  unoptimized
                  sizes="(min-width:1536px) 25vw, (min-width:768px) 50vw, 94vw"
                  className="object-cover object-top opacity-96"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Crown className="h-24 w-24 text-slate-700" />
                </div>
              )}

              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_32%,rgba(3,7,18,0.22)_55%,#030712_100%)]" />

              <div className="absolute left-4 top-4 z-20">
                <Link
                  href={belt.routeHref}
                  className="relative block h-20 w-32 overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-2 transition hover:border-amber-200/30"
                  aria-label={`Open ${belt.displayName}`}
                >
                  <Image
                    src={belt.assetUrl}
                    alt=""
                    fill
                    unoptimized
                    sizes="128px"
                    className="object-contain p-2 drop-shadow-[0_8px_14px_rgba(0,0,0,0.65)]"
                  />
                </Link>
              </div>

              {belt.currentHolder ? (
                <div className="absolute right-5 top-5 z-20 flex items-center gap-2 rounded-full border border-emerald-200/25 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-200" />
                  </span>
                  Current
                </div>
              ) : (
                <div className="absolute right-5 top-5 z-20 rounded-full border border-slate-400/18 bg-slate-700/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Vacant
                </div>
              )}

              <div className="absolute bottom-5 left-5 right-5 z-20">
                <div className="text-[10px] font-black uppercase tracking-[0.26em] text-amber-100/65">
                  {belt.displayName}
                </div>
                {belt.currentHolderHref ? (
                  <Link
                    href={belt.currentHolderHref}
                    className="mt-1 block font-serif text-4xl font-semibold tracking-[-0.035em] text-white transition hover:text-amber-100"
                  >
                    {belt.currentHolder}
                  </Link>
                ) : (
                  <div className="mt-1 font-serif text-4xl font-semibold tracking-[-0.035em] text-white">
                    {belt.currentHolder || "Vacant"}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/8 bg-black/36 px-3 py-2 backdrop-blur-sm">
                    <div className="text-[8px] uppercase tracking-[0.18em] text-slate-500">Battles</div>
                    <div className="mt-1 font-semibold">{belt.totalMatches ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/36 px-3 py-2 backdrop-blur-sm">
                    <div className="text-[8px] uppercase tracking-[0.18em] text-slate-500">Record</div>
                    <div className="mt-1 font-semibold">{belt.currentRecord ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/36 px-3 py-2 backdrop-blur-sm">
                    <div className="text-[8px] uppercase tracking-[0.18em] text-slate-500">Rating</div>
                    <div className="mt-1 whitespace-nowrap font-semibold">
                      {belt.rating != null ? `${belt.rating} ${belt.ratingLabel ?? ""}` : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-600">
                    Belt road
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-300">
                    Newest reign to origin
                  </div>
                </div>
                <Radio className="h-4 w-4 text-violet-200/45" />
              </div>

              <div className="relative mt-5">
                <div className="absolute bottom-4 left-[1.18rem] top-4 w-px bg-[linear-gradient(180deg,rgba(110,231,183,0.45),rgba(148,163,184,0.16),rgba(148,163,184,0.06))]" />

                <div className="space-y-4">
                  {belt.lineage.length ? belt.lineage.map((entry) => (
                    <div
                      key={entry.key}
                      className={`relative grid grid-cols-[2.4rem_minmax(0,1fr)] gap-3 ${
                        entry.current
                          ? ""
                          : entry.kind === "origin"
                            ? "opacity-45"
                            : "opacity-58"
                      }`}
                    >
                      <div className="relative z-10 flex h-9 w-9 items-center justify-center">
                        {entry.current ? (
                          <span className="relative flex h-4 w-4">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-50" />
                            <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-emerald-100 bg-emerald-400" />
                          </span>
                        ) : entry.kind === "origin" ? (
                          <Circle className="h-3.5 w-3.5 fill-slate-700 text-slate-500" />
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-500 bg-slate-800" />
                        )}
                      </div>

                      <div className={`rounded-[1rem] border px-3 py-3 ${
                        entry.current
                          ? "border-emerald-200/16 bg-emerald-300/[0.045]"
                          : "border-white/7 bg-white/[0.018]"
                      }`}>
                        <div className="flex items-start gap-3">
                          {entry.avatarUrl && entry.kind === "holder" ? (
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                              <Image
                                src={entry.avatarUrl}
                                alt=""
                                fill
                                unoptimized
                                sizes="48px"
                                className="object-cover object-top"
                              />
                            </div>
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-black/20">
                              {entry.kind === "origin" ? (
                                <Shield className="h-5 w-5 text-slate-600" />
                              ) : (
                                <Swords className="h-5 w-5 text-slate-500" />
                              )}
                            </div>
                          )}

                          <div className="min-w-0">
                            {entry.href ? (
                              <Link href={entry.href} className="font-semibold text-white hover:text-amber-100">
                                {entry.name}
                              </Link>
                            ) : (
                              <div className="font-semibold text-slate-300">{entry.name}</div>
                            )}
                            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                              {entry.eventType}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              {dateLabel(entry.at)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed border-white/8 px-4 py-5 text-sm text-slate-500">
                      The title exists, but no lineage events are available yet.
                    </div>
                  )}
                </div>
              </div>

              <Link
                href={belt.routeHref}
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-amber-100/80 transition hover:text-amber-50"
              >
                Open championship
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
