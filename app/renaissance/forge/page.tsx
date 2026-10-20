import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Test Forge · AoE2WAR",description:"Renaissance OS · Tests and browser lab. Source-bound engineering operations.",alternates:{canonical:"/renaissance/forge"}};
export default function Page(){return <RenaissanceView mode="forge"/>;}
