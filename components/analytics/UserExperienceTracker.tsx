"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useUserAuth } from "@/context/UserAuthContext";

async function postActivity(payload: Record<string, unknown>) {
  try {
    await fetch("/api/user/experience", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (error) {
    console.warn("User activity tracking failed:", error);
  }
}

export default function UserExperienceTracker() {
  const pathname = usePathname();
  const { uid, isAuthenticated } = useUserAuth();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !uid || !pathname) {
      return;
    }

    if (lastTrackedPathRef.current === pathname) {
      return;
    }

    lastTrackedPathRef.current = pathname;
    void postActivity({
      type: "page_view",
      path: pathname,
      label: pathname,
      dedupeWithinSeconds: 300,
    });
  }, [isAuthenticated, pathname, uid]);

  return null;
}
