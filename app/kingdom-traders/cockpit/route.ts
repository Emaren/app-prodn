import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Authenticated owner-only entrypoint into the existing website public route.
 * This is NOT an extra public page or additional runtime. It does not emit
 * private telemetry; only the separately authenticated GET bridge can do so. */
export async function GET(request: NextRequest) {
  const owner = await requireAdmin(request);
  if ("error" in owner) {
    owner.error.headers.set("Cache-Control", "private, no-store");
    owner.error.headers.set("Vary", "Cookie");
    return owner.error;
  }
  return NextResponse.redirect(new URL("/kingdom-traders#cockpit",request.url),{
    status:303,
    headers:{"Cache-Control":"private, no-store","Vary":"Cookie"},
  });
}
