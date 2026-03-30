"use client";

import {
  Activity,
  ArrowDownToLine,
  FolderSearch,
  Radar,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { getLobbyPresentationTone } from "@/components/lobby/lobbyPresentation";
import { WATCHER_RELEASE } from "@/lib/watcherRelease";

const OPTIONAL_ENV = `AOE2_API_BASE_URL=https://api-prodn.aoe2hdbets.com
# optional if uploads are protected
AOE2_UPLOAD_API_KEY=your_key_here`;

const CAPABILITY_CARDS = [
  {
    icon: Radar,
    title: "Live Match Feed",
    body: "Uploads in-progress replay snapshots while the match is still being played.",
  },
  {
    icon: ShieldCheck,
    title: "Final Replay Proof",
    body: "Sends the settled replay at the end so match results land clean.",
  },
  {
    icon: FolderSearch,
    title: "CrossOver Ready",
    body: "Built around the AoE2HD replay folder flow already being used successfully.",
  },
] as const;

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Download",
    body: "Grab the latest DMG for macOS Apple Silicon.",
  },
  {
    step: "02",
    title: "Launch",
    body: "Open the app and allow it the first time if macOS asks.",
  },
  {
    step: "03",
    title: "Play",
    body: "Leave the watcher running while you play so AoE2HDBets receives live and final replay proof.",
  },
] as const;

export default function DownloadPage() {
  const { tileThemeKey, viewMode } = useLobbyAppearance();
  const tone = getLobbyPresentationTone(tileThemeKey, viewMode);

  return (
    <div className="space-y-6 pb-8">
      <section className={`rounded-[2rem] border p-6 sm:p-8 ${tone.panelShell}`}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_22rem]">
          <div className="min-w-0">
            <div className={`text-xs uppercase tracking-[0.38em] ${tone.eyebrow}`}>Watcher</div>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              AoE2HD Watcher
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-[15px]">
              The replay companion for AoE2HDBets. Watches your SaveGame folder, sends
              live match snapshots while you play, and lands final replay proof when
              the match ends.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {WATCHER_RELEASE.featureChips.map((chip) => (
                <div
                  key={chip}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
                >
                  {chip}
                </div>
              ))}
              <div className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.statusBadge}`}>
                Unsigned for now
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={WATCHER_RELEASE.downloadHref}
                className={`inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold transition ${tone.primaryButton}`}
                download
              >
                <ArrowDownToLine className="h-4 w-4" />
                Download for Mac
              </Link>

              <Link
                href="/upload"
                className={`inline-flex items-center gap-3 rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`}
              >
                Open Replay Upload
              </Link>
            </div>

            <div className="mt-4 text-xs leading-6 text-slate-400">
              Unsigned build for now. Apple signing and notarization will return when the developer account is active.
            </div>
          </div>

          <div className={`rounded-[1.6rem] border p-5 ${tone.insetPanel}`}>
            <div className={`text-xs uppercase tracking-[0.32em] ${tone.accentText}`}>Release</div>

            <div className="mt-4 space-y-4">
              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Package</div>
                <div className="mt-2 text-sm font-semibold text-white">DMG</div>
              </div>

              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Platform</div>
                <div className="mt-2 text-sm font-semibold text-white">macOS Apple Silicon</div>
              </div>

              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Release</div>
                <div className="mt-2 text-sm font-semibold text-white">{WATCHER_RELEASE.releasedOn}</div>
              </div>

              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Status</div>
                <div className="mt-2 text-sm font-semibold text-white">{WATCHER_RELEASE.label}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {CAPABILITY_CARDS.map((card) => {
          const Icon = card.icon;

          return (
            <div key={card.title} className={`rounded-[1.6rem] border p-5 ${tone.panelShell}`}>
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl border p-2 ${tone.neutralPill}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-sm font-semibold text-white">{card.title}</div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">{card.body}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="text-xs uppercase tracking-[0.34em] text-sky-100/55">How it works</div>

          <div className="mt-5 space-y-4">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className={`rounded-[1.35rem] border p-4 ${tone.insetPanel}`}>
                <div className="flex items-center gap-3">
                  <div className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone.statusBadge}`}>
                    {item.step}
                  </div>
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 text-white" />
            <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>
              Advanced / Manual Setup
            </div>
          </div>

          <div className="mt-4 text-sm leading-6 text-slate-300">
            Most users should just download the DMG and launch the app. These variables are only for manual or protected-upload setups.
          </div>

          <div className={`mt-4 rounded-[1.4rem] border p-4 ${tone.insetPanel}`}>
            <pre className="overflow-x-auto text-sm leading-7 text-slate-100">
              <code>{OPTIONAL_ENV}</code>
            </pre>
          </div>

          <div className="mt-4 text-xs leading-6 text-slate-400">
            Default upload host already points at AoE2HDBets production. Only add the API key if the backend is locked down.
          </div>
        </div>
      </section>
    </div>
  );
}