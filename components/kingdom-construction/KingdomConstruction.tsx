import Link from "next/link";
export type KingdomNode={id:string;name:string;domain:string;source:string|null};
export default function KingdomConstruction({nodes,roleNames,views,preview}:{nodes:KingdomNode[];roleNames:string[];views:{id:string;name:string}[];preview:"PUBLIC_SOURCE_ONLY"|"ADMIN_DRY_RUN_ONLY"}){
 const ordered=[...nodes].sort((a,b)=>a.id.localeCompare(b.id));
 const center={x:480,y:290},radius=220;
 const positioned=ordered.map((node,i)=>({...node,x:center.x+Math.cos((2*Math.PI*i)/ordered.length)*radius,y:center.y+Math.sin((2*Math.PI*i)/ordered.length)*radius}));
 return <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 text-slate-100">
  <nav className="flex flex-wrap gap-4 text-cyan-200"><Link href="/kingdom-index">Kingdom Index</Link><Link href="/kingdom-intelligence">Kingdom Intelligence</Link><Link href="/admin/central-command">Central Command (admin)</Link></nav>
  <h1 className="text-3xl font-bold">{preview==="PUBLIC_SOURCE_ONLY"?"Kingdom Construction · Source Graph":"System Composer · Reviewed Dry-Run"}</h1>
  <p className="max-w-3xl text-sm text-amber-200">These {ordered.length} nodes represent named, proposed or source-present OS responsibilities, NOT {ordered.length} live workers. Live process identities, native leases, consent, deployment and receipts remain UNKNOWN until independently signed and verified. Composer cannot launch code or approve production.</p>
  <section aria-label="Real source organization, no live worker attestation" className="overflow-x-auto rounded-xl border border-white/20 p-4">
   <svg viewBox="0 0 960 580" role="img" aria-label="Graph of planned named OS responsibilities connected to the umbrella; all runtime states UNKNOWN" className="min-w-[600px] w-full" xmlns="http://www.w3.org/2000/svg">
    {positioned.map(node=><line key={"edge-"+node.id} x1={center.x} y1={center.y} x2={node.x} y2={node.y} stroke="#64748b" strokeWidth="1.5" strokeDasharray="6 7"/>)}
    <rect x="372" y="260" width="216" height="60" rx="12" fill="#0f172a" stroke="#38bdf8" strokeWidth="2"/>
    <text x="480" y="285" textAnchor="middle" fill="#e0f2fe" fontSize="16">AoE2WAR Umbrella</text>
    <text x="480" y="303" textAnchor="middle" fill="#fbbf24" fontSize="12">LIVE STATUS UNKNOWN</text>
    {positioned.map(node=><g key={node.id}>
     <circle cx={node.x} cy={node.y} r="45" fill="#0f172a" stroke="#64748b" strokeWidth="1.8"/>
     <text x={node.x} y={node.y-4} fill="#e2e8f0" textAnchor="middle" fontSize="11">{node.name.length>17?node.name.slice(0,16)+"…":node.name}</text>
     <text x={node.x} y={node.y+15} fill="#fbbf24" textAnchor="middle" fontSize="11">UNKNOWN</text>
    </g>)}
   </svg>
  </section>
  <section className="space-y-3"><h2 className="text-xl font-semibold">Evidence-linked source nodes</h2>
   <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ordered.map(node=><li key={node.id} className="rounded-xl border border-white/15 p-3"><h3 className="font-semibold">{node.name}</h3><p className="text-xs text-slate-400">{node.id}</p><p className="text-amber-200 text-sm">Runtime: UNKNOWN · Workers: UNVERIFIED</p>{node.source&&/^[A-Za-z0-9_./-]+$/.test(node.source)&&!node.source.includes("..")?<a className="text-cyan-300 underline" href={"https://github.com/Emaren/app-prodn/blob/58b239b0415480da5379e13703c953e0d0a7e969/"+node.source}>View source contract</a>:<span>Source link: UNAVAILABLE</span>}</li>)}</ul>
  </section>
  <section className="rounded-xl border border-white/20 p-4"><h2 className="text-xl font-semibold">Seven read-model visual contracts</h2><ul className="grid gap-2 md:grid-cols-2">{views.map(v=><li key={v.id}><strong>{v.name}</strong> · PROPOSED / EVIDENCE UNKNOWN</li>)}</ul>
    <p className="mt-3 text-sm text-slate-300">Doctor, Shepherd and Composer are roles, not extra OS worker processes: {roleNames.join(" · ")}. Plans are nonexecuting. Verified real receipt links may be admitted in later versions, never fabricated.</p>
  </section>
 </main>;
}
