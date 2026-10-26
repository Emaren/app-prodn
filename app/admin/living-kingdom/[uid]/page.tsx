import { requireServerAdmin } from "@/lib/adminSession";
import { LivingKingdomWarriorHistory } from "@/components/admin/living-kingdom/LivingKingdomWarriorHistory";
export const dynamic="force-dynamic";
export const revalidate=0;
export default async function WarriorPage({params}:{params:Promise<{uid:string}>}){
 await requireServerAdmin();
 const {uid}=await params;
 return <LivingKingdomWarriorHistory uid={uid}/>;
}