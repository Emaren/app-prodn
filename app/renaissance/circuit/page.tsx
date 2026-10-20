import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Circuit · AoE2WAR",description:"Renaissance OS · Dependency engine. Source-bound engineering operations.",alternates:{canonical:"/renaissance/circuit"}};
export default function Page(){return <RenaissanceView mode="circuit"/>;}
