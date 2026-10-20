import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Sentinel · AoE2WAR",description:"Renaissance OS · Regression patrol. Source-bound engineering operations.",alternates:{canonical:"/renaissance/sentinel"}};
export default function Page(){return <RenaissanceView mode="sentinel"/>;}
