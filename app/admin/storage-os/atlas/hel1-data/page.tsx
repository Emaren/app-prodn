import {requireServerAdmin} from "@/lib/adminSession";
import StorageSpatialAtlas from "@/components/storage-os/StorageSpatialAtlas";

export const dynamic="force-dynamic";
/** Admin session is checked on the SERVER before any visual content mounts. */
export default async function StorageAtlasPage(){
 await requireServerAdmin();
 return <StorageSpatialAtlas initialPlane="hel1-data"/>;
}
