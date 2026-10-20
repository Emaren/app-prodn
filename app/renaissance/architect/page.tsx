import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Architect · AoE2WAR",description:"Renaissance OS · Planning and workshop. Source-bound engineering operations.",alternates:{canonical:"/renaissance/architect"}};
export default function Page(){return <RenaissanceView mode="architect"/>;}
