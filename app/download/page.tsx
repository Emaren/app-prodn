"use client";

import {
  Apple,
  ArrowDownToLine,
  ExternalLink,
  Gamepad2,
  KeyRound,
  Monitor,
  Terminal,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { getLobbyPresentationTone } from "@/components/lobby/lobbyPresentation";
import {
  getWatcherArtifactsForPlatform,
  WATCHER_DOWNLOAD_ARTIFACTS,
  WATCHER_RELEASE,
} from "@/lib/watcherRelease";

const MAC_TERMINAL_FALLBACK = `xattr -dr com.apple.quarantine "/Applications/AoE2HDBets Watcher.app"
open "/Applications/AoE2HDBets Watcher.app"`;

const QUICK_STEPS = [
  {
    step: "01",
    title: "Download",
    body: "Pick the package for the machine.",
    icon: ArrowDownToLine,
  },
  {
    step: "02",
    title: "Pair once",
    body: "Open your profile and hand the watcher its key.",
    icon: KeyRound,
  },
  {
    step: "03",
    title: "Import + watch",
    body: "Scan old replays once, then leave live watch running.",
    icon: Gamepad2,
  },
] as const;

const PLATFORM_META = {
  windows: {
    title: "Windows",
    icon: Monitor,
    blurb: "Installer first. Portable if Windows gets annoying.",
  },
  macos: {
    title: "macOS",
    icon: Apple,
    blurb: "DMG first. ZIP if Gatekeeper gets in the way.",
  },
  linux: {
    title: "Linux",
    icon: Terminal,
    blurb: "AppImage for Linux, Proton, or Wine-heavy setups.",
  },
} as const;

export default function DownloadPage() {
  const { tileThemeKey, viewMode } = useLobbyAppearance();
  const tone = getLobbyPresentationTone(tileThemeKey, viewMode);
  const primaryArtifact =
    WATCHER_DOWNLOAD_ARTIFACTS.find((artifact) => artifact.primary) ??
    WATCHER_DOWNLOAD_ARTIFACTS[0];

  return (
    <div className="space-y-6 pb-8">
      <section className={`rounded-[2rem] border p-6 sm:p-8 ${tone.panelShell}`}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_22rem]">
          <div className="min-w-0">
            <div className={`text-xs uppercase tracking-[0.38em] ${tone.eyebrow}`}>
              Watcher
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Download it. Pair once. Stay live.
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-[15px]">
              Import old replays, watch new ones, and keep your AoE2HD results landing without
              babysitting the game folder.
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
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.statusBadge}`}
              >
                {WATCHER_RELEASE.signingStatus}
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={primaryArtifact.trackedHref}
                rel="nofollow"
                className={`inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold transition ${tone.primaryButton}`}
              >
                <ArrowDownToLine className="h-4 w-4" />
                Download {primaryArtifact.title}
              </a>

              <Link
                href="/profile?watcher_pair=1"
                className={`inline-flex items-center gap-3 rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`}
              >
                <ExternalLink className="h-4 w-4" />
                Open Profile Pairing
              </Link>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/5 px-4 py-3 text-xs leading-6 text-amber-50/85">
              Unsigned for now. If Windows blocks the installer, use Portable. If Mac blocks
              launch, use the ZIP or clear quarantine once.
            </div>
          </div>

          <div className={`rounded-[1.6rem] border p-5 ${tone.insetPanel}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-xs uppercase tracking-[0.32em] ${tone.accentText}`}>
                  Release
                </div>
                <div className="mt-3 text-lg font-semibold text-white">{WATCHER_RELEASE.label}</div>
                <div className="mt-1 text-sm text-slate-400">Replay companion</div>
              </div>

              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-2">
                <Image
                  src="/watcher/aoe2hd-watcher-logo.png"
                  alt="AoE2HDBets Watcher logo"
                  fill
                  className="object-contain p-2"
                />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Released
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {WATCHER_RELEASE.releasedOn}
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Primary lane
                </div>
                <div className="mt-2 text-sm font-semibold text-white">{primaryArtifact.title}</div>
              </div>

              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Platforms
                </div>
                <div className="mt-2 text-sm font-semibold text-white">Windows, macOS, Linux</div>
              </div>

              <div className="rounded-2xl border border-amber-300/18 bg-amber-300/8 p-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-amber-100/75">
                  Signing
                </div>
                <div className="mt-2 text-sm font-semibold text-amber-50">
                  {WATCHER_RELEASE.signingStatus}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {(Object.keys(PLATFORM_META) as Array<keyof typeof PLATFORM_META>).map((platformKey) => {
          const platformMeta = PLATFORM_META[platformKey];
          const Icon = platformMeta.icon;
          const artifacts = getWatcherArtifactsForPlatform(platformKey);

          return (
            <div key={platformKey} className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl border p-2 ${tone.neutralPill}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>
                    {platformMeta.title}
                  </div>
                  <div className="mt-1 text-sm text-slate-300">{platformMeta.blurb}</div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {artifacts.map((artifact) => (
                  <a
                    key={artifact.key}
                    href={artifact.trackedHref}
                    rel="nofollow"
                    className={`group block rounded-[1.4rem] border p-4 transition ${tone.insetPanel} hover:border-white/20 hover:bg-white/[0.06]`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{artifact.title}</div>
                      <div
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                          artifact.primary ? tone.statusBadge : tone.neutralPill
                        }`}
                      >
                        {artifact.badge}
                      </div>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-500">
                      {artifact.shortLabel} · {artifact.format}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{artifact.description}</p>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-amber-100 transition group-hover:text-white">
                      <ArrowDownToLine className="h-4 w-4" />
                      Download
                    </div>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>Quick start</div>

          <div className="mt-5 grid gap-3">
            {QUICK_STEPS.map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.step} className={`rounded-[1.35rem] border p-4 ${tone.insetPanel}`}>
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone.statusBadge}`}
                    >
                      {item.step}
                    </div>
                    <div className={`rounded-2xl border p-2 ${tone.neutralPill}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>
            Mac fallback
          </div>

          <p className="mt-4 text-sm leading-7 text-slate-300">
            Most Mac users will not need this. If Gatekeeper blocks launch, clear quarantine once:
          </p>

          <div className={`mt-4 rounded-[1.4rem] border p-4 ${tone.insetPanel}`}>
            <pre className="overflow-x-auto text-sm leading-7 text-slate-100">
              <code>{MAC_TERMINAL_FALLBACK}</code>
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
