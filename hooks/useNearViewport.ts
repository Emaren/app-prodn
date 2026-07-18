"use client";

import { useEffect, useRef, useState } from "react";

export function useNearViewport<T extends HTMLElement>(rootMargin = "600px") {
  const ref = useRef<T | null>(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    if (isNear) return;

    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setIsNear(true);
        observer.disconnect();
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isNear, rootMargin]);

  return { ref, isNear };
}
