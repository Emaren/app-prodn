import {requireServerAdmin} from "@/lib/adminSession";
import registry from "@/config/aoe2war-os-registry.v1.json";
import KingdomConstruction from "@/components/kingdom-construction/KingdomConstruction";
export const dynamic="force-dynamic";
export default async function SystemComposerPrivatePage(){await requireServerAdmin();return <KingdomConstruction nodes={registry.subordinate_os.map(o=>({id:o.canonical_id,name:o.name,domain:o.domain,source:o.source_authorities?.[0]??null}))} roleNames={registry.supervisory_roles.map(r=>r.name)} views={registry.visual_modes.map(v=>({id:v.id,name:v.name}))} preview="ADMIN_DRY_RUN_ONLY"/>;}
