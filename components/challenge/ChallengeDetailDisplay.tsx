"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChallengeLayout } from "@/lib/challengePresentation";
import ChallengeDisplayRail, { useChallengeDisplay } from "@/components/challenge/ChallengeDisplayRail";
import ChallengeChampionshipState from "@/components/challenge/ChallengeChampionshipState";
import useChallengeClock from "@/components/challenge/useChallengeClock";
import { useUserAuth } from "@/context/UserAuthContext";
import type { ChampionshipProjection } from "@/lib/challengeChampionshipProtocol";

export default function ChallengeDetailDisplay({ children, requestedLayout, requestedVersion, renderedLayout, championship, serverNow }: {
  children: ReactNode; requestedLayout?: string; requestedVersion?: string;
  renderedLayout: ChallengeLayout; championship: ChampionshipProjection | null; serverNow: string;
}) {
  const { isAuthenticated } = useUserAuth();
  const display = useChallengeDisplay(requestedLayout, requestedVersion);
  const { nowMs } = useChallengeClock(serverNow);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (display.layout === renderedLayout) return;
    const params = new URLSearchParams(search.toString());
    params.set("view", display.layout);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }, [display.layout, renderedLayout, pathname, router, search]);
  return (
    <div data-challenge-version={display.version} data-challenge-layout={display.layout} className="challenge-detail-display">
      {championship && !isAuthenticated ? <div className="relative z-10 mx-auto mt-6 max-w-[112rem] px-4 sm:px-6 lg:px-8"><ChallengeChampionshipState championship={championship} nowMs={nowMs} /></div> : null}
      {children}
      <div className="relative z-10 mx-auto mb-6 max-w-[112rem] px-4 sm:px-6 lg:px-8"><ChallengeDisplayRail layout={display.layout} version={display.version} onChange={display.change} /></div>
      <style jsx global>{`
        .challenge-detail-display[data-challenge-version="2"] [data-challenge-legacy-toggle] { display: none; }
        .challenge-detail-display[data-challenge-layout="basic"] [data-challenge-detail-level="advanced"] { display: none; }
        .challenge-detail-display[data-challenge-layout="basic"] [data-challenge-protocol] { display: none; }
        .challenge-detail-display[data-challenge-layout="advanced"] [data-challenge-hero] { box-shadow: none; }
      `}</style>
    </div>
  );
}
