"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export type ChampionsDisplayMode = "b" | "a" | "e1" | "e2" | "e3" | "e4";

const CHAMPIONS_VIEW_ROUTES: Array<{
  mode: ChampionsDisplayMode;
  label: string;
  href: string;
}> = [
  { mode: "b", label: "B", href: "/champions/legacy?view=b" },
  { mode: "a", label: "A", href: "/champions/legacy?view=a" },
  { mode: "e1", label: "E1", href: "/champions/legacy?view=e" },
  { mode: "e2", label: "E2", href: "/champions/e2" },
  { mode: "e3", label: "E3", href: "/champions" },
  { mode: "e4", label: "E4", href: "/champions/e4" },
];

export function ChampionsViewCycleButton({
  active,
}: {
  active: ChampionsDisplayMode;
}) {
  const currentIndex = CHAMPIONS_VIEW_ROUTES.findIndex((entry) => entry.mode === active);
  const current = CHAMPIONS_VIEW_ROUTES[currentIndex >= 0 ? currentIndex : 0];
  const next = CHAMPIONS_VIEW_ROUTES[(currentIndex + 1 + CHAMPIONS_VIEW_ROUTES.length) % CHAMPIONS_VIEW_ROUTES.length];

  return (
    <Link
      href={next.href}
      aria-label={`Champions view ${current.label}. Switch to ${next.label}.`}
      title={`${current.label} · click for ${next.label}`}
      className="group inline-flex min-w-[4.4rem] items-center justify-between gap-2 rounded-full border border-amber-100/10 bg-[linear-gradient(180deg,rgba(92,67,39,0.34),rgba(42,31,20,0.56))] px-2.5 py-1.5 text-amber-100/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_8px_24px_rgba(0,0,0,0.22)] transition hover:border-amber-100/20 hover:text-amber-50"
    >
      <span className="text-[7px] font-black uppercase tracking-[0.22em] text-amber-100/32">
        View
      </span>
      <span className="font-mono text-[10px] font-black tracking-[0.12em]">
        {current.label}
      </span>
      <span className="text-[9px] text-amber-100/28 transition group-hover:translate-x-0.5">
        ›
      </span>
    </Link>
  );
}

function itemClass(selected: boolean) {
  return `min-w-8 rounded-full px-2.5 py-1 text-center text-[9px] font-black uppercase tracking-[0.16em] transition ${
    selected
      ? "bg-amber-100 text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.26)]"
      : "text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
  }`;
}

export default function ChampionsDisplayRail({
  active,
}: {
  active?: ChampionsDisplayMode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedLegacy = searchParams.get("view");
  const inferred: ChampionsDisplayMode =
    pathname.includes("/champions/legacy")
      ? requestedLegacy === "b"
        ? "b"
        : requestedLegacy === "a"
          ? "a"
          : "e1"
      : pathname.includes("/champions/e4")
        ? "e4"
        : pathname.includes("/champions/e2")
          ? "e2"
          : "e3";
  const selectedMode = active ?? inferred;
  const extremeSelected =
    selectedMode === "e1" ||
    selectedMode === "e2" ||
    selectedMode === "e3" ||
    selectedMode === "e4";

  useEffect(() => {
    document.documentElement.dataset.championsView =
      extremeSelected ? "e" : selectedMode;
  }, [extremeSelected, selectedMode]);

  return (
    <section
      className="flex min-h-10 w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/70 px-3 py-1.5 shadow-[0_12px_44px_rgba(0,0,0,0.26)] backdrop-blur"
      aria-label="Championship display settings"
    >
      <span className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-600">
        Layout
      </span>

      <nav
        className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-black/25 p-0.5"
        aria-label="Championship view mode"
      >
        <Link
          href="/champions/legacy?view=b"
          aria-current={selectedMode === "b" ? "page" : undefined}
          title="Basic"
          className={itemClass(selectedMode === "b")}
        >
          B
        </Link>
        <Link
          href="/champions/legacy?view=a"
          aria-current={selectedMode === "a" ? "page" : undefined}
          title="Advanced"
          className={itemClass(selectedMode === "a")}
        >
          A
        </Link>

        <div className="champions-extreme-group relative">
          <Link
            href="/champions"
            aria-current={extremeSelected ? "page" : undefined}
            title="Extreme"
            className={`block ${itemClass(extremeSelected)}`}
          >
            E
          </Link>

          <div
            className="champions-extreme-menu pointer-events-none absolute bottom-[calc(100%-1px)] right-0 z-50 flex translate-y-1 gap-1 rounded-full border border-white/[0.09] bg-slate-950/95 p-1 opacity-0 shadow-[0_14px_34px_rgba(0,0,0,0.44)] backdrop-blur transition duration-150"
            aria-label="Extreme Champions versions"
          >
            <Link
              href="/champions/legacy?view=e"
              aria-current={selectedMode === "e1" ? "page" : undefined}
              title="Extreme 1 · preserved"
              className={itemClass(selectedMode === "e1")}
            >
              E1
            </Link>
            <Link
              href="/champions/e2"
              aria-current={selectedMode === "e2" ? "page" : undefined}
              title="Extreme 2 · preserved"
              className={itemClass(selectedMode === "e2")}
            >
              E2
            </Link>
            <Link
              href="/champions"
              aria-current={selectedMode === "e3" ? "page" : undefined}
              title="Extreme 3 · current"
              className={itemClass(selectedMode === "e3")}
            >
              E3
            </Link>
            <Link
              href="/champions/e4"
              aria-current={selectedMode === "e4" ? "page" : undefined}
              title="Extreme 4 · hybrid"
              className={itemClass(selectedMode === "e4")}
            >
              E4
            </Link>
          </div>
        </div>
      </nav>
    </section>
  );
}
