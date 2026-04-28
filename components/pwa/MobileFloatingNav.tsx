"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeDollarSign,
  ChevronDown,
  ChevronUp,
  Coins,
  GripHorizontal,
  Radio,
  Swords,
  UserCircle,
} from "lucide-react";

export const APP_NAV_ITEMS = [
  { href: "/live-games", label: "Live", icon: Radio },
  { href: "/challenge", label: "Challenge", icon: Swords },
  { href: "/bets", label: "Bets", icon: BadgeDollarSign },
  { href: "/wolo", label: "WOLO", icon: Coins },
  { href: "/profile", label: "Profile", icon: UserCircle },
] as const;

type NavMode = "normal" | "expanded" | "hidden";

const STORAGE_KEY = "aoe2hdbets.mobileNav.mode.v1";

function readMode(): NavMode {
  if (typeof window === "undefined") return "normal";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "expanded" || stored === "hidden" ? stored : "normal";
}

export default function MobileFloatingNav() {
  const pathname = usePathname();
  const [mode, setMode] = React.useState<NavMode>("normal");
  const touchStartY = React.useRef<number | null>(null);

  React.useEffect(() => {
    setMode(readMode());
  }, []);

  const setStoredMode = (nextMode: NavMode) => {
    setMode(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    touchStartY.current = event.clientY;
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const startY = touchStartY.current;
    touchStartY.current = null;
    if (startY === null) return;

    const deltaY = event.clientY - startY;
    if (deltaY > 24) {
      setStoredMode("hidden");
    } else if (deltaY < -24) {
      setStoredMode("expanded");
    }
  };

  if (mode === "hidden") {
    return (
      <button
        type="button"
        onClick={() => setStoredMode("normal")}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.6rem)] left-1/2 z-[95] inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-slate-950/90 px-4 py-2 text-xs font-semibold text-slate-200 shadow-[0_18px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl transition hover:border-white/20 lg:hidden"
        aria-label="Show app navigation"
        title="Show app navigation"
      >
        <ChevronUp className="h-3.5 w-3.5" />
        Menu
      </button>
    );
  }

  const expanded = mode === "expanded";

  return (
    <div
      className={`fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.6rem)] z-[95] rounded-[16px] border border-white/10 bg-slate-950/[0.92] shadow-[0_18px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl transition lg:hidden ${
        expanded ? "p-2.5" : "p-1.5"
      }`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className="mb-1 flex items-center justify-between px-2">
        <button
          type="button"
          onClick={() => setStoredMode(expanded ? "normal" : "expanded")}
          className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500"
          aria-label={expanded ? "Make app navigation smaller" : "Make app navigation bigger"}
          title={expanded ? "Make smaller" : "Make bigger"}
        >
          <GripHorizontal className="h-3.5 w-3.5" />
          {expanded ? "War Room" : ""}
        </button>
        <button
          type="button"
          onClick={() => setStoredMode("hidden")}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-400 transition hover:text-white"
          aria-label="Hide app navigation"
          title="Hide app navigation"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <nav className="grid grid-cols-5 gap-1">
        {APP_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={`flex flex-col items-center justify-center gap-1 rounded-[11px] font-semibold transition ${
                expanded ? "min-h-[4.45rem] px-1.5 py-2 text-xs" : "min-h-[3.3rem] px-1 py-1.5 text-[11px]"
              } ${
                active
                  ? "border border-sky-200/20 bg-sky-300/15 text-sky-100"
                  : "border border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <Icon className={expanded ? "h-5 w-5" : "h-4 w-4"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
