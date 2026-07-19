import type { SpeedSample } from "@/lib/speed/types";

export async function postSpeedSample(sample: SpeedSample) {
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
