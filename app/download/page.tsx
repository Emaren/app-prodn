"use client";

import {
  Apple,
  ArrowDownToLine,
  ExternalLink,
  FolderSearch,
  Gamepad2,
  HardDriveDownload,
  KeyRound,
  Monitor,
  ShieldCheck,
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

const OPTIONAL_ENV = `AOE2_API_BASE_URL=https://api-prodn.aoe2hdbets.com
AOE2_UPLOAD_API_KEY=your_watcher_key_here`;

const SETUP_STEPS = [
  {
    step: "01",
    title: "Open your profile and click Pair Watcher",
    body: "This is still the cleanest path. The app saves the key locally, and manual key paste remains available if protocol handoff gets weird.",
    icon: KeyRound,
  },
  {
    step: "02",
    title: "Choose the package that fits the machine",
    body: "Windows installer first, portable if SmartScreen is annoying, DMG on Mac, AppImage on Linux.",
    icon: ArrowDownToLine,
  },
  {
    step: "03",
    title: "Confirm the replay folder once",
    body: "The watcher surfaces the folder path clearly and keeps manual selection available when auto-detection is messy.",
    icon: FolderSearch,
  },
  {
    step: "04",
    title: "Scan old replays, then leave live watch on",
    body: "Historical import brings stats online fast, then the same app keeps watching for new games.",
    icon: Gamepad2,
  },
] as const;

const TRUST_CARDS = [
  {
    icon: Monitor,
    title: "Tracked Downloads",
    body: "Every package button now hits a server-side tracked route before the static file is served, so operator analytics are real.",
  },
  {
    icon: ShieldCheck,
    title: "Manual Paths Stay Open",
    body: "Pairing still has a manual watcher-key path, and packaging still has backup lanes when installers or custom protocols misbehave.",
  },
  {
    icon: HardDriveDownload,
    title: "Historical Replay Import",
    body: "The packaged watcher can backfill old saved games first, then keep live-watch running for newly created replays.",
  },
] as const;

const PLATFORM_META = {
  windows: {
    title: "Windows",
    icon: Monitor,
    blurb: "NSIS installer first, portable EXE as the pressure-release valve.",
  },
  macos: {
    title: "macOS",
    icon: Apple,
    blurb: "DMG for the clean path, direct ZIP when Gatekeeper gets dramatic.",
  },
  linux: {
    title: "Linux",
    icon: Terminal,
    blurb: "AppImage lane for Proton or Wine-heavy setups where folder selection matters more than magic.",
  },
} as const;

export default function DownloadPage() {
  const { tileThemeKey, viewMode } = useLobbyAppearance();
  const tone = getLobbyPresentationTone(tileThemeKey, viewMode);
  const primaryArtifact =
    WATCHER_DOWNLOAD_ARTIFACTS.find((artifact) => artifact.primary) ?? WATCHER_DOWNLOAD_ARTIFACTS[0];

  return (
    <div className="space-y-6 pb-8">
      <section className={`rounded-[2rem] border p-6 sm:p-8 ${tone.panelShell}`}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_22rem]">
          <div className="min-w-0">
            <div className={`text-xs uppercase tracking-[0.38em] ${tone.eyebrow}`}>Watcher</div>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Download it. Pair once. Import the backlog. Stay live.
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-[15px]">
              AoE2HDBets Watcher sits beside the game, imports historical replays, watches the
              SaveGame folder for new files, and lands replay proof without making real users feel
              like QA.
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
              <Link
                href={primaryArtifact.trackedHref}
                className={`inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold transition ${tone.primaryButton}`}
              >
                <ArrowDownToLine className="h-4 w-4" />
                Download {primaryArtifact.title}
              </Link>

              <Link
                href="/profile?watcher_pair=1"
                className={`inline-flex items-center gap-3 rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`}
              >
                <ExternalLink className="h-4 w-4" />
                Open Profile Pairing
              </Link>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/5 px-4 py-3 text-xs leading-6 text-amber-50/85">
              Unsigned builds are honest for now. Windows users may see SmartScreen once, Mac users
              may need a quarantine clear once, and the portable/manual lanes stay available so the
              product never depends on one brittle install path.
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
                  Platform lanes
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  Windows, macOS, Linux
                </div>
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
                  <Link
                    key={artifact.key}
                    href={artifact.trackedHref}
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
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="flex items-center gap-3">
            <HardDriveDownload className="h-4 w-4 text-white" />
            <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>
              Setup Flow
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {SETUP_STEPS.map((item) => {
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
          <div className="text-xs uppercase tracking-[0.34em] text-sky-100/55">Fast Notes</div>

          <div className="mt-5 grid gap-3">
            <div className={`rounded-[1.35rem] border p-4 ${tone.insetPanel}`}>
              <div className="text-sm font-semibold text-white">Windows</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Try the installer first. If SmartScreen or installer policy is annoying, use the
                portable EXE and keep going.
              </p>
            </div>

            <div className={`rounded-[1.35rem] border p-4 ${tone.insetPanel}`}>
              <div className="text-sm font-semibold text-white">Pairing</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Custom protocol still helps, but manual watcher-key paste is a first-class fallback
                and the app does not depend on protocol registration to work.
              </p>
            </div>

            <div className={`rounded-[1.35rem] border p-4 ${tone.insetPanel}`}>
              <div className="text-sm font-semibold text-white">Imports</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Use Scan &amp; Import Replays once after install so historical stats land before the
                live watcher takes over.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {TRUST_CARDS.map((card) => {
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
          <div className="flex items-center gap-3">
            <Terminal className="h-4 w-4 text-white" />
            <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>
              macOS Quarantine Fallback
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
            <p>
              Most Mac users should never need Terminal. If the DMG or ZIP launches cleanly, you
              are done.
            </p>
            <p>
              If Gatekeeper blocks the unsigned app, clear quarantine once and reopen it:
            </p>
          </div>

          <div className={`mt-4 rounded-[1.4rem] border p-4 ${tone.insetPanel}`}>
            <pre className="overflow-x-auto text-sm leading-7 text-slate-100">
              <code>{MAC_TERMINAL_FALLBACK}</code>
            </pre>
          </div>
        </div>

        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="text-xs uppercase tracking-[0.34em] text-sky-100/55">Advanced / Manual</div>

          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
            <p>
              The packaged watcher already points at production. Most users do not need to touch
              anything else.
            </p>
            <p>
              These variables are only useful for protected uploads or manual terminal launches.
            </p>
          </div>

          <div className={`mt-4 rounded-[1.4rem] border p-4 ${tone.insetPanel}`}>
            <pre className="overflow-x-auto text-sm leading-7 text-slate-100">
              <code>{OPTIONAL_ENV}</code>
            </pre>
          </div>

          <div className="mt-4 text-xs leading-6 text-slate-400">
            The public buttons above hit tracked redirect routes first. Operator analytics stay
            honest, while the user still ends up at the real static package under
            <code> /downloads</code>.
          </div>
        </div>
      </section>
    </div>
  );
}
