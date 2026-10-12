import type { Metadata } from "next";

import HdReplayEngine from "@/components/replay-engine/HdReplayEngine";
import { projectHdReplayEngine } from "@/lib/hdReplayEngine";
import { loadPublicParserObservatory } from "@/lib/parserObservatory";

import "./engine.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HD Replay Engine · AoE2WAR",
  description: "Watch the HD replay evidence pipeline: recorded games, verified winners, unknown results and parsing bottlenecks.",
};

export default async function HdReplayEnginePage() {
  const snapshot = await loadPublicParserObservatory()
    .then(projectHdReplayEngine)
    .catch(() => null);

  return <HdReplayEngine initial={snapshot} />;
}
