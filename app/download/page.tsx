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
import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import {
  TILE_VIEW_MODES,
  type TileViewMode,
} from "@/lib/tileViewPreferences";
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

const DOWNLOAD_VIEW_LABELS: Record<TileViewMode, string> = {
  basic: "Basic",
  advanced: "Advanced",
  extreme: "Extreme",
};

const EXTREME_SIGNAL_CARDS = [
  {
    eyebrow: "Replay Rail",
    title: "Automatic capture",
    body: "Historical import, live replay monitoring, and final replay delivery.",
  },
  {
    eyebrow: "Recovery Rail",
    title: "Built to stay armed",
    body: "Settlement observation, monitor recovery, and durable replay lifecycle state.",
  },
  {
    eyebrow: "Broadcast Rail",
    title: "Native streaming ready",
    body: "Optional Watcher-native capture for taking an AoE2HD battle live on AoE2WAR.",
  },
] as const;

function DownloadViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: TileViewMode;
  setViewMode: (mode: TileViewMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-amber-200/20 bg-[#050910]/88 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.42),0_0_30px_rgba(251,191,36,0.06)] backdrop-blur-xl"
      role="group"
      aria-label="Download Watcher view"
    >
      {TILE_VIEW_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => setViewMode(mode)}
          aria-pressed={viewMode === mode}
          aria-label={`${DOWNLOAD_VIEW_LABELS[mode]} Download Watcher view`}
          title={`${DOWNLOAD_VIEW_LABELS[mode]} view`}
          className={`flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
            viewMode === mode
              ? "bg-amber-300 text-slate-950 shadow-[0_6px_20px_rgba(251,191,36,0.22)]"
              : "text-slate-400 hover:bg-white/[0.07] hover:text-amber-50"
          }`}
        >
          {mode[0]}
        </button>
      ))}
    </div>
  );
}

export default function DownloadPage() {
  const {
    tileThemeKey,
    viewMode: lobbyViewMode,
  } = useLobbyAppearance();

  const {
    viewMode,
    setViewMode,
  } = useTileViewPreference("download_watcher");

  const tone =
    getLobbyPresentationTone(
      tileThemeKey,
      lobbyViewMode
    );

  const primaryArtifact =
    WATCHER_DOWNLOAD_ARTIFACTS.find(
      (artifact) => artifact.primary
    ) ?? WATCHER_DOWNLOAD_ARTIFACTS[0];

  const basic = viewMode === "basic";
  const advanced = viewMode === "advanced";
  const extreme = viewMode === "extreme";

  const pageClass = basic
    ? "space-y-6 pb-8"
    : "w-full max-w-none space-y-5 pb-8";

  const heroClass = basic
    ? `rounded-[2rem] border p-6 sm:p-8 ${tone.panelShell}`
    : advanced
      ? "relative overflow-hidden rounded-[2.3rem] border border-amber-200/16 bg-[linear-gradient(135deg,rgba(40,29,17,0.9),rgba(7,12,22,0.97)_44%,rgba(8,21,38,0.94))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.5)] sm:p-9"
      : "relative overflow-hidden rounded-[2.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(34,24,13,0.78),rgba(3,8,16,0.985)_34%,rgba(4,12,24,0.98)_70%,rgba(19,22,44,0.92))] p-6 shadow-[0_38px_120px_rgba(0,0,0,0.6)] sm:p-9 lg:p-11";

  const platformShell = basic
    ? `rounded-[1.8rem] border p-6 ${tone.panelShell}`
    : advanced
      ? "rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] p-6 shadow-[0_24px_75px_rgba(0,0,0,0.34)]"
      : "relative overflow-hidden rounded-[2.15rem] border border-white/9 bg-[#050a13]/94 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.42)] lg:p-7";

  const artifactShell = basic
    ? tone.insetPanel
    : advanced
      ? "border-white/9 bg-black/20 hover:border-amber-200/18 hover:bg-white/[0.055]"
      : "border-white/8 bg-[linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] hover:border-cyan-200/16 hover:bg-white/[0.06]";

  return (
    <div
      className={pageClass}
      data-download-view={viewMode}
    >
      {extreme ? (
        <section
          className="relative overflow-hidden rounded-[2.6rem] border border-white/10 bg-[#020711] shadow-[0_38px_120px_rgba(0,0,0,0.6)]"
          aria-label="AoE2HDBets Watcher 1.5.7"
        >
          <h1 className="sr-only">
            Download it. Pair once. Stay live.
          </h1>

          <p className="sr-only">
            AoE2HDBets Watcher 1.5.7 automatically captures live and historical
            AoE2HD replay evidence with recovery, telemetry, result processing,
            and cross-platform support.
          </p>

          <div className="absolute right-3 top-3 z-20 origin-top-right scale-[0.45] sm:right-5 sm:top-5">
            <DownloadViewToggle
              viewMode={viewMode}
              setViewMode={setViewMode}
            />
          </div>

          <picture>
            <source
              media="(max-width: 767px)"
              srcSet="/watcher/watcher-v156-mobile.png"
            />

            <img
              src="/watcher/watcher-v156-desktop.png"
              alt="AoE2WAR Watcher 1.5.7 replay companion overview"
              width="1672"
              height="941"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="block h-auto w-full"
            />
          </picture>

          {/*
            Desktop artwork interactive regions.

            Coordinates are percentages of the original
            1672 × 941 Watcher desktop artwork, so the
            click targets remain aligned while the image
            scales responsively.

            Mobile uses separate portrait artwork and does
            not display these painted buttons.
          */}

          <a
            href={primaryArtifact.trackedHref}
            rel="nofollow"
            aria-label="Download Windows Installer"
            title="Download Windows Installer"
            data-watcher-hero-hotspot="windows-installer"
            className="absolute left-[2.75%] top-[30.15%] z-10 hidden h-[5.65%] w-[16.9%] cursor-pointer rounded-[0.8rem] bg-white/0 transition hover:bg-white/[0.055] focus-visible:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020711] md:block"
          >
            <span className="sr-only">
              Download Windows Installer
            </span>
          </a>

          <Link
            href="/profile?watcher_pair=1"
            aria-label="Open Profile Pairing"
            title="Open Profile Pairing"
            data-watcher-hero-hotspot="profile-pairing"
            className="absolute left-[20.15%] top-[30.15%] z-10 hidden h-[5.65%] w-[13.35%] cursor-pointer rounded-[0.8rem] bg-white/0 transition hover:bg-white/[0.055] focus-visible:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020711] md:block"
          >
            <span className="sr-only">
              Open Profile Pairing
            </span>
          </Link>
        </section>
      ) : null}

      <section className={extreme ? "hidden" : heroClass}>
        {!basic ? (
          <div
            className={`pointer-events-none absolute inset-0 ${
              extreme
                ? "bg-[radial-gradient(circle_at_12%_10%,rgba(245,158,11,0.10),transparent_27%),radial-gradient(circle_at_84%_3%,rgba(34,211,238,0.08),transparent_26%)]"
                : "bg-[radial-gradient(circle_at_80%_5%,rgba(56,189,248,0.07),transparent_30%)]"
            }`}
          />
        ) : null}

        <div
          className={`relative grid gap-6 ${
            extreme
              ? "xl:grid-cols-[minmax(0,1.45fr)_24rem]"
              : "xl:grid-cols-[minmax(0,1.12fr)_22rem]"
          }`}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div
                className={`text-xs uppercase tracking-[0.38em] ${
                  basic
                    ? tone.eyebrow
                    : "text-amber-200/65"
                }`}
              >
                Watcher
              </div>

              <DownloadViewToggle
                viewMode={viewMode}
                setViewMode={setViewMode}
              />
            </div>

            <h1
              className={`mt-4 font-semibold tracking-tight text-white ${
                extreme
                  ? "font-serif text-5xl sm:text-6xl lg:text-7xl"
                  : advanced
                    ? "text-5xl sm:text-6xl"
                    : "text-4xl sm:text-5xl"
              }`}
            >
              Download it. Pair once. Stay live.
            </h1>

            <p
              className={`mt-5 text-slate-300 ${
                extreme
                  ? "max-w-4xl text-[15px] leading-8 sm:text-base"
                  : "max-w-3xl text-sm leading-7 sm:text-[15px]"
              }`}
            >
              Import old replays, watch new ones, and keep your AoE2HD results landing without
              babysitting the game folder.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {WATCHER_RELEASE.featureChips.map((chip) => (
                <div
                  key={chip}
                  className={
                    basic
                      ? `rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`
                      : `rounded-full border px-3 py-1.5 text-[11px] font-medium ${
                          extreme
                            ? "border-white/8 bg-white/[0.035] text-slate-300"
                            : "border-white/10 bg-white/[0.04] text-slate-300"
                        }`
                  }
                >
                  {chip}
                </div>
              ))}

              <div
                className={
                  basic
                    ? `rounded-full border px-3 py-1 text-[11px] font-medium ${tone.statusBadge}`
                    : "rounded-full border border-amber-200/16 bg-amber-300/[0.08] px-3 py-1.5 text-[11px] font-medium text-amber-100"
                }
              >
                {WATCHER_RELEASE.signingStatus}
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={primaryArtifact.trackedHref}
                rel="nofollow"
                className={
                  basic
                    ? `inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold transition ${tone.primaryButton}`
                    : "inline-flex cursor-pointer items-center gap-3 rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_12px_35px_rgba(251,191,36,0.16)] transition hover:bg-amber-200"
                }
              >
                <ArrowDownToLine className="h-4 w-4" />
                Download {primaryArtifact.title}
              </a>

              <Link
                href="/profile?watcher_pair=1"
                className={
                  basic
                    ? `inline-flex items-center gap-3 rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`
                    : "inline-flex cursor-pointer items-center gap-3 rounded-full border border-white/12 bg-black/20 px-5 py-3 text-sm text-slate-200 transition hover:border-white/25 hover:text-white"
                }
              >
                <ExternalLink className="h-4 w-4" />
                Open Profile Pairing
              </Link>
            </div>

            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-xs leading-6 ${
                basic
                  ? "border-amber-300/15 bg-amber-300/5 text-amber-50/85"
                  : "border-amber-200/12 bg-amber-300/[0.055] text-amber-50/80"
              }`}
            >
              Signed Windows build. Windows installer and portable EXE are Authenticode-signed and
              timestamped with Microsoft Trusted Signing. SmartScreen may still warn briefly while
              reputation builds.
            </div>
          </div>

          <div
            className={
              basic
                ? `rounded-[1.6rem] border p-5 ${tone.insetPanel}`
                : extreme
                  ? "rounded-[2rem] border border-white/8 bg-black/25 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
                  : "rounded-[1.8rem] border border-white/10 bg-black/20 p-5"
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div
                  className={`text-xs uppercase tracking-[0.32em] ${
                    basic
                      ? tone.accentText
                      : "text-amber-200/65"
                  }`}
                >
                  Release
                </div>

                <div
                  className={`mt-3 font-semibold text-white ${
                    extreme
                      ? "text-2xl"
                      : "text-lg"
                  }`}
                >
                  {WATCHER_RELEASE.label}
                </div>

                <div className="mt-1 text-sm text-slate-400">
                  Replay companion
                </div>
              </div>

              <div
                className={`relative shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-2 ${
                  extreme
                    ? "h-24 w-24"
                    : "h-20 w-20"
                }`}
              >
                <Image
                  src="/watcher/aoe2hd-watcher-logo.png"
                  alt="AoE2HDBets Watcher logo"
                  fill
                  className="object-contain p-2"
                />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {[
                ["Released", WATCHER_RELEASE.releasedOn],
                ["Primary lane", primaryArtifact.title],
                ["Platforms", "Windows, macOS, Linux"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className={
                    basic
                      ? `rounded-2xl border p-4 ${tone.card}`
                      : "rounded-2xl border border-white/8 bg-white/[0.035] p-4"
                  }
                >
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                    {label}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {value}
                  </div>
                </div>
              ))}

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

      {extreme ? (
        <section className="grid gap-3 lg:grid-cols-3">
          {EXTREME_SIGNAL_CARDS.map((item) => (
            <div
              key={item.eyebrow}
              className="rounded-[1.8rem] border border-white/8 bg-[linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.26)]"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/48">
                {item.eyebrow}
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {item.title}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {item.body}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      <section
        className={`grid gap-4 ${
          extreme
            ? "lg:grid-cols-3"
            : "xl:grid-cols-3"
        }`}
      >
        {(Object.keys(PLATFORM_META) as Array<keyof typeof PLATFORM_META>).map(
          (platformKey) => {
            const platformMeta =
              PLATFORM_META[platformKey];

            const Icon =
              platformMeta.icon;

            const artifacts =
              getWatcherArtifactsForPlatform(
                platformKey
              );

            return (
              <div
                key={platformKey}
                className={platformShell}
              >
                {extreme ? (
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.045),transparent_36%)]" />
                ) : null}

                <div className="relative">
                  <div className="flex items-center gap-3">
                    <div
                      className={
                        basic
                          ? `rounded-2xl border p-2 ${tone.neutralPill}`
                          : "rounded-2xl border border-white/9 bg-white/[0.04] p-2 text-slate-300"
                      }
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div>
                      <div
                        className={`text-xs uppercase tracking-[0.34em] ${
                          basic
                            ? tone.eyebrow
                            : "text-amber-200/55"
                        }`}
                      >
                        {platformMeta.title}
                      </div>

                      <div className="mt-1 text-sm text-slate-300">
                        {platformMeta.blurb}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {artifacts.map((artifact) => (
                      <a
                        key={artifact.key}
                        href={artifact.trackedHref}
                        rel="nofollow"
                        className={`group block cursor-pointer rounded-[1.4rem] border p-4 transition ${artifactShell}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-white">
                            {artifact.title}
                          </div>

                          <div
                            className={
                              basic
                                ? `rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                    artifact.primary
                                      ? tone.statusBadge
                                      : tone.neutralPill
                                  }`
                                : `rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                    artifact.primary
                                      ? "border-amber-200/16 bg-amber-300/[0.08] text-amber-100"
                                      : "border-white/8 bg-white/[0.035] text-slate-400"
                                  }`
                            }
                          >
                            {artifact.badge}
                          </div>
                        </div>

                        <div className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-500">
                          {artifact.shortLabel} · {artifact.format}
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          {artifact.description}
                        </p>

                        <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-amber-100 transition group-hover:text-white">
                          <ArrowDownToLine className="h-4 w-4" />
                          Download
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            );
          }
        )}
      </section>

      <section
        className={`grid gap-4 ${
          extreme
            ? "xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]"
            : "xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
        }`}
      >
        <div className={platformShell}>
          <div
            className={`text-xs uppercase tracking-[0.34em] ${
              basic
                ? tone.eyebrow
                : "text-amber-200/55"
            }`}
          >
            Quick start
          </div>

          <div
            className={`mt-5 grid gap-3 ${
              extreme
                ? "md:grid-cols-3"
                : ""
            }`}
          >
            {QUICK_STEPS.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.step}
                  className={
                    basic
                      ? `rounded-[1.35rem] border p-4 ${tone.insetPanel}`
                      : "rounded-[1.5rem] border border-white/8 bg-black/20 p-4"
                  }
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={
                        basic
                          ? `rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone.statusBadge}`
                          : "rounded-full border border-amber-200/15 bg-amber-300/[0.07] px-2.5 py-1 text-[11px] font-medium text-amber-100"
                      }
                    >
                      {item.step}
                    </div>

                    <div
                      className={
                        basic
                          ? `rounded-2xl border p-2 ${tone.neutralPill}`
                          : "rounded-2xl border border-white/8 bg-white/[0.04] p-2 text-slate-300"
                      }
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="text-sm font-semibold text-white">
                      {item.title}
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {item.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className={platformShell}>
          <div
            className={`text-xs uppercase tracking-[0.34em] ${
              basic
                ? tone.eyebrow
                : "text-amber-200/55"
            }`}
          >
            Mac fallback
          </div>

          <p className="mt-4 text-sm leading-7 text-slate-300">
            Most Mac users will not need this. If Gatekeeper blocks launch, clear quarantine once:
          </p>

          <div
            className={
              basic
                ? `mt-4 rounded-[1.4rem] border p-4 ${tone.insetPanel}`
                : "mt-4 rounded-[1.5rem] border border-white/8 bg-black/25 p-4"
            }
          >
            <pre className="overflow-x-auto text-sm leading-7 text-slate-100">
              <code>{MAC_TERMINAL_FALLBACK}</code>
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
