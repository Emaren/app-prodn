import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Marshal · AoE2WAR",description:"Renaissance OS · Coordination authority. Source-bound engineering operations.",alternates:{canonical:"/renaissance/marshal"}};
export default function Page(){return <RenaissanceView mode="marshal"/>;}
