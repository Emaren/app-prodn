import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const res = await fetch(`${process.env.BACKEND_API}/api/admin/users`, {
      headers: {
        Authorization: "Bearer secretadmin",
      },
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

