import type { SpeedSample } from "@/lib/speed/types";

export async function postSpeedSample(sample: SpeedSample) {
  // Only the isolated Renaissance 88 read-only browser fixture sets this
  // build-time flag. Production telemetry behavior remains unchanged.
  if (process.env.NEXT_PUBLIC_REN88_READONLY_PREVIEW === "1") return;
  try {
    await fetch("/api/speed/sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sample),
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    // Speed telemetry is deliberately fail-open. It must never affect product UX.
  }
}
