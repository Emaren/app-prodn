"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type HeroTakeoverState = {
  active: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  title: string | null;
  linkUrl: string | null;
  startsAt: string | null;
  expiresAt: string | null;
};

function safeHref(value: string | null) {
  if (!value) return null;

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export default function HeroTakeoverSlot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HeroTakeoverState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/hero-stage-takeover", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as HeroTakeoverState | null;

        if (!cancelled && response.ok) {
          setState(payload);
        }
      })
      .catch(() => {
        if (!cancelled) setState(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <>{children}</>;
  }

  if (!state?.active || !state.imageUrl) {
    return <>{children}</>;
  }

  const href = safeHref(state.linkUrl);
  const alt = state.imageAlt || state.title || "AoE2WAR hero image";
  const label = state.title || "Open AoE2WAR hero dispatch";

  const visual = (
    <>
      <img
        src={state.imageUrl}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.006]"
        draggable={false}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_68%_18%,rgba(251,191,36,0.10),transparent_34%),linear-gradient(90deg,rgba(2,6,23,0.12),rgba(2,6,23,0.02)_48%,rgba(2,6,23,0.18))]" />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/24 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/46 to-transparent" />

      {href ? (
        <div className="absolute bottom-4 right-4 rounded-full border border-white/14 bg-black/45 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/88 shadow-[0_12px_28px_rgba(0,0,0,0.30)] backdrop-blur-md transition group-hover:border-amber-200/40 group-hover:text-amber-50 sm:bottom-5 sm:right-5">
          Open the dispatch ↗
        </div>
      ) : null}
    </>
  );

  const frameClass =
    "absolute inset-0 z-10 overflow-hidden rounded-[2rem] border border-amber-200/18 bg-black shadow-[0_28px_90px_rgba(0,0,0,0.52)]";

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none select-none opacity-0">
        {children}
      </div>

      {href ? (
        <Link href={href} aria-label={label} className={`${frameClass} group block`}>
          {visual}
        </Link>
      ) : (
        <div aria-label={label} className={`${frameClass} group`}>
          {visual}
        </div>
      )}
    </div>
  );
}
