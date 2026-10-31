import Link from "next/link";
import registry from "@/docs/document-registry.json";
export const dynamic="force-dynamic";
export default function DocumentsOsPage(){
 const docs=registry.documents.map(d=>({id:d.id,title:d.title,path:d.path,status:d.status,type:d.type,authority:d.authority,reviewedAt:d.reviewed_at}));
 return <main className="mx-auto max-w-6xl space-y-5 px-5 py-8 text-slate-100">
  <nav className="flex gap-4 text-cyan-300"><Link href="/admin/aoe2war-os">Admin OS</Link><Link href="/admin/backup-os">Backup OS</Link><Link href="/admin/code-health">Code Health</Link><Link href="/admin/storage-transfer">Storage Transfer</Link></nav>
  <h1 className="text-3xl font-bold">Documents OS · Source Registry</h1>
  <p>Static immutable build-time DocsV2 registry; this count is NOT a live external-docs-sync or deployed-Docs certificate. Actual document body and authenticated publication must be separately verified.</p>
  <p>Registry version {registry.schema_version}; records <strong>{docs.length}</strong>; generated {registry.generated_at}; implementation baseline {registry.implementation_baseline.commit}</p>
  <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-2">Document</th><th className="p-2">Status</th><th className="p-2">Authority</th><th className="p-2">Reviewed</th><th className="p-2">Source path</th></tr></thead><tbody>{docs.map(d=><tr className="border-t border-white/10" key={d.id}><td className="p-2">{d.title}</td><td className="p-2">{d.status}</td><td className="p-2">{d.authority}</td><td className="p-2">{d.reviewedAt}</td><td className="p-2"><code>{d.path}</code></td></tr>)}</tbody></table></div>
 </main>;
}
