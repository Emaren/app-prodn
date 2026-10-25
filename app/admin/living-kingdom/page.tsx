import { requireServerAdmin } from "@/lib/adminSession";
import { LivingKingdomObservatory } from "@/components/admin/living-kingdom/LivingKingdomObservatory";
export const dynamic="force-dynamic";
export const revalidate=0;
export default async function LivingKingdomAdminPage(){
 await requireServerAdmin();
 return <LivingKingdomObservatory />;
}