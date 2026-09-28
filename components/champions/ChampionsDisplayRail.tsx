"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export type ChampionsDisplayMode = "b" | "a" | "e1" | "e2";

const OPTIONS: Array<{
  mode: ChampionsDisplayMode;
  label: string;
  href: string;
}> = [
  { mode: "b", label: "B", href: "/champions/legacy?view=b" },
  { mode: "a", label: "A", href: "/champions/legacy?view=a" },
  { mode: "e1", label: "E1", href: "/champions/legacy?view=e" },
  { mode: "e2", label: "E2", href: "/champions" },
];

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
      : "e2";
  const selectedMode = active ?? inferred;

  useEffect(() => {
    document.documentElement.dataset.championsView =
      selectedMode === "e1" || selectedMode === "e2" ? "e" : selectedMode;
  }, [selectedMode]);

  return (
    <section
      className="flex min-h-10 w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/70 px-3 py-1.5 shadow-[0_12px_44px_rgba(0,0,0,0.26)] backdrop-blur"
      aria-label="Championship display settings"
    >
      <span className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-600">
        Display
      </span>

      <div className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-black/25 p-0.5">
        {OPTIONS.map((option) => {
          const selected = option.mode === selectedMode;
          return (
            <Link
              key={option.mode}
              href={option.href}
              aria-current={selected ? "page" : undefined}
              title={
                option.mode === "e2"
                  ? "Current Champions E2"
                  : `Preserved Champions ${option.label}`
              }
              className={`min-w-8 rounded-full px-2.5 py-1 text-center text-[9px] font-black uppercase tracking-[0.16em] transition ${
                selected
                  ? "bg-amber-100 text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.26)]"
                  : "text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
