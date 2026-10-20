import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Atlas · AoE2WAR",description:"Renaissance OS · Route cartography. Source-bound engineering operations.",alternates:{canonical:"/renaissance/atlas"}};
export default function Page(){return <RenaissanceView mode="atlas"/>;}
