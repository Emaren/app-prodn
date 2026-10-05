"use client";

import Link from "next/link";
import { Layers3 } from "lucide-react";
import { useState } from "react";

export type ChaosiumDisplayMode = "b1" | "a1" | "e1" | "e2";

const VERSIONS: Array<{
  key: ChaosiumDisplayMode;
  label: string;
  href: string;
  title: string;
}> = [
  { key: "b1", label: "B1", href: "/chaosium", title: "Balanced 1 · default" },
  { key: "a1", label: "A1", href: "/chaosium?view=a1", title: "Advanced 1 · roomier" },
  { key: "e1", label: "E1", href: "/chaosium?view=e1", title: "Extreme 1 · preserved" },
  { key: "e2", label: "E2", href: "/chaosium?view=e2", title: "Extreme 2 · dense" },
];

function itemClass(selected: boolean) {
  return `min-w-8 rounded-full px-2.5 py-1 text-center text-[9px] font-black uppercase tracking-[0.16em] transition ${
    selected
      ? "bg-amber-100 text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.26)]"
      : "text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
  }`;
}

export default function ChaosiumDisplayRail({
  active,
}: {
  active: ChaosiumDisplayMode;
}) {
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const family = active.startsWith("b")
    ? "b"
    : active.startsWith("a")
      ? "a"
      : "e";

  return (
    <section
      data-testid="chaosium-display-rail"
      data-chaosium-version={active}
      className="sticky bottom-3 z-40 mt-7 flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[linear-gradient(90deg,rgba(7,16,31,0.78),rgba(5,11,22,0.93))] px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_16px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl"
      aria-label="Chaosium display settings"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-600">
          Display
        </span>
        <span className="hidden text-[9px] font-semibold text-slate-500 sm:inline">
          {active.toUpperCase()}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <nav
          className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-black/25 p-0.5"
          aria-label="Chaosium view family"
        >
          <Link
            href="/chaosium"
            aria-current={family === "b" ? "page" : undefined}
            className={itemClass(family === "b")}
            title="Balanced"
          >
            B
          </Link>
          <Link
            href="/chaosium?view=a1"
            aria-current={family === "a" ? "page" : undefined}
            className={itemClass(family === "a")}
            title="Advanced"
          >
            A
          </Link>
          <Link
            href="/chaosium?view=e2"
            aria-current={family === "e" ? "page" : undefined}
            className={itemClass(family === "e")}
            title="Extreme"
          >
            E
          </Link>
        </nav>

        <span className="h-6 w-px bg-white/[0.08]" aria-hidden="true" />

        <div
          className="relative"
          onMouseEnter={() => setVersionMenuOpen(true)}
          onMouseLeave={() => setVersionMenuOpen(false)}
          onFocus={() => setVersionMenuOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setVersionMenuOpen(false);
            }
          }}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={versionMenuOpen}
            aria-label={`Choose Chaosium version. Current ${active.toUpperCase()}`}
            title={`Chaosium ${active.toUpperCase()}`}
            onClick={() => setVersionMenuOpen((value) => !value)}
            className="flex h-8 items-center gap-1.5 rounded-full px-2 text-slate-500 transition hover:bg-amber-300/[0.07] hover:text-amber-100 focus-visible:bg-amber-300/[0.07] focus-visible:text-amber-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-200/30"
          >
            <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-[9px] font-black tracking-[0.15em]">
              {active.toUpperCase()}
            </span>
          </button>

          <div
            className={`absolute bottom-full right-0 w-[11.5rem] pb-2 transition ${
              versionMenuOpen
                ? "pointer-events-auto translate-y-0 opacity-100"
                : "pointer-events-none translate-y-1 opacity-0"
            }`}
          >
            <div
              role="menu"
              aria-label="Chaosium versions"
              className="grid grid-cols-2 gap-1 rounded-2xl border border-white/[0.09] bg-[#07101e]/97 p-1.5 shadow-[0_22px_60px_rgba(0,0,0,0.48)] backdrop-blur-xl"
            >
              {VERSIONS.map((version) => (
                <Link
                  key={version.key}
                  href={version.href}
                  role="menuitem"
                  aria-current={active === version.key ? "page" : undefined}
                  title={version.title}
                  onClick={() => setVersionMenuOpen(false)}
                  className={`flex h-9 items-center justify-center rounded-xl text-[10px] font-black tracking-[0.18em] transition ${
                    active === version.key
                      ? "bg-amber-300/[0.11] text-amber-100 ring-1 ring-amber-200/20"
                      : "text-slate-500 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  {version.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
