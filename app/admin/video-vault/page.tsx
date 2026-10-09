import Link from "next/link";
import { requireServerAdmin } from "@/lib/adminSession";
import VideoVaultDashboard from "@/components/admin/VideoVaultDashboard";
export const dynamic="force-dynamic";
export default async function VideoVaultPage() {
  await requireServerAdmin();
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-white">
    <div className="flex items-center justify-between gap-3">
      <Link href="/admin" className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300">← Admin</Link>
      <Link href="/television-wolo" className="rounded-full border border-cyan-300/30 px-4 py-2 text-sm text-cyan-100">Television WOLO ↗</Link>
    </div>
    <VideoVaultDashboard />
  </main>;
}
