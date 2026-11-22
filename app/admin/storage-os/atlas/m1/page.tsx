import {requireServerAdmin} from "@/lib/adminSession";
import StorageSpatialAtlas from "@/components/storage-os/StorageSpatialAtlas";
import StorageM1PlacementBoard from "@/components/storage-os/StorageM1PlacementBoard";

export const dynamic="force-dynamic";
/** One original admin gate for the existing Atlas and its dated placement board. */
export default async function StorageAtlasPage(){
 await requireServerAdmin();
 return <>
  <StorageSpatialAtlas initialPlane="m1"/>
  <StorageM1PlacementBoard/>
 </>;
}
