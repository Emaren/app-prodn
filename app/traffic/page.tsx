import PremiumTimeSeriesChart, {
  type ObservatorySeries,
} from "@/components/observatory/PremiumTimeSeriesChart";
import {
  loadPublicTraffic,
  type PublicTrafficPoint,
} from "@/lib/publicTraffic";

const SERIES: ObservatorySeries[] = [
  {
    key: "totalTraffic",
    label: "Total Traffic",
    color: "#f5c65b",
    axis: "count",
    defaultVisible: true,
  },
  {
    key: "suspectedHuman",
    label: "Potential Humans",
    color: "#5aa9ff",
    axis: "secondaryCount",
    defaultVisible: true,
  },
  {
    key: "confirmedHuman",
    label: "Confirmed Humans",
    color: "#42f1b5",
    axis: "secondaryCount",
    defaultVisible: true,
  },
];

export const dynamic = "force-dynamic";

export default async function TrafficPage() {
  let points: PublicTrafficPoint[] = [];
  let failed = false;

  try {
    points = (await loadPublicTraffic()).points;
  } catch (error) {
    failed = true;
    console.error("Traffic page preload failed:", error);
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#02070d] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.12),transparent_27%),radial-gradient(circle_at_82%_0%,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(245,158,11,0.07),transparent_38%)]" />

      <div className="relative mx-auto max-w-[1900px] px-3 py-5 sm:px-5 lg:px-8">
        {points.length ? (
          <PremiumTimeSeriesChart
            title="Traffic"
            points={points}
            series={SERIES}
            variant="traffic"
          />
        ) : (
          <div className="min-h-[80vh] rounded-[2.5rem] border border-white/[0.06] bg-white/[0.025]" />
        )}

        {failed ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-600">
            Unavailable
          </div>
        ) : null}
      </div>
    </main>
  );
}
