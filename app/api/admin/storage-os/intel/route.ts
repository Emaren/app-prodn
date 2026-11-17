import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
import {readIntelColdEvidence} from "@/lib/intelColdStorageEvidence";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const HEADERS={"Cache-Control":"private, no-store, max-age=0"};

/** Owner-only signed evidence; website NEVER SSHes into Intel or runs tools. */
export async function GET(request:NextRequest){
  const admin=await requireAdmin(request);
  if("error" in admin)return admin.error;
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
