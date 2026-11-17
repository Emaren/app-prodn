import {requireServerAdmin} from "@/lib/adminSession";
import StorageHogWorkbench from "@/components/storage-os/StorageHogWorkbench";

export const dynamic="force-dynamic";

/** Private owner workspace; browser gets only the bounded existing storage API. */
export default async function StorageExplorerPage(){
  await requireServerAdmin();
  return <StorageHogWorkbench/>;
}
