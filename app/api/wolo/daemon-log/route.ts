import { NextResponse } from "next/server";

// The web runtime intentionally lacks permission to read the HEL1 system journal.
// Never invoke journalctl from an anonymous public request, even if the web
// process later gains access by accident. Host logs may contain private data.
// The separate browser-only /rpc/status client provides safe public chain truth.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    ok: false,
    label: "Protected daemon journal",
    lines: [
      "[access] HEL1 daemon journal is restricted to authorized operators",
      "[chain] live block height and consensus are monitored above via /rpc/status",
      "[safety] financial settlement, custody and betting remain quarantined",
    ],
  });
}
