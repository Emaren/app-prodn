import Link from "next/link";

import type { PageHeroView } from "@/lib/pageHeroes";

const OPTIONS: Array<{ view: PageHeroView; label: string; title: string }> = [
  { view: "basic", label: "B", title: "Basic" },
  { view: "advanced", label: "A", title: "Advanced" },
  { view: "extreme", label: "E", title: "Extreme" },
];

export default function PageHeroViewToggle({
  view,
  basePath,
}: {
  view: PageHeroView;
  basePath: string;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-black/45 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.26)] backdrop-blur-xl">
      {OPTIONS.map((option) => {
        const active = option.view === view;
        return (
          <Link
            key={option.view}
            href={`${basePath}?view=${option.view}`}
            scroll={false}
            title={`${option.title} view`}
            aria-label={`${option.title} view`}
            className={`grid h-8 w-8 cursor-pointer place-items-center rounded-full text-[10px] font-black transition ${
              active
                ? "bg-amber-300 text-slate-950 shadow-[0_10px_26px_rgba(251,191,36,0.24)]"
                : "text-slate-400 hover:bg-white/8 hover:text-white"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
