import "server-only";
import {stat,statfs} from "node:fs/promises";
import ownerM1 from "../config/storage-atlas-m1-native-observation-20261122.v1.json";
import type {AtlasCapacityObservation} from "./storageAtlasMosaic";

/** Only metadata of the two known HEL1 mounts; never a directory scan.
 * The read is *unverified* host statfs, not an Ed25519 capacity receipt.
 * On a runner or a mismounted host fail closed to no HEL1 readings.
 */
const ROOT="/";
const DATA="/mnt/HC_Volume_105319120";
const safe=(v:bigint)=>v>=BigInt(0)&&v<=BigInt(Number.MAX_SAFE_INTEGER)?Number(v):null;

function sample(id:"hel1-root"|"hel1-data",raw:Awaited<ReturnType<typeof statfs>>,
 at:string):AtlasCapacityObservation|null{
 const b=BigInt(raw.bsize),total=safe(b*BigInt(raw.blocks)),
   used=safe(b*(BigInt(raw.blocks)-BigInt(raw.bfree))),
   available=safe(b*BigInt(raw.bavail)),
   reserved=safe(b*(BigInt(raw.bfree)-BigInt(raw.bavail)));
 if(total===null||used===null||available===null||reserved===null||total<=0||
   total!==used+available+reserved)return null;
 return {id,observedAt:at,source:"NATIVE_HEL1_STATFS_UNCERTIFIED",
   deviceIdentity:id==="hel1-root"?"HEL1 root mount":"HEL1 mounted data volume",
   totalBytes:total,usedBytes:used,availableBytes:available,reservedBytes:reserved};
}

function ownerDatedM1():AtlasCapacityObservation|null{
 if(ownerM1.schema!=="aoe2war.storage-atlas.dated-native-capacity.v1"||
    ownerM1.surface!=="m1"||ownerM1.independentlySigned!==false||
    ownerM1.categoryAuthority!==false||ownerM1.reclaimAuthority!==false)return null;
 return {id:"m1",source:"OWNER_M1_APFS_DATED_UNCERTIFIED",
   observedAt:ownerM1.observedAt,deviceIdentity:ownerM1.deviceIdentity,
   totalBytes:ownerM1.totalBytes,usedBytes:ownerM1.usedBytes,
   availableBytes:ownerM1.availableBytes,reservedBytes:ownerM1.reservedBytes};
}

/** An owner-visible *dated* observation remains inspectable when old;
 * freshness is computed by the projector. It is never source-signature proof.
 * Intel is intentionally absent until its independent observer supplies data.
 */
export async function readAtlasNativeCapacityObservations():Promise<AtlasCapacityObservation[]>{
 const m1=ownerDatedM1();
 const readings:AtlasCapacityObservation[]=m1?[m1]:[];
 if(process.platform!=="linux")return readings;
 try{
   const [rootMeta,dataMeta,rootStat,dataStat]=await Promise.all([
     stat(ROOT),stat(DATA),statfs(ROOT),statfs(DATA)
   ]);
   if(!rootMeta.isDirectory()||!dataMeta.isDirectory()||
      rootMeta.dev===dataMeta.dev)return readings;
   const at=new Date().toISOString();
   const root=sample("hel1-root",rootStat,at),data=sample("hel1-data",dataStat,at);
   if(root&&data)readings.unshift(root,data);
 }catch{/* Missing mount or permission: leave UNKNOWN, never infer /dev mapping. */}
 return readings;
}
