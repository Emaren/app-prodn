import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Integration Train · AoE2WAR",description:"Renaissance OS · Review and release. Source-bound engineering operations.",alternates:{canonical:"/renaissance/train"}};
export default function Page(){return <RenaissanceView mode="train"/>;}
