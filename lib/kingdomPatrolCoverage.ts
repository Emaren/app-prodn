/** Route patrol policy only. This module does not run agents or certify checks. */
import routes from "@/config/kingdom-index-routes.json";
import assurance from "@/config/kingdom-index-assurance-profiles.json";
import patrols from "@/config/kingdom-patrol-disciplines.json";

const shared = ["source", "performance", "security", "truth", "browser", "release"] as const;
const specialized: Record<string, readonly string[]> = {
  betting: ["treasury"],
  battlerecords: ["replay"],
  challenges: ["replay", "treasury"],
  rankings: ["replay"],
  citizen: ["replay"],
};
const allIds = new Set(patrols.disciplines.map(item => item.id));

export type KingdomPatrolAssignment = {
  href: string;
  profile: string;
  disciplines: string[];
  status: "POLICY_ONLY";
  lastVerifiedAt: null;
  receipt: null;
};

export function kingdomPatrolCoverage() {
  const entries: KingdomPatrolAssignment[] = routes.map(route => {
    const profile = (assurance.routeProfiles as Record<string, string>)[route.href] ?? "unclassified";
    const disciplines = [...new Set([...shared, ...(specialized[profile] ?? [])])];
    return { href: route.href, profile, disciplines, status: "POLICY_ONLY", lastVerifiedAt: null, receipt: null };
  });
  return {
    schema: 1 as const,
    policyVersion: patrols.version,
    scope: "registered-public-route-templates",
    disclaimer: "Policy coverage is not evidence that a process is running or a route has passed a security audit.",
    registered: entries.length,
    assigned: entries.filter(entry => entry.profile !== "unclassified" && entry.disciplines.every(id => allIds.has(id))).length,
    agentsRunning: null,
    entries,
  };
}
