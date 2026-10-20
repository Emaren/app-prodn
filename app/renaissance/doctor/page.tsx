import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Doctor · AoE2WAR",description:"Renaissance OS · Page diagnostics. Source-bound engineering operations.",alternates:{canonical:"/renaissance/doctor"}};
export default function Page(){return <RenaissanceView mode="doctor"/>;}
