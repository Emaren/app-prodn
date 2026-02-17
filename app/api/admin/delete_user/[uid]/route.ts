import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ uid: string }>;
};

function resolveAdminToken() {
  const token = process.env.ADMIN_TOKEN;
  if (token) return token;
  if (process.env.NODE_ENV !== "production") return "secretadmin";
  return null;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { uid } = await context.params;
  if (!uid?.trim()) {
    return NextResponse.json({ detail: "Missing uid" }, { status: 400 });
  }

  try {
    const upstream = process.env.AOE2_BACKEND_UPSTREAM || process.env.BACKEND_API || "http://127.0.0.1:3330";
    const base = (upstream === "." ? "http://127.0.0.1:3330" : upstream).replace(/\/$/, "");
    const adminToken = resolveAdminToken();
    if (!adminToken) {
      return NextResponse.json({ detail: "ADMIN_TOKEN is not configured" }, { status: 500 });
    }

    const response = await fetch(`${base}/api/admin/delete_user/${encodeURIComponent(uid)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      cache: "no-store",
    });

    const payload = await response.text();
    if (!response.ok) {
      return new NextResponse(payload || "Delete failed", { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "application/json";
    return new NextResponse(payload, {
      status: response.status,
      headers: { "content-type": contentType },
    });
  } catch (error) {
    console.error("🔥 Failed to delete user:", error);
    return NextResponse.json({ detail: "Internal error" }, { status: 500 });
  }
}
