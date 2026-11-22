import "server-only";
import {createHash} from "node:crypto";
import {open} from "node:fs/promises";
import {constants} from "node:fs";
import {
  WE4_COHORT_SOURCE_BYTES,WE4_COHORT_SOURCE_SHA256,
  projectValidatedRuntimeCohort,unknownRuntimeCohort,
  type RootRuntimeCohort
} from "./storageAtlasGenerationCohort";
const ROOT_RUNTIME_COHORT_SOURCE=
 "/run/private/aoe2war-storage-atlas/we4-hel1-actual-generations-20261122T0425Z.json";
const SOURCE_GATE="WE4_DIGEST_PINNED_SOURCE_ONLY_20261122";
const MAX_FILE=32768;
/** Owner-controlled receiver enrollment is deliberately OFF by default.
 * Only the exact pinned, bounded, regular, non-world-readable local source
 * may be projected. No arbitrary path supplied by the browser or env.
 */
export async function readRuntimeCohort(now:Date=new Date()):Promise<RootRuntimeCohort>{
 if(process.env.AOE2WAR_ATLAS_WE4_RUNTIME_COHORT_GATE!==SOURCE_GATE)
   return unknownRuntimeCohort();
 let file;
 try{
  file=await open(ROOT_RUNTIME_COHORT_SOURCE,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const stat=await file.stat();
  if(!stat.isFile()||stat.nlink!==1||stat.size!==WE4_COHORT_SOURCE_BYTES||
     stat.size>MAX_FILE||(stat.mode&0o007)!==0)
    return unknownRuntimeCohort("PRIVATE_SOURCE_MODE_OR_LENGTH_HOLD");
  const bytes=await file.readFile();
  if(bytes.length!==WE4_COHORT_SOURCE_BYTES||
      createHash("sha256").update(bytes).digest("hex")!==WE4_COHORT_SOURCE_SHA256)
    return unknownRuntimeCohort("WE4_PINNED_DIGEST_MISMATCH");
  return projectValidatedRuntimeCohort(JSON.parse(bytes.toString("utf8")),now);
 }catch{return unknownRuntimeCohort("WE4_PRIVATE_COHORT_UNAVAILABLE_OR_INVALID");}
 finally{await file?.close().catch(()=>{});}
}
