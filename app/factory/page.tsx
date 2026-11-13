import type { Metadata } from "next";
import FactoryConsole from "./FactoryConsole";

export const metadata: Metadata = {
  title: "War Factory V1 · Release Observatory",
  description: "Public, read-only visualization of the AoE2WAR website release pipeline. Unknown signals stay unknown.",
  alternates: { canonical: "/factory" },
  robots: { index: true, follow: true },
};

export default function FactoryPage() {
  return <FactoryConsole />;
}
