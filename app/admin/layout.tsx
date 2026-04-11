import type { ReactNode } from "react";

import { requireServerAdmin } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireServerAdmin();
  return children;
}
