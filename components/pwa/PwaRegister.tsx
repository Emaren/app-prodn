"use client";

import React from "react";

export default function PwaRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          if (cancelled) return;
          void registration.update();
          console.info("AoE2HDBets service worker ready:", registration.scope);
        })
        .catch((error) => {
          console.warn("AoE2HDBets service worker registration failed:", error);
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
