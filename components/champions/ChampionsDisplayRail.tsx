"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export type ChampionsDisplayMode = "b" | "a" | "e1" | "e2" | "e3" | "e4" | "e5";

export const CHAMPIONS_VIEW_ROUTES: Array<{
  mode: ChampionsDisplayMode;
  label: string;
  href: string;
}> = [
  { mode: "b", label: "B", href: "/champions/legacy?view=b" },
  { mode: "a", label: "A", href: "/champions/legacy?view=a" },
  { mode: "e1", label: "E1", href: "/champions/legacy?view=e" },
  { mode: "e2", label: "E2", href: "/champions/e2" },
  { mode: "e3", label: "E3", href: "/champions/e3" },
  { mode: "e4", label: "E4", href: "/champions/e4" },
  { mode: "e5", label: "E5", href: "/champions/e5" },
];

const CHAMPIONS_PREFERENCE_KEY = "aoe2war:champions:preferred-layout:v1";

export function readPreferredChampionsView(): ChampionsDisplayMode {
  if (typeof window === "undefined") return "e5";
  try {
    const saved = window.localStorage.getItem(CHAMPIONS_PREFERENCE_KEY);
    return CHAMPIONS_VIEW_ROUTES.some((entry) => entry.mode === saved)
      ? saved as ChampionsDisplayMode
      : "e5";
  } catch {
    return "e5";
  }
}

export function rememberChampionsView(view: ChampionsDisplayMode) {
  try {
    window.localStorage.setItem(CHAMPIONS_PREFERENCE_KEY, view);
  } catch {
    // A browser without storage still has fully functional version links.
  }
}

/** The canonical /champions entry defaults to E5, respecting explicit choices afterward. */
export function ChampionsPreferredViewRedirect() {
  const router = useRouter();
  useEffect(() => {
    const preferred = readPreferredChampionsView();
    if (preferred !== "e5") {
      const route = CHAMPIONS_VIEW_ROUTES.find((entry) => entry.mode === preferred);
      if (route) router.replace(route.href);
    }
  }, [router]);
  return null;
}

/** Top-right compact selector. Hover to inspect; click/tap or keyboard focus to choose. */
export function ChampionsViewCycleButton({ active }: { active: ChampionsDisplayMode }) {
  const [opened, setOpened] = useState(false);
  const current = CHAMPIONS_VIEW_ROUTES.find((entry) => entry.mode === active);
  const pathname = usePathname();
  useEffect(() => setOpened(false), [pathname]);

  return (
    <div className="group relative z-40">
      <button
        type="button"
        onClick={() => setOpened((previous) => !previous)}
        aria-expanded={opened}
        aria-haspopup="true"
        aria-label={`Current championship layout ${current?.label ?? active}. Choose a layout.`}
        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-[10px] font-black text-slate-200 transition hover:border-sky-200/35 hover:text-white"
      >
        {current?.label ?? active.toUpperCase()}
        <span aria-hidden className="text-slate-500">⌄</span>
      </button>
      <nav
        aria-label="Choose championship layout"
        className={`absolute right-0 top-full z-50 mt-1 flex min-w-[10.25rem] flex-wrap justify-end gap-1 rounded-xl border border-white/15 bg-slate-950/98 p-2 shadow-2xl backdrop-blur transition duration-150 ${opened ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"}`}
      >
        {CHAMPIONS_VIEW_ROUTES.map((entry) => (
          <Link
            key={entry.mode}
            href={entry.href}
            onClick={() => {
              rememberChampionsView(entry.mode);
              setOpened(false);
            }}
            aria-current={entry.mode === active ? "page" : undefined}
            className={`rounded-md border px-2 py-1.5 font-mono text-[10px] font-bold transition ${entry.mode === active ? "border-sky-200/45 bg-sky-300/20 text-sky-100" : "border-white/10 text-slate-300 hover:border-white/25 hover:bg-white/10 hover:text-white"}`}
          >
            {entry.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function itemClass(selected: boolean) {
  return `min-w-8 rounded-full px-2.5 py-1 text-center text-[9px] font-black uppercase tracking-[0.16em] transition ${
    selected
      ? "bg-sky-100 text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.26)]"
      : "text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
  }`;
}

/** Preserved legacy rail; new E5 uses the compact top-right picker. */
export default function ChampionsDisplayRail({ active }: { active?: ChampionsDisplayMode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedLegacy = searchParams.get("view");
  const inferred: ChampionsDisplayMode =
    pathname.includes("/champions/legacy")
      ? requestedLegacy === "b" ? "b" : requestedLegacy === "a" ? "a" : "e1"
      : pathname.includes("/champions/e2") ? "e2"
      : pathname.includes("/champions/e3") ? "e3"
      : pathname.includes("/champions/e4") ? "e4"
      : "e5";
  const selectedMode = active ?? inferred;
  const extremeSelected = selectedMode.startsWith("e");

  useEffect(() => {
    document.documentElement.dataset.championsView =
      extremeSelected ? "e" : selectedMode;
  }, [extremeSelected, selectedMode]);

  return (
    <section className="flex min-h-10 w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/70 px-3 py-1.5 shadow-[0_12px_44px_rgba(0,0,0,0.26)] backdrop-blur" aria-label="Championship display settings">
      <span className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-600">Layout</span>
      <nav className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-black/25 p-0.5" aria-label="Championship view mode">
        {CHAMPIONS_VIEW_ROUTES.slice(0, 2).map((entry) => (
          <Link key={entry.mode} href={entry.href} onClick={() => rememberChampionsView(entry.mode)} aria-current={selectedMode === entry.mode ? "page" : undefined} className={itemClass(selectedMode === entry.mode)}>
            {entry.label}
          </Link>
        ))}
        <div className="champions-extreme-group group relative">
          <Link href="/champions/e5" onClick={() => rememberChampionsView("e5")} title="Extreme" className={`block ${itemClass(extremeSelected)}`}>E</Link>
          <nav aria-label="Extreme championship layouts" className="champions-extreme-menu pointer-events-none absolute bottom-[calc(100%-1px)] right-0 z-50 flex translate-y-1 gap-1 rounded-full border border-white/[0.09] bg-slate-950/95 p-1 opacity-0 shadow-[0_14px_34px_rgba(0,0,0,0.44)] backdrop-blur transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
            {CHAMPIONS_VIEW_ROUTES.filter((entry) => entry.mode.startsWith("e")).map((entry) => (
              <Link key={entry.mode} href={entry.href} onClick={() => rememberChampionsView(entry.mode)} aria-current={selectedMode === entry.mode ? "page" : undefined} className={itemClass(selectedMode === entry.mode)}>
                {entry.label}
              </Link>
            ))}
          </nav>
        </div>
      </nav>
    </section>
  );
}
