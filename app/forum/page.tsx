import type { Metadata } from "next";

import ForumWarRoom from "@/components/forum/ForumWarRoom";

export const metadata: Metadata = {
  title: "War Room Forum",
  description:
    "The AoE2WAR War Room: Wolo Chronicles, replay analysis, strategy, champions, bounties, and community dispatches.",
};

export default function ForumPage() {
  return <ForumWarRoom />;
}
