import Link from "next/link";
import {requireServerAdmin} from "@/lib/adminSession";
import StorageSpatialAtlas from "@/components/storage-os/StorageSpatialAtlas";

export const dynamic="force-dynamic";
/** Admin session is checked on the SERVER before any visual content mounts. */
export default async function StorageAtlasPage(){
 await requireServerAdmin();
 return <>
  <nav className="border-b border-slate-700 bg-slate-950 px-5 py-3 text-sm">
   <Link href="/admin/storage-os/atlas/m1/placement"
      className="font-semibold text-cyan-300 hover:underline">
    M1 source-backed placement review · dated / partial / read-only
   </Link>
  </nav>
  <StorageSpatialAtlas initialPlane="m1"/>
 </>;
}
