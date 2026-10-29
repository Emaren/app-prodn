import { requireServerAdmin } from "@/lib/adminSession";
import CentralCommandView from "@/components/central-command/CentralCommandView";
export const dynamic="force-dynamic";
export default async function CentralCommandPrivatePage(){
 await requireServerAdmin();
 return <CentralCommandView/>;
}
