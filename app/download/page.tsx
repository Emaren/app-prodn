"use client";

import {
  Activity,
  ArrowDownToLine,
  Radar,
  RefreshCcw,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import Link from "next/link";

import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { getLobbyPresentationTone } from "@/components/lobby/lobbyPresentation";

const INSTALL_COMMANDS = `cp .env.example .env
npm install
npm run start`;

const OPTIONAL_ENV = `AOE2_API_BASE_URL=https://api-prodn.aoe2hdbets.com
# optional if uploads are protected
AOE2_UPLOAD_API_KEY=your_key_here`;

const FEATURE_CHIPS = [
  "Julio-tested",
  "Live board feed",
  "Final replay proof",
  "Auto retry",
  "CrossOver ready",
];

const STATUS_CARDS = [
  {
    icon: Radar,
    label: "Live",
    value: "Uploads in-progress snapshots while the match is still on.",
  },
  {
    icon: ShieldCheck,
    label: "Final",
    value: "Closes with a final replay so the proof row lands clean.",
  },
  {
    icon: RefreshCcw,
    label: "Upgrade Path",
    value: "Grab the latest package often. Watcher upgrades are shipping fast.",
  },
];

export default function DownloadPage() {
  const { tileThemeKey, viewMode } = useLobbyAppearance();
  const tone = getLobbyPresentationTone(tileThemeKey, viewMode);

  return (
    <div className="space-y-6 pb-8">
      <section className={`rounded-[2rem] border p-6 sm:p-8 ${tone.panelShell}`}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_22rem]">
          <div className="min-w-0">
            <div className={`text-xs uppercase tracking-[0.38em] ${tone.eyebrow}`}>Watcher</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              AoE2 Watcher
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              Julio already got it running and parsed his own match. Download the newest package,
              keep it updated, and let it feed live snapshots plus final proof into AoE2HDBets.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {FEATURE_CHIPS.map((chip) => (
                <div
                  key={chip}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
                >
                  {chip}
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/downloads/aoe2-watcher-mac.zip"
                className={`inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold transition ${tone.primaryButton}`}
                download
              >
                <ArrowDownToLine className="h-4 w-4" />
                Download Watcher Package
              </Link>
              <Link
                href="/upload"
                className={`inline-flex items-center gap-3 rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`}
              >
                Open Replay Upload
              </Link>
            </div>
          </div>

          <div className={`rounded-[1.6rem] border p-5 ${tone.insetPanel}`}>
            <div className="flex items-center justify-between gap-3">
              <div className={`text-xs uppercase tracking-[0.32em] ${tone.accentText}`}>Runtime</div>
              <div className={`rounded-full border px-3 py-1 text-[11px] ${tone.statusBadge}`}>
                Latest build
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {STATUS_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className={`rounded-2xl border p-4 ${tone.card}`}>
                    <div className="flex items-center gap-3">
                      <div className={`rounded-2xl border p-2 ${tone.neutralPill}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="text-sm font-semibold text-white">{card.label}</div>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-slate-300">{card.value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="flex items-center gap-3">
            <TerminalSquare className="h-4 w-4 text-white" />
            <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>Install</div>
          </div>

          <div className={`mt-4 rounded-[1.4rem] border p-4 ${tone.insetPanel}`}>
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
              From the extracted watcher folder
            </div>
            <pre className="mt-3 overflow-x-auto text-sm leading-7 text-slate-100">
              <code>{INSTALL_COMMANDS}</code>
            </pre>
          </div>

          <div className="mt-4 text-xs leading-6 text-slate-400">
            Keep the latest package. Live-game support and parser behavior are actively improving.
          </div>
        </div>

        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 text-white" />
            <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>Optional Env</div>
          </div>

          <div className={`mt-4 rounded-[1.4rem] border p-4 ${tone.insetPanel}`}>
            <pre className="overflow-x-auto text-sm leading-7 text-slate-100">
              <code>{OPTIONAL_ENV}</code>
            </pre>
          </div>

          <div className="mt-4 text-xs leading-6 text-slate-400">
            Default upload host already points at AoE2HDBets prod. Only add the API key if the
            backend is locked down.
          </div>
        </div>
      </section>
    </div>
  );
}
