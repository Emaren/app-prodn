import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
import {collectSatchelFinanceDiagnostics} from "@/lib/warSatchelFinanceDiagnosticsServer";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Private aggregate diagnostics only. No IDs, hashes, wallet addresses,
 * environment values, financial mutations or automatic money recovery. */
export async function GET(request:NextRequest){
 const gate=await requireAdmin(request);if("error"in gate)return gate.error;
 const report=await collectSatchelFinanceDiagnostics({database:gate.prisma,canceled:request.signal});
 return NextResponse.json(report,{headers:{"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie"}});
}
