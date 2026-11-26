import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
import {EMPTY_INTEL_COLD,readIntelColdEvidence} from "@/lib/intelColdStorageEvidence";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const HEADERS={"Cache-Control":"private, no-store, max-age=0"};

/** Owner-only signed evidence; website NEVER SSHes into Intel or runs tools. */
export async function GET(request:NextRequest){
  const admin=await requireAdmin(request);
  if("error" in admin)return admin.error;
  // PR #1410 was an obsolete UI draft, NOT a WE4 Intel-source admission.
  // Until WE4 and WE1 independently accept this exact signed-v1 purpose,
  // the fourth plane stays UNKNOWN, even if a legacy file exists on disk.
  if(process.env.AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED!=="WE4_SIGNED_V1")
    return NextResponse.json({...EMPTY_INTEL_COLD,
      reason:"INTEL_SOURCE_CONTRACT_NOT_INDEPENDENTLY_ADMITTED"}, {headers:HEADERS});
  try{
    const evidence=await readIntelColdEvidence();
    return NextResponse.json(evidence,{headers:HEADERS});
  }catch{
    return NextResponse.json({
      schema:"aoe2war.intel-cold.status.v1",
      health:"HOLD",source:"NONE",reason:"INTEL_SIGNED_EVIDENCE_REJECTED",
      authority:"READ_ONLY_NO_CLEANUP_OR_REINSTALL"
    },{status:503,headers:HEADERS});
  }
}
