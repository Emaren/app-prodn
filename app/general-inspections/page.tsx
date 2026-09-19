import type { Metadata } from "next";

import GeneralInspections from "@/components/general-inspections/GeneralInspections";

export const metadata: Metadata = {
  title: "General Inspections · AoE2WAR",
  description:
    "Live kingdom readiness scores for speed, documentation, storage, tests, release integrity, security, and data truth.",
};

export default function GeneralInspectionsPage() {
  return <GeneralInspections />;
}
