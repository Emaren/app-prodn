import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
import {readAoe2OsStorageEvidence} from "@/lib/aoe2Os";
import {readAuthenticatedStorageAtlas} from "@/lib/aoe2StorageAtlasServer";
import {projectPrivateStorage} from "@/lib/storageCommandCenterProjection";
import {readPrivateStorageVisual} from "@/lib/storageVisualPrivate";
import {readIntelColdEvidence} from "@/lib/intelColdStorageEvidence";
import {projectStorageAtlas} from "@/lib/storageAtlasMosaic";
import {readRuntimeCohort} from "@/lib/storageAtlasGenerationCohortServer";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const HEADERS={"Cache-Control":"private, no-store, max-age=0",
  "X-Content-Type-Options":"nosniff"};

/** One private bounded read projection for five pages. No page GET may
 * perform a directory census, SSH, spawn, transfer, cleanup or owner write.
 * Independent admission of Intel is *not* inherited from HMAC Bridge.
 */
export async function GET(request:NextRequest){
 const admin=await requireAdmin(request);
 if("error" in admin)return admin.error;
 try{
   const [dashboard,signed,visual]=await Promise.all([
     readAoe2OsStorageEvidence(),
     readAuthenticatedStorageAtlas(),
     readPrivateStorageVisual()
   ]);
   const main=projectPrivateStorage(dashboard,signed,new Date(),visual);
   const intel=process.env.AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED===
     "WE2_ED25519_DERIVED_V1"?await readIntelColdEvidence():null;
   // An owner-private digest-pinned source is not an independent host signer;
   // source-only cohort remains visibly separate from signed gross disk tiles.
   const runtimeCohort=await readRuntimeCohort();
   return NextResponse.json({...projectStorageAtlas(main,intel),
     rootRuntimeCohort:runtimeCohort},{headers:HEADERS});
 }catch{
   // An invalid signed source is not converted into a fabricated empty disk.
   return NextResponse.json({detail:"ATLAS_SOURCE_NOT_ADMITTED"},{
     status:503,headers:HEADERS});
 }
}
