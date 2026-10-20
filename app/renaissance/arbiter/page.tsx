import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Arbiter · AoE2WAR",description:"Renaissance OS · Quality certification. Source-bound engineering operations.",alternates:{canonical:"/renaissance/arbiter"}};
export default function Page(){return <RenaissanceView mode="arbiter"/>;}
