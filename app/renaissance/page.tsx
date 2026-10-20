import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Renaissance OS · AoE2WAR",description:"Renaissance OS · Campaign command. Source-bound engineering operations.",alternates:{canonical:"/renaissance"}};
export default function Page(){return <RenaissanceView mode="command"/>;}
