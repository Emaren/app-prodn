import type { Metadata } from "next";
import RenaissanceView from "@/components/renaissance/RenaissanceView";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Vault · AoE2WAR",description:"Renaissance OS · Evidence memory. Source-bound engineering operations.",alternates:{canonical:"/renaissance/vault"}};
export default function Page(){return <RenaissanceView mode="vault"/>;}
