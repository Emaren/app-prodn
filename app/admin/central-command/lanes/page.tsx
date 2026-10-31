import {requireServerAdmin} from "@/lib/adminSession";
import {WorkObservatoryClient} from "@/components/central-command/WorkObservatoryClient";
export const dynamic="force-dynamic";
export default async function LaneLedgerPage(){await requireServerAdmin();return <WorkObservatoryClient mode="lanes"/>;}
