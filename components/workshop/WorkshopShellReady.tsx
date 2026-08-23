"use client";

import { useEffect } from "react";

import { publishExplicitSpeedReady } from "@/lib/speed/readiness";

export default function WorkshopShellReady() {
  useEffect(() => {
    publishExplicitSpeedReady("/workshop");
  }, []);

  return null;
}
