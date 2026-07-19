import type { Metadata } from "next";

import SpeedObservatory from "@/components/speed/SpeedObservatory";

export const metadata: Metadata = {
  title: "Your Speed Observatory · AoE2WAR",
  description: "Personal real-user speed measurements for this AoE2WAR browser session.",
};

export default function SpeedPage() {
  return <SpeedObservatory />;
}
