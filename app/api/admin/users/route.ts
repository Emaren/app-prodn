import { NextResponse } from "next/server";

export async function GET() {
  try {
    const upstream = process.env.AOE2_BACKEND_UPSTREAM || process.env.BACKEND_API || "http://127.0.0.1:3330";
    const base = upstream === "." ? "http://127.0.0.1:3330" : upstream;
    const adminToken = process.env.ADMIN_TOKEN || "secretadmin";
    const res = await fetch(`${base.replace(/\/$/, "")}/api/admin/users`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("🔥 Backend fetch failed:", err);
    return new Response("Internal error", { status: 500 });
  }
}
