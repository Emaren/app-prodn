"use client";

import { useEffect, useState } from "react";

type ChampionsView = "b" | "a" | "e";

const STORAGE_KEY = "aoe2war:champions-view";
const VIEWS: ChampionsView[] = ["b", "a", "e"];

function isChampionsView(value: string | null): value is ChampionsView {
  return value === "b" || value === "a" || value === "e";
}

function applyChampionsView(view: ChampionsView) {
  document.documentElement.dataset.championsView = view;
}

export default function ChampionsViewToggle() {
  const [view, setView] = useState<ChampionsView>("e");

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved = isChampionsView(raw) ? raw : "e";

    setView(saved);
    applyChampionsView(saved);
  }, []);

  function choose(next: ChampionsView) {
    setView(next);
    applyChampionsView(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <div
      className="absolute right-4 top-4 z-30 rounded-full border border-white/16 bg-slate-950/72 p-1 shadow-[0_16px_44px_rgba(0,0,0,0.42)] backdrop-blur sm:right-5 sm:top-5"
      aria-label="Championship view"
    >
      <div className="flex items-center gap-1">
        {VIEWS.map((option) => {
          const active = option === view;

          return (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              className={`h-7 min-w-7 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.22em] transition ${
                active
                  ? "bg-amber-100 text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.32)]"
                  : "text-slate-400 hover:bg-white/8 hover:text-slate-100"
              }`}
              aria-pressed={active}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
