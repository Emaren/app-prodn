"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type HeroTakeoverState = {
  active: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  title: string | null;
  linkUrl: string | null;
  expiresAt: string | null;
};

export default function HeroTakeoverSlot({ children }: { children: ReactNode }) {
  const [takeover, setTakeover] = useState<HeroTakeoverState | null>(null);

  useEffect(() => {
    let alive = true;

    fetch("/api/hero-stage-takeover", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: HeroTakeoverState) => {
        if (alive) setTakeover(payload);
      })
      .catch(() => {
        if (alive) setTakeover(null);
      });

    return () => {
      alive = false;
    };
  }, []);

  const imageUrl =
    takeover?.active && takeover.imageUrl?.startsWith("/") && !takeover.imageUrl.startsWith("//")
      ? takeover.imageUrl
      : null;

  if (!imageUrl) {
    return <>{children}</>;
  }

  const tile = (
    <section
      aria-label={takeover?.title || "AOE2WAR hero image takeover"}
      className="group relative isolate min-h-[19rem] overflow-hidden rounded-[2rem] border border-amber-200/18 bg-black shadow-[0_28px_90px_rgba(0,0,0,0.52)] sm:min-h-[27rem] lg:min-h-[34rem]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.12),transparent_46%),linear-gradient(180deg,rgba(15,23,42,0.58),rgba(0,0,0,0.94))]" />
      <Image
        src={imageUrl}
        alt={takeover?.imageAlt || takeover?.title || "AOE2WAR hero image takeover"}
        fill
        priority
        quality={100}
        unoptimized
        sizes="100vw"
        className="object-contain"
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />
    </section>
  );

  if (takeover?.linkUrl) {
    return (
      <a href={takeover.linkUrl} className="block focus:outline-none focus:ring-2 focus:ring-amber-200/70">
        {tile}
      </a>
    );
  }

  return tile;
}
