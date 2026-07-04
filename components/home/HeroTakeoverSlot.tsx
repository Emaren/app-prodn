"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";

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

  const hero = (
    <article className="group relative isolate overflow-hidden rounded-[1.75rem] border border-amber-200/24 bg-[#030712] shadow-[0_28px_90px_rgba(0,0,0,0.42)] sm:rounded-[2rem]">
      <div className="relative min-h-[15.5rem] sm:min-h-[22rem] lg:min-h-[27rem] xl:min-h-[31rem]">
        <img
          src={state.imageUrl}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.015]"
          draggable={false}
        />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(251,191,36,0.12),transparent_34%),linear-gradient(90deg,rgba(2,6,23,0.30),rgba(2,6,23,0.04)_46%,rgba(2,6,23,0.22))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#030712]/65 to-transparent" />

        <div className="absolute left-4 top-4 rounded-full border border-amber-200/28 bg-black/45 px-3 py-1 text-[9px] font-black uppercase tracking-[0.24em] text-amber-100 shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur-md sm:left-5 sm:top-5">
          One-image hero
        </div>

        {href ? (
          <div className="absolute bottom-4 right-4 rounded-full border border-white/14 bg-black/45 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/88 shadow-[0_12px_28px_rgba(0,0,0,0.30)] backdrop-blur-md transition group-hover:border-amber-200/40 group-hover:text-amber-50 sm:bottom-5 sm:right-5">
            Open the dispatch ↗
          </div>
        ) : null}
      </div>
    </article>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {hero}
      </Link>
    );
  }

  return hero;
}
