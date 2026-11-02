import Link from "next/link";
import registry from "@/config/aoe2war-os-registry.v1.json";
import KingdomConstruction from "@/components/kingdom-construction/KingdomConstruction";
export const dynamic="force-dynamic";
export const metadata={title:"Kingdom Construction · Source Truth",description:"Public-safe source-bound engineering graph; no autonomous worker claims."};
export default function Page(){return <KingdomConstruction nodes={registry.subordinate_os.map(o=>({id:o.canonical_id,name:o.name,domain:o.domain,source:o.source_authorities?.[0]??null}))} roleNames={registry.supervisory_roles.map(r=>r.name)} views={registry.visual_modes.map(v=>({id:v.id,name:v.name}))} preview="PUBLIC_SOURCE_ONLY"/>;}
