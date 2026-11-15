import {requireServerAdmin} from "@/lib/adminSession";
import {WorkObservatoryClient} from "@/components/central-command/WorkObservatoryClient";
import {WorkEnvironmentObservatory} from "@/components/admin/work-environments/WorkEnvironmentObservatory";
export const dynamic="force-dynamic";
export default async function LaneLedgerPage(){
  await requireServerAdmin();
  return <><WorkObservatoryClient mode="lanes"/><WorkEnvironmentObservatory/></>;
}
