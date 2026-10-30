import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
import {readPrivateStorageVisual} from "@/lib/storageVisualPrivate";
import {projectSignedFreshness,unknownSignedFreshness} from "@/lib/storageSignedFreshness";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const HEADERS={"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie"};
/** Existing signed server visual only. NEVER scans native hosts or reads keys in browser. */
export async function GET(request:NextRequest){
  const admin=await requireAdmin(request);
  if("error" in admin){
    admin.error.headers.set("Cache-Control","private, no-store, max-age=0");
    return admin.error;
  }
  const now=new Date();
  try{
    const signed=await readPrivateStorageVisual(now); // verifies server HMAC; no host action
    return NextResponse.json(projectSignedFreshness(signed,now),{headers:HEADERS});
  }catch{
    // Invalid HMAC, missing permission, unreadable receipt = no disclosure.
    return NextResponse.json({...unknownSignedFreshness(now),
      failure:"PRIVATE_SIGNED_EVIDENCE_UNAVAILABLE"},{status:503,headers:HEADERS});
  }
}
