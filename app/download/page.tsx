"use client";

import {
  Apple,
  ArrowDownToLine,
  ExternalLink,
  FolderSearch,
  Gamepad2,
  HardDriveDownload,
  KeyRound,
  Radar,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { getLobbyPresentationTone } from "@/components/lobby/lobbyPresentation";
import { WATCHER_RELEASE } from "@/lib/watcherRelease";

const TERMINAL_FALLBACK = `xattr -dr com.apple.quarantine "/Applications/AoE2HD Watcher.app"
open "/Applications/AoE2HD Watcher.app"`;

const OPTIONAL_ENV = `AOE2_API_BASE_URL=https://api-prodn.aoe2hdbets.com
AOE2_UPLOAD_API_KEY=your_watcher_key_here`;

const INSTALL_OPTIONS = [
  {
    key: "dmg",
    title: "DMG Install",
    subtitle: "Preferred on macOS",
    href: WATCHER_RELEASE.downloadHref,
    icon: Apple,
    badge: "Preferred",
    body: "Best when macOS opens it cleanly. Drag the app in, launch it, paste your watcher key once, and play.",
  },
  {
    key: "zip",
    title: "Direct ZIP",
    subtitle: "Same app, same uploads",
    href: WATCHER_RELEASE.manualZipHref,
    icon: HardDriveDownload,
    badge: "Fallback",
    body: "Contains the same AoE2HD Watcher app bundle as the DMG. Use it if the DMG or Gatekeeper gets weird.",
  },
] as const;

const SETUP_STEPS = [
  {
    step: "01",
    title: "Open your profile and mint a watcher key",
    body: "This is the one-time identity step. Paste the key into the app once per Mac.",
    icon: KeyRound,
  },
  {
    step: "02",
    title: "Download the DMG or the Direct ZIP",
    body: "DMG is easier. The Direct ZIP is a real fallback, not a reduced version.",
    icon: ArrowDownToLine,
  },
  {
    step: "03",
    title: "Launch the app and confirm the replay folder",
    body: "Auto-detect usually finds the AoE2HD or CrossOver SaveGame path immediately.",
    icon: FolderSearch,
  },
  {
    step: "04",
    title: "Leave it open while you play",
    body: "AoE2HDBets receives live replay pulses during the match and final proof after the replay settles.",
    icon: Gamepad2,
  },
] as const;

const TRUST_CARDS = [
  {
    icon: Radar,
    title: "Live Match Feed",
    body: "The watcher can send in-progress replay snapshots while the match is still being played.",
  },
  {
    icon: ShieldCheck,
    title: "Final Replay Proof",
    body: "When the replay file settles, the watcher pushes the final parse so results land clean.",
  },
  {
    icon: HardDriveDownload,
    title: "Direct ZIP Is Legit",
    body: "The ZIP contains the same app bundle and the same upload pipeline as the DMG. No feature loss.",
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
              Download it. Paste your key once. Play.
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-[15px]">
              AoE2HD Watcher sits on your Mac, watches the SaveGame folder, sends live replay
              pulses during the match, and lands final replay proof automatically when the file
              settles.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
              >
                macOS Apple Silicon
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
              >
                CrossOver ready
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
              >
                One-time watcher key
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.neutralPill}`}
              >
                Direct ZIP works too
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${tone.statusBadge}`}
              >
                {WATCHER_RELEASE.signingStatus}
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={WATCHER_RELEASE.downloadHref}
                className={`inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold transition ${tone.primaryButton}`}
                download
              >
                <ArrowDownToLine className="h-4 w-4" />
                Download DMG
              </Link>

              <Link
                href={WATCHER_RELEASE.manualZipHref}
                className={`inline-flex items-center gap-3 rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`}
                download
              >
                <HardDriveDownload className="h-4 w-4" />
                Download Direct ZIP
              </Link>

              <Link
                href="/profile"
                className={`inline-flex items-center gap-3 rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`}
              >
                <ExternalLink className="h-4 w-4" />
                Open Profile For Key
              </Link>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/5 px-4 py-3 text-xs leading-6 text-amber-50/85">
              The DMG is the easiest path. The Direct ZIP contains the same watcher app and the
              same upload flow. Terminal is only needed if macOS blocks the unsigned app.
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
                  Primary package
                </div>
                <div className="mt-2 text-sm font-semibold text-white">DMG</div>
              </div>

              <div className={`rounded-2xl border p-4 ${tone.card}`}>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Legit fallback
                </div>
                <div className="mt-2 text-sm font-semibold text-white">Direct ZIP</div>
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
                  {WATCHER_RELEASE.signingStatus}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="flex items-center gap-3">
            <HardDriveDownload className="h-4 w-4 text-white" />
            <div className={`text-xs uppercase tracking-[0.34em] ${tone.eyebrow}`}>
              Choose Your Install
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {INSTALL_OPTIONS.map((option) => {
              const Icon = option.icon;

              return (
                <Link
                  key={option.key}
                  href={option.href}
                  download
                  className={`group rounded-[1.5rem] border p-5 transition ${tone.insetPanel} hover:border-white/20 hover:bg-white/[0.06]`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className={`rounded-2xl border p-2 ${tone.neutralPill}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                        option.key === "dmg" ? tone.statusBadge : tone.neutralPill
                      }`}
                    >
                      {option.badge}
                    </div>
                  </div>

                  <div className="mt-4 text-lg font-semibold text-white">{option.title}</div>
                  <div className="mt-1 text-sm text-slate-400">{option.subtitle}</div>
                  <p className="mt-4 text-sm leading-6 text-slate-300">{option.body}</p>

                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-amber-100 transition group-hover:text-white">
                    <ArrowDownToLine className="h-4 w-4" />
                    Download
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="text-xs uppercase tracking-[0.34em] text-sky-100/55">One-Time Setup</div>

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
              Unsigned Mac Fallback
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
            <p>
              Most users should never need Terminal. If the DMG or Direct ZIP opens and the app
              launches, you are done.
            </p>
            <p>
              If Gatekeeper blocks the unsigned app, clear the quarantine attribute once and open
              it again:
            </p>
          </div>

          <div className={`mt-4 rounded-[1.4rem] border p-4 ${tone.insetPanel}`}>
            <pre className="overflow-x-auto text-sm leading-7 text-slate-100">
              <code>{TERMINAL_FALLBACK}</code>
            </pre>
          </div>

          <div className="mt-4 text-xs leading-6 text-slate-400">
            Swap the path if you keep the app outside <code>/Applications</code>. The command is
            only for launch friction, not a different watcher mode.
          </div>
        </div>

        <div className={`rounded-[1.8rem] border p-6 ${tone.panelShell}`}>
          <div className="text-xs uppercase tracking-[0.34em] text-sky-100/55">Advanced / Manual</div>

          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
            <p>
              The packaged app already points at production. Most users do not need to touch any
              variables at all.
            </p>
            <p>
              These are only useful for protected uploads or manual terminal launches.
            </p>
          </div>

          <div className={`mt-4 rounded-[1.4rem] border p-4 ${tone.insetPanel}`}>
            <pre className="overflow-x-auto text-sm leading-7 text-slate-100">
              <code>{OPTIONAL_ENV}</code>
            </pre>
          </div>

          <div className="mt-4 text-xs leading-6 text-slate-400">
            Windows and Linux packaging are still next up. Right now the honest path is macOS with
            DMG first and Direct ZIP as the real fallback.
          </div>
        </div>
      </section>
    </div>
  );
}
