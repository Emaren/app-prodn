import type { Metadata } from "next";

import LibraryActivityBoard from "@/components/library/LibraryActivityBoard";

export const metadata: Metadata = {
  title: "Library · AoE2WAR",
  description: "AoE2WAR live replay intake and game library activity.",
};

export default function LibraryPage() {
  return <LibraryActivityBoard />;
}
