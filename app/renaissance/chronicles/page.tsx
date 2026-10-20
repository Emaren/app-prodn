import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Chronicles · AoE2WAR",description:"Renaissance OS · Engineering memory. Source-bound engineering operations.",alternates:{canonical:"/renaissance/chronicles"}};
export default function Page(){return <RenaissanceView mode="chronicles"/>;}
