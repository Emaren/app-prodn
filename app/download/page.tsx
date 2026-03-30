"use client";

import {
  Activity,
  Apple,
  ArrowDownToLine,
  FolderSearch,
  HardDriveDownload,
  Laptop,
  Monitor,
  Radar,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
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
    body: "Grab the latest package for your platform.",
  },
  {
    step: "02",
    title: "Open",
    body: "Launch the watcher and allow it the first time if your OS asks.",
  },
  {
    step: "03",
    title: "Play",
    body: "Leave it running while you play so AoE2HDBets receives live and final replay proof.",
  },
] as const;

const PLATFORM_RELEASES = [
  {
    key: "mac",
    title: "macOS App",
    subtitle: "Apple Silicon · DMG",
    href: WATCHER_RELEASE.downloadHref,
    icon: Apple,
    status: "Live now",
    isReady: true,
  },
  {
    key: "zip",
    title: "Manual ZIP",
    subtitle: "Fallback while signing is offline",
    href: "/downloads/aoe2-watcher-manual.zip",
    icon: HardDriveDownload,
    status: "Fallback",
    isReady: true,
  },
  {
    key: "windows",
    title: "Windows",
    subtitle: "Installer coming next",
    href: "",
    icon: Monitor,
    status: "Coming soon",
    isReady: false,
  },
  {
    key: "linux",
    title: "Linux",
    subtitle: "AppImage / package next",
    href: "",
    icon: Laptop,
    status: "Coming soon",
    isReady: false,
  },
] as const;

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
              AoE2HD Watcher
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-[15px]">
              Watches your AoE2HD SaveGame folder, sends live match snapshots, and lands
              final replay proof automatically.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
              >
                DMG Release
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
              >
                macOS Apple Silicon
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
              >
                CrossOver Ready
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
              >
                Live Snapshots
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
              >
                Final Proof
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.statusBadge}`}
              >
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
                Download for macOS
              </Link>

              <Link
                href="/downloads/aoe2-watcher-manual.zip"
                className={`inline-flex items-center gap-3 rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`}
                download
              >
                Manual ZIP Fallback
              </Link>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/5 px-4 py-3 text-xs leading-6 text-amber-50/85">
              The DMG is the preferred install path. If macOS blocks launch while signing and
              notarization are offline, use the Manual ZIP fallback.
            </div>
          </div>

          <div className={`rounded-[1.6rem] border p-5 ${tone.insetPanel}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-xs uppercase tracking-[0.32em] ${tone.accentText}`}>
                  Release
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {WATCHER_RELEASE.label}
                </div>
                <div className="mt-1 text-sm text-slate-400">Premium replay companion</div>
              </div>

              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-2">
                <Image
                  src="/watcher/aoe2hd-watcher-logo.png"
                  alt="AoE2HD Watcher logo"
                  fill
                  className="object-contain p-2"
                />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Package
                </div>
                <div className="mt-2 text-sm font-semibold text-white">DMG</div>
              </div>

              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Platform
                </div>
                <div className="mt-2 text-sm font-semibold text-white">macOS Apple Silicon</div>
              </div>

              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Released
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {WATCHER_RELEASE.releasedOn}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-300/18 bg-amber-300/8 p-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-amber-100/75">
                  Signing
                </div>
                <div className="mt-2 text-sm font-semibold text-amber-50">
                  Unsigned for now
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="flex items-center gap-3">
            <HardDriveDownload className="h-4 w-4 text-white" />
            <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>
              Downloads
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PLATFORM_RELEASES.map((platform) => {
              const Icon = platform.icon;

              if (platform.isReady) {
                return (
                  <Link
                    key={platform.key}
                    href={platform.href}
                    download
                    className={`group rounded-[1.35rem] border p-4 transition ${tone.insetPanel} hover:border-white/20 hover:bg-white/[0.06]`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className={`rounded-2xl border p-2 ${tone.neutralPill}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                          platform.key === "zip" ? tone.neutralPill : tone.statusBadge
                        }`}
                      >
                        {platform.status}
                      </div>
                    </div>

                    <div className="mt-4 text-base font-semibold text-white">{platform.title}</div>
                    <div className="mt-1 text-sm text-slate-400">{platform.subtitle}</div>

                    <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-amber-100 transition group-hover:text-white">
                      <ArrowDownToLine className="h-4 w-4" />
                      Download
                    </div>
                  </Link>
                );
              }

              return (
                <div
                  key={platform.key}
                  className="rounded-[1.35rem] border border-white/8 bg-slate-950/30 p-4 opacity-90"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-slate-200">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                      {platform.status}
                    </div>
                  </div>

                  <div className="mt-4 text-base font-semibold text-white">{platform.title}</div>
                  <div className="mt-1 text-sm text-slate-400">{platform.subtitle}</div>

                  <div className="mt-5 text-xs leading-6 text-slate-500">
                    We&apos;ll add the native package and hook this link up next.
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="text-xs uppercase tracking-[0.34em] text-sky-100/55">Quick Start</div>

          <div className="mt-5 space-y-4">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className={`rounded-[1.35rem] border p-4 ${tone.insetPanel}`}>
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone.statusBadge}`}
                  >
                    {item.step}
                  </div>
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{item.body}</p>
              </div>
            ))}
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
          <div className="text-xs uppercase tracking-[0.34em] text-sky-100/55">
            Platform plan
          </div>

          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
            <p>
              macOS now has the real packaged app path, and the Manual ZIP fallback stays
              available while Apple signing and notarization are offline.
            </p>
            <p>
              Windows and Linux links are shown here so the platform story feels complete, but
              those native packages still need to be built and hooked up.
            </p>
          </div>
        </div>

        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 text-white" />
            <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>
              Advanced
            </div>
          </div>

          <div className="mt-4 text-sm leading-6 text-slate-300">
            Most users should just download the packaged app. These variables are only for
            manual or protected-upload setups.
          </div>

          <div className={`mt-4 rounded-[1.4rem] border p-4 ${tone.insetPanel}`}>
            <pre className="overflow-x-auto text-sm leading-7 text-slate-100">
              <code>{OPTIONAL_ENV}</code>
            </pre>
          </div>

          <div className="mt-4 text-xs leading-6 text-slate-400">
            Default upload host already points at AoE2HDBets production. Only add the API key if
            the backend is locked down.
          </div>
        </div>
      </section>
    </div>
  );
}