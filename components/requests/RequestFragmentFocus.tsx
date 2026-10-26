"use client";

import { useEffect } from "react";

/**
 * /about and /roadmap redirect to anchors within /requests. Native fragment
 * scrolling does not reliably put keyboard focus at the target after a 30x.
 * Keep the normal scroll position; move only the initial keyboard starting
 * point, and never steal focus from a user who already interacted.
 */
export default function RequestFragmentFocus() {
  useEffect(() => {
    const focusFromFragment = () => {
      const fragment = window.location.hash.slice(1);
      if (fragment !== "about" && fragment !== "roadmap") return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement) return;
      const target = document.getElementById(fragment);
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    };
    focusFromFragment();
    window.addEventListener("hashchange", focusFromFragment);
    return () => window.removeEventListener("hashchange", focusFromFragment);
  }, []);
  return null;
}
