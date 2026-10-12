import type { GeneralInspectionsSnapshot } from "./types.ts";

/** Format only the already-public, redacted inspection snapshot. Never regenerate proof. */
export function formatInspectionEvidence(snapshot: GeneralInspectionsSnapshot): string {
  const lines: string[] = [
    `AOE2WAR General Inspections: ${snapshot.overallScore}/100`,
    `Release: ${snapshot.releaseSha || "unknown"}`,
    `Build: ${snapshot.buildVersion || "unknown"}`,
    `Snapshot generated: ${snapshot.generatedAt}`,
  ];
  for (const category of snapshot.categories) {
    lines.push(`\n${category.title}: ${category.score}/100`);
    for (const check of category.checks) {
      if (check.earned + 0.01 >= check.weight) continue;
      lines.push(
        `  ${check.id}: ${check.earned}/${check.weight} | ${check.detail} | evidence ${check.evidenceAt || "unavailable"}`,
      );
    }
  }
  for (const note of snapshot.notes) lines.push(`NOTE: ${note}`);
  return lines.join("\n");
}

export function formatInspectionJson(snapshot: GeneralInspectionsSnapshot): string {
  // Serialize only the sanitized snapshot already loaded by the public page.
  // Do not refetch, invoke operator actions, or add privileged evidence.
  return JSON.stringify(snapshot, null, 2);
}
