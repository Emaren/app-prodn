import type { Metadata } from "next";

import TournamentBracketExperience from "@/components/tournaments/TournamentBracketExperience";

export const metadata: Metadata = {
  title: "Tournaments · AoE2WAR",
  description: "AoE2WAR tournament bracket command surface.",
};

export default function TournamentsPage() {
  return <TournamentBracketExperience />;
}
