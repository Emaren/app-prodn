"use client";

import { useReportWebVitals } from "next/web-vitals";

import { updateInitialWebVital } from "@/lib/speed/clientStore";

type WebVitalMetric = {
  name: string;
  value: number;
};

function reportWebVital(metric: WebVitalMetric) {
  updateInitialWebVital(metric.name, metric.value);
}

export default function SpeedWebVitals() {
  useReportWebVitals(reportWebVital);
  return null;
}
