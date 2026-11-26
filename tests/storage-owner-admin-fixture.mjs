/** Synthetic test-only admin gate. Never imported by production. */
import { NextResponse } from "next/server";
export async function requireAdmin(request){
  const role=request.headers.get("x-storage-fixture-role");
  if(role==="owner")return {user:{uid:"fixture-owner",isAdmin:true},prisma:null};
  if(role==="other-admin")return {user:{uid:"fixture-other-admin",isAdmin:true},prisma:null};
  if(role==="scribe")return {error:NextResponse.json({detail:"Forbidden"},{status:403})};
  return {error:NextResponse.json({detail:"Unauthorized"},{status:401})};
}
